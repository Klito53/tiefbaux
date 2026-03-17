"""Objektradar: Crawlt öffentliche Ausschreibungen von TED + Vergabe.NRW."""

from __future__ import annotations

import json
import logging
import math
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from ..models import Tender

# Background refresh state
_refresh_lock = threading.Lock()
_refresh_status: dict = {"running": False, "last_result": None}

logger = logging.getLogger(__name__)

TED_SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search"

# CPV-Codes für Tiefbau-relevante Ausschreibungen
TIEFBAU_CPV_CODES = [
    "45232000",  # Rohrleitungen und Kabelnetze
    "45232400",  # Kanalisationsarbeiten
    "45231300",  # Wasser- und Abwasserrohrleitungen
    "45232100",  # Wasserbauarbeiten (Nebenanlagen)
    "45232130",  # Regenwasserkanalisation
    "45232150",  # Arbeiten an Wasserverteilungsleitungen
    "45232410",  # Kanalisationsarbeiten
    "45232440",  # Bauarbeiten für Abwasserrohre
    "45232451",  # Entwässerungs- und Oberflächenarbeiten
    "44163000",  # Rohre und Zubehör
]

# NRW-Städte im Umkreis ~50km von Bonn
BONN_REGION_CITIES = {
    "bonn", "köln", "koeln", "cologne", "siegburg", "troisdorf", "sankt augustin",
    "bad honnef", "königswinter", "hennef", "much", "lohmar", "niederkassel",
    "wesseling", "brühl", "bornheim", "meckenheim", "rheinbach", "euskirchen",
    "bad münstereifel", "swisttal", "alfter", "wachtberg", "remagen", "sinzig",
    "bad neuenahr-ahrweiler", "linz", "unkel", "neuwied", "andernach",
    "leverkusen", "bergisch gladbach", "rösrath", "overath", "windeck",
    "eitorf", "bad godesberg", "beuel", "duisdorf", "mehlem",
}

# Relevanz-Scoring: Keywords mit Gewichtung
HIGH_RELEVANCE = [
    "kanalbau", "kanalisation", "rohrleitung", "rohrleitungsbau",
    "entwässerung", "schachtbauwerk", "straßenentwässerung",
    "kanalrohr", "abwasserkanal", "regenwasserkanal", "mischwasserkanal",
    "kanalsanierung", "kanalerneuerung", "schachtbauwerke",
    "rohrvortrieb", "grabenlose", "abwasserleitung",
]
MEDIUM_RELEVANCE = [
    "tiefbau", "erschließung", "regenwasser", "wasserleit",
    "erdarbeiten", "leitungsbau", "infrastruktur", "versorgungsleitung",
    "hausanschluss", "druckrohr", "trinkwasserleitung",
]
LOW_RELEVANCE = [
    "hochbau", "elektro", "heizung", "lüftung", "sanitär",
    "dacharbeiten", "fassade", "estrich", "trockenbau",
    "aufzug", "brandschutz", "glasfaser", "telekommunikation",
]

# Nominatim geocoding
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

# Known city coordinates (cache to avoid Nominatim rate limits)
CITY_COORDS: dict[str, tuple[float, float]] = {
    "bonn": (50.7374, 7.0982),
    "köln": (50.9375, 6.9603),
    "koeln": (50.9375, 6.9603),
    "cologne": (50.9375, 6.9603),
    "siegburg": (50.7987, 7.2035),
    "troisdorf": (50.8157, 7.1553),
    "sankt augustin": (50.7705, 7.1867),
    "bad honnef": (50.6443, 7.2281),
    "königswinter": (50.6743, 7.1839),
    "hennef": (50.7755, 7.2836),
    "wesseling": (50.8269, 6.9742),
    "brühl": (50.8284, 6.9050),
    "bornheim": (50.7601, 6.9979),
    "meckenheim": (50.6268, 7.0281),
    "rheinbach": (50.6267, 6.9488),
    "euskirchen": (50.6608, 6.7878),
    "leverkusen": (51.0459, 6.9841),
    "bergisch gladbach": (50.9918, 7.1362),
    "remagen": (50.5740, 7.2280),
    "bad neuenahr-ahrweiler": (50.5474, 7.1127),
    "neuwied": (50.4286, 7.4615),
    "düsseldorf": (51.2277, 6.7735),
    "düren": (50.8004, 6.4822),
    "mönchengladbach": (51.1805, 6.4428),
    "wuppertal": (51.2562, 7.1508),
    "krefeld": (51.3388, 6.5853),
    "solingen": (51.1652, 7.0671),
    "ratingen": (51.2973, 6.8494),
    "hilden": (51.1674, 6.9307),
    "monheim am rhein": (51.0909, 6.8812),
    "lohmar": (50.8402, 7.2127),
    "münchen": (48.1351, 11.5820),
    "berlin": (52.5200, 13.4050),
    "hamburg": (53.5511, 9.9937),
    "dresden": (51.0504, 13.7373),
    "kiel": (54.3233, 10.1228),
    "nürnberg": (49.4521, 11.0767),
    "würzburg": (49.7913, 9.9534),
    "bocholt": (51.8387, 6.6155),
    "mettmann": (51.2528, 6.9778),
    "kaarst": (51.2297, 6.6175),
    "bornheim": (50.7601, 6.9979),
    "altenburg": (50.9852, 12.4341),
    "troisdorf": (50.8157, 7.1553),
    "troisdorf-sieglar": (50.8023, 7.1277),
}


@dataclass
class TenderResult:
    external_id: str
    title: str
    description: str | None
    auftraggeber: str | None
    ort: str | None
    cpv_codes: list[str]
    submission_deadline: str | None
    publication_date: str | None
    url: str | None
    relevance_score: int = 0
    lat: float | None = None
    lng: float | None = None


def _compute_relevance(title: str, description: str | None) -> int:
    """Score 0-100 basierend auf Keywords in Titel und Beschreibung."""
    text = (title + " " + (description or "")).lower()
    score = 0

    for kw in HIGH_RELEVANCE:
        if kw in text:
            score += 15
    for kw in MEDIUM_RELEVANCE:
        if kw in text:
            score += 8
    for kw in LOW_RELEVANCE:
        if kw in text:
            score -= 10

    return max(0, min(100, score))


BONN_LAT, BONN_LNG = 50.7374, 7.0982
MAX_RADIUS_KM = 50


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Berechnet Distanz in km zwischen zwei Koordinaten (Haversine)."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _is_in_region(city: str | None, lat: float | None = None, lng: float | None = None) -> bool:
    """Prüft ob der Ort im Bonn-Umkreis (50km) liegt.

    Nutzt Koordinaten wenn vorhanden, sonst Stadtname-Lookup.
    """
    # Coordinate-based check (most reliable)
    if lat is not None and lng is not None:
        return _haversine_km(BONN_LAT, BONN_LNG, lat, lng) <= MAX_RADIUS_KM

    # City name fallback
    if not city:
        return False  # Kein Ort und keine Koordinaten = ausfiltern
    return city.lower().strip() in BONN_REGION_CITIES


def _geocode_city(city: str) -> tuple[float, float] | None:
    """Geocoding via Nominatim (OSM). Rate-limited: 1 req/sec. Cached."""
    city_lower = city.lower().strip()
    if city_lower in CITY_COORDS:
        return CITY_COORDS[city_lower]

    # Avoid too many external API calls — skip if not in cache
    # Nominatim is slow and rate-limited, only geocode top-priority cities
    try:
        time.sleep(1.1)  # Nominatim rate limit
        resp = httpx.get(
            NOMINATIM_URL,
            params={"q": f"{city}, Deutschland", "format": "json", "limit": 1},
            headers={"User-Agent": "TiefbauX/1.0"},
            timeout=10,
        )
        if resp.status_code == 200:
            results = resp.json()
            if results:
                lat = float(results[0]["lat"])
                lng = float(results[0]["lon"])
                CITY_COORDS[city_lower] = (lat, lng)
                return (lat, lng)
    except Exception as e:
        logger.warning("Geocoding failed for %s: %s", city, e)

    return None


def _extract_field(notice: dict, key: str, lang: str = "deu") -> str | None:
    """Extrahiert Feld aus TED-Antwort (kann dict, list oder str sein)."""
    val = notice.get(key)
    return _unwrap_value(val, lang)


def _unwrap_value(val: object, lang: str = "deu") -> str | None:
    """Rekursiv einen skalaren String aus verschachtelten TED-Datenstrukturen extrahieren."""
    if val is None:
        return None
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        # Try language keys first
        result = val.get(lang) or val.get("mul") or next(iter(val.values()), None)
        return _unwrap_value(result, lang)
    if isinstance(val, list):
        if not val:
            return None
        return _unwrap_value(val[0], lang)
    return str(val)


def _extract_list_field(notice: dict, key: str) -> list[str]:
    """Extrahiert Listen-Feld."""
    val = notice.get(key)
    if val is None:
        return []
    if isinstance(val, list):
        return [str(v) for v in val]
    return [str(val)]


def _clean_html(text: str | list | None) -> str | None:
    """Entfernt HTML-Entities und Tags."""
    if text is None:
        return None
    if isinstance(text, list):
        text = " ".join(str(t) for t in text)
    text = str(text)
    text = text.replace("&#92;n", "\n").replace("&#10;", "\n")
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&\w+;", " ", text)
    return text.strip()


def fetch_tenders_from_ted(
    cpv_codes: list[str] | None = None,
    region_filter: bool = True,
    limit: int = 100,
) -> list[TenderResult]:
    """Sucht Ausschreibungen über die TED API.

    Args:
        cpv_codes: CPV-Codes zum Filtern (default: TIEFBAU_CPV_CODES)
        region_filter: Nur Bonn-Region (default: True)
        limit: Max. Anzahl Ergebnisse
    """
    if cpv_codes is None:
        cpv_codes = TIEFBAU_CPV_CODES

    # Build query: CPV-Codes OR-verknüpft + Deutschland
    cpv_query = " OR ".join(f"BT-262-Procedure={c}" for c in cpv_codes)
    query = f"({cpv_query}) AND organisation-country-buyer=DEU"

    fields = [
        "BT-21-Procedure",       # Titel
        "organisation-name-buyer",  # Auftraggeber
        "buyer-city",            # Stadt des Auftraggebers
        "organisation-city-buyer",
        "deadline-receipt-tender-date-lot",  # Abgabefrist
        "submission-url-lot",    # URL zur Vergabeplattform
        "classification-cpv",    # CPV-Codes
        "description-lot",       # Beschreibung
        "publication-date",      # Veröffentlichungsdatum
        "title-lot",             # Los-Titel
    ]

    try:
        resp = httpx.post(
            TED_SEARCH_URL,
            json={
                "query": query,
                "fields": fields,
                "limit": limit,
                "page": 1,
                "scope": "ALL",
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("TED API error: %s", e)
        return []

    notices = data.get("notices", [])
    logger.info("TED API returned %d notices (total: %s)", len(notices), data.get("totalNoticeCount"))

    results: list[TenderResult] = []
    for notice in notices:
        ext_id = notice.get("publication-number", "")
        if not ext_id:
            continue

        title = _extract_field(notice, "BT-21-Procedure") or _extract_field(notice, "title-lot") or ""
        description = _clean_html(_extract_field(notice, "description-lot"))
        auftraggeber = _extract_field(notice, "organisation-name-buyer")
        city = _extract_field(notice, "buyer-city") or _extract_field(notice, "organisation-city-buyer")
        deadline = _extract_field(notice, "deadline-receipt-tender-date-lot")
        pub_date = notice.get("publication-date")
        url_list = _extract_list_field(notice, "submission-url-lot")
        cpv_list = _extract_list_field(notice, "classification-cpv")

        # Deduplicate CPV codes
        cpv_list = list(dict.fromkeys(cpv_list))

        # Relevance scoring
        relevance = _compute_relevance(title, description)
        if relevance < 10:
            continue

        # URL
        url = url_list[0] if url_list else f"https://ted.europa.eu/de/notice/-/detail/{ext_id}"

        # Geocoding
        lat, lng = None, None
        if city:
            coords = _geocode_city(city)
            if coords:
                lat, lng = coords

        # Region filter (after geocoding so we can use coordinates)
        if region_filter and not _is_in_region(city, lat, lng):
            continue

        results.append(TenderResult(
            external_id=f"TED-{ext_id}",
            title=title,
            description=description[:500] if description else None,
            auftraggeber=auftraggeber,
            ort=city,
            cpv_codes=cpv_list,
            submission_deadline=deadline,
            publication_date=str(pub_date) if pub_date else None,
            url=url,
            relevance_score=relevance,
            lat=lat,
            lng=lng,
        ))

    # Sort by relevance
    results.sort(key=lambda r: r.relevance_score, reverse=True)
    logger.info("Filtered to %d relevant tenders in region", len(results))
    return results


def save_tenders(db: Session, tenders: list[TenderResult]) -> int:
    """Speichert neue Ausschreibungen in der DB. Gibt Anzahl neuer Einträge zurück."""
    new_count = 0
    for t in tenders:
        existing = db.query(Tender).filter(Tender.external_id == t.external_id).first()
        if existing:
            # Update relevance score if changed
            if existing.relevance_score != t.relevance_score:
                existing.relevance_score = t.relevance_score
            continue

        tender = Tender(
            external_id=t.external_id,
            title=t.title,
            description=t.description,
            auftraggeber=t.auftraggeber,
            ort=t.ort,
            cpv_codes=json.dumps(t.cpv_codes),
            submission_deadline=t.submission_deadline,
            publication_date=t.publication_date,
            url=t.url,
            status="neu",
            relevance_score=t.relevance_score,
            lat=t.lat,
            lng=t.lng,
        )
        db.add(tender)
        new_count += 1

    db.commit()
    logger.info("Saved %d new tenders to DB", new_count)
    return new_count


def fetch_tenders_from_vergabe_nrw(
    cpv_prefixes: list[str] | None = None,
    region_filter: bool = True,
) -> list[TenderResult]:
    """Holt Ausschreibungen vom Vergabe.NRW OpenData-Endpoint (Rheinland + Köln).

    Die Endpoints liefern ZIP-Dateien mit eForms-XML pro Ausschreibung.
    """
    if cpv_prefixes is None:
        cpv_prefixes = ["45232", "45231", "44163", "45233"]

    # Rheinland (Bonn, Düsseldorf, etc.) + Köln
    endpoints = {
        "Rheinland": "https://www.vmp-rheinland.de/VMPSatellite/opendata?id=35eb26cf-9d6c-4780-903a-89059f382b03",
        "Koeln": "https://vergabe.stadt-koeln.de/VMPSatellite/opendata?id=f8f65333-9078-451c-8628-09376a7fbfcb",
    }

    NS = {
        "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
        "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    }

    results: list[TenderResult] = []

    for source_name, url in endpoints.items():
        try:
            resp = httpx.get(url, timeout=60, follow_redirects=True)
            resp.raise_for_status()
        except Exception as e:
            logger.error("Failed to fetch %s: %s", source_name, e)
            continue

        import io
        import zipfile
        import xml.etree.ElementTree as ET

        try:
            zf = zipfile.ZipFile(io.BytesIO(resp.content))
        except zipfile.BadZipFile:
            logger.error("%s: Response is not a valid ZIP", source_name)
            continue

        logger.info("%s: ZIP contains %d XMLs", source_name, len(zf.namelist()))

        for xml_name in zf.namelist():
            try:
                root = ET.fromstring(zf.read(xml_name))

                # CPV codes
                cpvs = list({
                    el.text for el in root.findall(".//cbc:ItemClassificationCode", NS)
                    if el.text
                })
                is_relevant = any(
                    c.startswith(tuple(cpv_prefixes)) for c in cpvs
                )
                if not is_relevant:
                    continue

                # Title (use buyer name as fallback)
                title_el = root.find(".//cac:ProcurementProject/cbc:Name", NS)
                buyer_el = root.find(".//cac:PartyName/cbc:Name", NS)
                title = (title_el.text if title_el is not None else None) or \
                        (buyer_el.text if buyer_el is not None else xml_name)

                # Description
                desc_el = root.find(".//cac:ProcurementProject/cbc:Description", NS)
                description = desc_el.text[:500] if desc_el is not None and desc_el.text else None

                # Buyer
                auftraggeber = buyer_el.text if buyer_el is not None else None

                # City
                city_el = root.find(".//cac:RealizedLocation//cbc:CityName", NS)
                city = city_el.text if city_el is not None else None

                # Deadline
                deadline_el = root.find(".//cbc:EndDate", NS)
                deadline = deadline_el.text if deadline_el is not None else None

                # URL
                url_el = root.find(".//cbc:AccessToolsURI", NS)
                tender_url = url_el.text if url_el is not None else None

                # Notice ID
                id_el = root.find('.//cbc:ID[@schemeName="notice-id"]', NS)
                ext_id = id_el.text if id_el is not None else xml_name.replace(".xml", "")

                # Issue date
                issue_el = root.find(".//cbc:IssueDate", NS)
                pub_date = issue_el.text if issue_el is not None else None

                # Relevance
                relevance = _compute_relevance(title, description)

                # Geocoding
                lat, lng = None, None
                if city:
                    coords = _geocode_city(city)
                    if coords:
                        lat, lng = coords

                # Region filter (after geocoding for coordinate-based check)
                if region_filter and not _is_in_region(city, lat, lng):
                    continue

                results.append(TenderResult(
                    external_id=f"NRW-{ext_id}",
                    title=title,
                    description=description,
                    auftraggeber=auftraggeber,
                    ort=city,
                    cpv_codes=cpvs,
                    submission_deadline=deadline,
                    publication_date=pub_date,
                    url=tender_url,
                    relevance_score=max(relevance, 15),  # Min 15 da CPV schon relevant
                    lat=lat,
                    lng=lng,
                ))

            except ET.ParseError:
                continue
            except Exception as e:
                logger.debug("Error parsing %s/%s: %s", source_name, xml_name, e)

    results.sort(key=lambda r: r.relevance_score, reverse=True)
    logger.info("Vergabe.NRW: %d relevant tenders found", len(results))
    return results


def _cleanup_out_of_region(db: Session) -> int:
    """Entfernt bestehende Ausschreibungen die außerhalb des 50km-Radius liegen."""
    all_tenders = db.query(Tender).all()
    removed = 0
    for t in all_tenders:
        if not _is_in_region(t.ort, t.lat, t.lng):
            db.delete(t)
            removed += 1
    if removed:
        db.commit()
        logger.info("Removed %d out-of-region tenders", removed)
    return removed


def refresh_tenders(db: Session) -> dict:
    """Hauptfunktion: Holt neue Ausschreibungen von allen Quellen."""
    logger.info("Starting tender refresh...")

    # Cleanup: Remove existing out-of-region tenders
    _cleanup_out_of_region(db)

    # Source 1: Vergabe.NRW (regional, auch unterschwellig)
    nrw_tenders = fetch_tenders_from_vergabe_nrw()
    nrw_new = save_tenders(db, nrw_tenders)

    # Source 2: TED (EU-Schwellenwert)
    ted_tenders = fetch_tenders_from_ted()
    ted_new = save_tenders(db, ted_tenders)

    total = db.query(Tender).count()
    return {
        "fetched": len(nrw_tenders) + len(ted_tenders),
        "new": nrw_new + ted_new,
        "total": total,
        "sources": {
            "vergabe_nrw": {"fetched": len(nrw_tenders), "new": nrw_new},
            "ted": {"fetched": len(ted_tenders), "new": ted_new},
        },
    }


def refresh_tenders_background(db_factory) -> None:
    """Startet Refresh in Background-Thread."""
    global _refresh_status

    if _refresh_status["running"]:
        return

    def _run():
        global _refresh_status
        _refresh_status = {"running": True, "last_result": None}
        db = db_factory()
        try:
            result = refresh_tenders(db)
            _refresh_status = {"running": False, "last_result": result}
            logger.info("Background refresh done: %s", result)
        except Exception as e:
            _refresh_status = {"running": False, "last_result": {"error": str(e)}}
            logger.error("Background refresh failed: %s", e)
        finally:
            db.close()

    t = threading.Thread(target=_run, daemon=True)
    t.start()


def get_refresh_status() -> dict:
    return _refresh_status
