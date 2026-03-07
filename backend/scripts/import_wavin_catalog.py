"""Import Wavin product catalog PDF into the TiefbauX database using Gemini for extraction."""

from __future__ import annotations

import io
import json
import logging
import sys
from pathlib import Path
from typing import Any

import httpx
import pdfplumber

# Add backend to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.database import SessionLocal, engine
from app.models import Base, Product

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

PAGE_BATCH_SIZE = 3
PAGE_OVERLAP = 0

SYSTEM_INSTRUCTION = (
    "Du bist ein Datenbank-Experte fuer Tiefbau-Produkte. "
    "Du extrahierst Produktdaten aus Preislisten-Tabellen.\n\n"
    "Extrahiere ALLE Produkte aus den Tabellen auf diesen Seiten. "
    "Jede Zeile in einer Produkttabelle ist ein separates Produkt.\n\n"
    "Gib ein JSON-Array zurueck. Jedes Objekt hat diese Felder:\n"
    "- artikel_nr: string (die 7-stellige Artikelnummer, z.B. '3042330')\n"
    "- artikelname: string (vollstaendiger Name, z.B. 'Wavin KG Rohr DN110 1000mm')\n"
    "- artikelbeschreibung: string (Tabellenbezeichnung + Produktgruppe, z.B. 'KG Mehrschicht Rohr mit einseitiger Steckmuffe KG-EM PVC DN110 L=1000mm')\n"
    "- kategorie: string (eine von: Kanalrohre, Schachtbauteile, Schachtabdeckungen, "
    "Formstuecke, Dichtungen & Zubehoer, Strassenentwässerung, Rinnen, "
    "Versickerung, Regenwasser, Kabelschutz)\n"
    "- unterkategorie: string (z.B. 'KG-Rohre', 'KG-Boegen', 'KG-Abzweige', 'KG-Reduzierstueck', "
    "'Tegra Schachtboden', 'Tegra Schachtrohr', 'Tegra Konus', 'Tegra Abdeckung', "
    "'Green Connect Rohr', 'Acaro Rohr', 'Strassenablauf', 'Dichtung', etc.)\n"
    "- werkstoff: string | null (PVC-U, PP, PE, PP-HM, PP-MD, Beton, Guss, etc.)\n"
    "- nennweite_dn: integer | null (DN-Wert, z.B. 110, 160, 200, 250, 315, 400, 500)\n"
    "- nennweite_od: integer | null (Aussendurchmesser in mm wenn angegeben)\n"
    "- laenge_mm: integer | null (Laenge in mm)\n"
    "- hoehe_mm: integer | null (Hoehe H in mm wenn angegeben)\n"
    "- wandstaerke_mm: number | null (Wandstaerke e in mm)\n"
    "- gewicht_kg: number | null (Gewicht in kg wenn angegeben)\n"
    "- belastungsklasse: string | null (A15, B125, C250, D400, E600, F900)\n"
    "- steifigkeitsklasse: string | null (SN4, SN8, SN16)\n"
    "- norm: string | null (DIN EN 13476-2, DIN EN 1401, DIN EN 1917, etc.)\n"
    "- preis_eur_stk: number | null (Preis in EUR/Stk)\n"
    "- preis_eur_m: number | null (Preis in EUR/m wenn angegeben)\n"
    "- verpackungseinheit: integer | null (VP-EH Stk/Pal)\n"
    "- winkel_grad: integer | null (Winkel bei Boegen: 15, 30, 45, 67, 87)\n"
    "- dn_anschluss: integer | null (zweiter DN bei Abzweigen/Reduzierstuecken)\n"
    "- system_familie: string | null ('Wavin KG', 'Wavin Tegra', 'Wavin Green Connect', 'Wavin Acaro', 'Wavin X-Stream', etc.)\n\n"
    "REGELN:\n"
    "- Ueberspringe Ueberschriften, Bildseiten und Textbloecke ohne Produkttabellen\n"
    "- Wenn eine Zeile 'auf Anfrage' statt Artikel-Nr hat, setze artikel_nr auf null\n"
    "- Preise als Zahl ohne Waehrungssymbol (z.B. 15.75 nicht '15,75 EUR')\n"
    "- Deutsche Kommazahlen umwandeln: '15,75' -> 15.75\n"
    "- Bei KG-Rohren: Laenge steht oft als L-Spalte in mm (1.000 = 1000mm, 2.000 = 2000mm, 5.000 = 5000mm)\n"
    "- Jede Tabellenzeile = ein Produkt, auch wenn Bezeichnungen sich wiederholen\n"
    "- Gib NUR das JSON-Array zurueck, keine Erklaerung\n"
    "- Wenn die Seiten keine Produkttabellen enthalten, gib ein leeres Array [] zurueck"
)


def extract_pages(pdf_path: str) -> list[str]:
    pages: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
    return pages


def create_batches(pages: list[str]) -> list[tuple[int, list[str]]]:
    if not pages:
        return []
    batches: list[tuple[int, list[str]]] = []
    start = 0
    while start < len(pages):
        end = min(start + PAGE_BATCH_SIZE, len(pages))
        batches.append((start, pages[start:end]))
        next_start = end - PAGE_OVERLAP
        if next_start <= start:
            break
        start = next_start
    return batches


def call_gemini(page_texts: list[str], page_offset: int) -> list[dict[str, Any]]:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    pages_block = ""
    for i, text in enumerate(page_texts):
        pages_block += f"\n--- Seite {page_offset + i + 1} ---\n{text}\n"

    prompt = f"Extrahiere alle Produkte aus diesen Preislisten-Seiten:\n{pages_block}"

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "maxOutputTokens": 65536,
        },
    }

    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
        f"?key={settings.gemini_api_key}"
    )

    with httpx.Client(timeout=120) as client:
        response = client.post(endpoint, json=payload)

    if response.status_code >= 400:
        raise RuntimeError(f"Gemini API error: {response.status_code} {response.text}")

    data = response.json()
    try:
        content = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected Gemini response: {data}") from exc

    # Normalize: strip markdown fences if present
    text = content.strip()
    if text.startswith("```"):
        first_newline = text.index("\n")
        text = text[first_newline + 1:]
    if text.endswith("```"):
        text = text[:-3].strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Try to repair truncated JSON: find last complete object
        parsed = _repair_truncated_json(text)

    if not isinstance(parsed, list):
        raise RuntimeError("Gemini did not return a JSON array")
    return parsed


def _repair_truncated_json(text: str) -> list[dict[str, Any]]:
    """Attempt to recover products from truncated JSON output."""
    # Find the last complete "}" before truncation
    last_brace = text.rfind("}")
    if last_brace == -1:
        raise RuntimeError(f"Cannot repair JSON: no closing brace found")

    # Try progressively shorter substrings
    for end in range(last_brace + 1, max(last_brace - 500, 0), -1):
        candidate = text[:end]
        # Close the array
        candidate = candidate.rstrip().rstrip(",") + "\n]"
        try:
            result = json.loads(candidate)
            if isinstance(result, list):
                logger.info("Repaired truncated JSON: recovered %d items", len(result))
                return result
        except json.JSONDecodeError:
            continue

    raise RuntimeError("Cannot repair truncated JSON")


def deduplicate(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    no_id: list[dict[str, Any]] = []
    for p in products:
        art_nr = p.get("artikel_nr")
        if not art_nr:
            no_id.append(p)
            continue
        if art_nr not in seen:
            seen[art_nr] = p
    return list(seen.values()) + no_id


def _to_float(val: Any) -> float | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        cleaned = val.replace(",", ".").replace(" ", "").replace("€", "")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _to_int(val: Any) -> int | None:
    if val is None:
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, float):
        return int(val)
    if isinstance(val, str):
        cleaned = val.replace(".", "").replace(",", "").replace(" ", "").replace("mm", "")
        try:
            return int(cleaned)
        except ValueError:
            return None
    return None


def _guess_norm(raw: dict[str, Any]) -> str | None:
    norm = raw.get("norm")
    if norm:
        return norm
    # Infer from system family
    system = (raw.get("system_familie") or "").lower()
    werkstoff = (raw.get("werkstoff") or "").lower()
    if "kg" in system and "pvc" in werkstoff:
        return "DIN EN 1401"
    if "acaro" in system or ("pp" in werkstoff and "rohr" in (raw.get("kategorie") or "").lower()):
        return "DIN EN 13476-2"
    if "tegra" in system:
        return "DIN EN 13598-2"
    if "green connect" in system:
        return "DIN EN 13476-3"
    return None


def build_product(raw: dict[str, Any], idx: int) -> Product | None:
    art_nr = raw.get("artikel_nr")
    if not art_nr:
        return None

    art_nr = str(art_nr).strip()
    artikelname = raw.get("artikelname", "")
    if not artikelname:
        return None

    # Determine price — prefer per-piece, fall back to per-meter
    preis = _to_float(raw.get("preis_eur_stk"))
    preiseinheit = "Stk"
    if preis is None:
        preis = _to_float(raw.get("preis_eur_m"))
        if preis is not None:
            preiseinheit = "m"

    # Build compatible DN string for fittings
    dn_anschluss = _to_int(raw.get("dn_anschluss"))
    dn_main = _to_int(raw.get("nennweite_dn"))
    kompatible_dn = None
    if dn_anschluss and dn_main and dn_anschluss != dn_main:
        kompatible_dn = f"{dn_main},{dn_anschluss}"
    elif dn_main:
        kompatible_dn = str(dn_main)

    return Product(
        artikel_id=f"WAV-{art_nr}",
        hersteller="Wavin GmbH",
        hersteller_artikelnr=art_nr,
        artikelname=artikelname,
        artikelbeschreibung=raw.get("artikelbeschreibung"),
        kategorie=raw.get("kategorie"),
        unterkategorie=raw.get("unterkategorie"),
        werkstoff=raw.get("werkstoff"),
        nennweite_dn=dn_main,
        nennweite_od=_to_int(raw.get("nennweite_od")),
        laenge_mm=_to_int(raw.get("laenge_mm")),
        hoehe_mm=_to_int(raw.get("hoehe_mm")),
        wandstaerke_mm=_to_float(raw.get("wandstaerke_mm")),
        gewicht_kg=_to_float(raw.get("gewicht_kg")),
        belastungsklasse=raw.get("belastungsklasse"),
        steifigkeitsklasse_sn=raw.get("steifigkeitsklasse"),
        norm_primaer=_guess_norm(raw),
        system_familie=raw.get("system_familie"),
        kompatible_dn_anschluss=kompatible_dn,
        vk_listenpreis_netto=preis,
        waehrung="EUR",
        preiseinheit=preiseinheit,
        # Simulate reasonable stock and delivery for demo
        lager_gesamt=50,
        lager_rheinbach=30,
        lager_duesseldorf=20,
        lieferant_1_lieferzeit_tage=3,
        status="aktiv",
    )


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not pdf_path:
        # Try to find the Wavin PDF in project root
        project_root = Path(__file__).resolve().parents[2]
        candidates = list(project_root.glob("Wavin*.pdf"))
        if not candidates:
            logger.error("No Wavin PDF found. Pass path as argument.")
            sys.exit(1)
        pdf_path = str(candidates[0])

    logger.info("Extracting text from %s", pdf_path)
    pages = extract_pages(pdf_path)
    logger.info("Extracted %d pages with text", len(pages))

    # Skip cover pages, ToC, image-only pages (first ~5 pages)
    # and appendix pages (last ~10 pages)
    content_pages = pages[5:-10] if len(pages) > 20 else pages
    logger.info("Processing %d content pages (skipping cover/appendix)", len(content_pages))

    batches = create_batches(content_pages)
    logger.info("Created %d batches", len(batches))

    all_raw: list[dict[str, Any]] = []
    for batch_idx, (page_offset, batch_pages) in enumerate(batches):
        try:
            result = call_gemini(batch_pages, page_offset + 5)  # +5 for skipped pages
            all_raw.extend(result)
            logger.info(
                "Batch %d/%d (pages %d-%d): %d products found",
                batch_idx + 1, len(batches),
                page_offset + 6, page_offset + 5 + len(batch_pages),
                len(result),
            )
        except Exception as exc:
            logger.warning("Batch %d failed: %s", batch_idx + 1, exc)

    logger.info("Total raw products extracted: %d", len(all_raw))

    deduped = deduplicate(all_raw)
    logger.info("After deduplication: %d products", len(deduped))

    # Build Product objects
    products: list[Product] = []
    for idx, raw in enumerate(deduped):
        product = build_product(raw, idx)
        if product:
            products.append(product)

    logger.info("Valid products to import: %d", len(products))

    if not products:
        logger.error("No products to import!")
        sys.exit(1)

    # Save raw extraction results for debugging
    debug_path = Path(__file__).parent / "wavin_extracted.json"
    with open(debug_path, "w") as f:
        json.dump(deduped, f, indent=2, ensure_ascii=False)
    logger.info("Raw extraction saved to %s", debug_path)

    # Import into database
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Remove old Wavin products
        deleted = db.query(Product).filter(Product.hersteller == "Wavin GmbH").delete()
        logger.info("Removed %d existing Wavin products", deleted)

        # Also remove old test data
        deleted_test = db.query(Product).filter(Product.artikel_id.like("ART-%")).delete()
        if deleted_test:
            logger.info("Removed %d old test products", deleted_test)

        db.add_all(products)
        db.commit()
        logger.info("Successfully imported %d Wavin products!", len(products))

        # Print summary by category
        from sqlalchemy import func
        summary = (
            db.query(Product.kategorie, func.count())
            .filter(Product.hersteller == "Wavin GmbH")
            .group_by(Product.kategorie)
            .all()
        )
        logger.info("--- Import Summary ---")
        for cat, count in sorted(summary, key=lambda x: x[1], reverse=True):
            logger.info("  %s: %d products", cat or "Unbekannt", count)
    finally:
        db.close()


if __name__ == "__main__":
    main()
