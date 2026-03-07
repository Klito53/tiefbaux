"""LLM-first LV parsing: Gemini extracts positions, quantities, classification and parameters in one pass."""

from __future__ import annotations

import io
import json
import logging
from typing import Any

import httpx
import pdfplumber

from ..config import settings
from ..schemas import LVPosition, TechnicalParameters
from .ai_interpreter import InterpretationError, _infer_with_heuristics, _normalize_json_array

logger = logging.getLogger(__name__)

PAGE_BATCH_SIZE = 8
PAGE_OVERLAP = 1

SYSTEM_INSTRUCTION = (
    "Du bist ein erfahrener Tiefbau-Fachberater bei einem Baustoffhaendler. "
    "Du analysierst Leistungsverzeichnisse (LV) aus Bauausschreibungen.\n\n"
    "Deine Aufgabe:\n"
    "1. Finde ALLE bepreisbaren Positionen im Text. Eine Position hat eine Ordnungszahl "
    "(z.B. '1.5.3'), eine Beschreibung, eine Menge und eine Einheit.\n"
    "2. Klassifiziere jede Position als 'material' oder 'dienstleistung'.\n"
    "3. Extrahiere technische Parameter fuer Material-Positionen.\n\n"
    "Regeln fuer die Klassifikation:\n"
    "- 'material': Positionen die ein physisches Produkt erfordern das geliefert werden muss "
    "(Rohre, Schachtteile, Abdeckungen, Formstücke, Rinnen, Dichtungen, Geotextilien, Vlies, "
    "Kies, Sand zum Einbau etc.)\n"
    "- 'dienstleistung': Reine Arbeitsleistungen OHNE Materialbedarf aus dem Baustoffhandel: "
    "Abbruch, Demontage, Rueckbau, Erdarbeiten (Aushub, Verfuellung, Verdichtung, Planum), "
    "Transport, Entsorgung, Baustelleneinrichtung, Vermessung, Verkehrssicherung, "
    "Wasserhaltung, Stundenlohnarbeiten, Vorhaltung, Sperrung, Druckprobe, Absicherung, "
    "Roden, Aufnehmen und Entsorgen von Bestandsmaterial (Pflaster, Asphalt, Bordsteine, "
    "Zaeune, Tore, Leuchten etc.), Ausbauen bestehender Leitungen/Schaechte\n"
    "- WICHTIG: 'aufnehmen und entsorgen', 'ausbauen und entsorgen', 'abbrechen', 'demontieren', "
    "'rueckbauen', 'roden', 'entfernen' = IMMER 'dienstleistung', auch wenn technische Begriffe "
    "wie DN oder Schacht vorkommen!\n"
    "- Wenn eine Position Material UND Einbauarbeit beschreibt (z.B. 'KG-Rohr DN150 liefern und "
    "verlegen'), klassifiziere als 'material'.\n\n"
    "Erkenne alle gaengigen Einheiten: m, m2, m², m3, m³, Stk, Stck, St, Stueck, kg, to, t, "
    "h, Std, StD, lfm, lfdm, lfd.m, Psch, psch, Pausch, Wo, mWo, cbm, etc.\n\n"
    "Gib ein JSON-Array zurueck. Jedes Objekt hat diese Felder:\n"
    "- ordnungszahl: string (z.B. '1.5.3')\n"
    "- description: string (Kurzbeschreibung der Position, max 120 Zeichen)\n"
    "- quantity: number | null\n"
    "- unit: string | null\n"
    "- position_type: 'material' | 'dienstleistung'\n"
    "- product_category: string | null (nur fuer material; verwende nur: Kanalrohre, "
    "Schachtabdeckungen, Schachtbauteile, Formstuecke, Strassenentwässerung, Rinnen, "
    "Dichtungen & Zubehoer, Geotextilien)\n"
    "- product_subcategory: string | null\n"
    "- material: string | null (PP, PVC-U, Stahlbeton, Beton, Gusseisen, HDPE, Steinzeug)\n"
    "- nominal_diameter_dn: integer | null\n"
    "- load_class: string | null (A15, B125, C250, D400, E600, F900)\n"
    "- norm: string | null\n"
    "- reference_product: string | null\n"
    "- installation_area: string | null (Fahrbahn, Gehweg, Erdeinbau)\n\n"
    "Fuer Dienstleistungs-Positionen setze alle technischen Parameter auf null.\n"
    "Ueberspringe Ueberschriften (z.B. '1.5 Entwaesserungsleitungen'), Vorbemerkungen, "
    "Hinweise und nicht-bepreisbare Zeilen (ohne Menge/Einheit).\n"
    "Gib NUR das JSON-Array zurueck, keine Erklaerung."
)


def extract_raw_text_pages(pdf_bytes: bytes) -> list[str]:
    """Extract raw text per page using pdfplumber."""
    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
    return pages


def _create_page_batches(pages: list[str]) -> list[tuple[int, list[str]]]:
    """Split pages into overlapping batches. Returns (page_offset, page_texts) tuples."""
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


def _build_batch_prompt(page_texts: list[str], page_offset: int) -> str:
    pages_block = ""
    for i, text in enumerate(page_texts):
        pages_block += f"\n--- Seite {page_offset + i + 1} ---\n{text}\n"
    return f"Analysiere den folgenden LV-Text und extrahiere alle bepreisbaren Positionen:\n{pages_block}"


def _call_gemini_parse_batch(page_texts: list[str], page_offset: int) -> list[dict[str, Any]]:
    """Call Gemini to parse a batch of PDF pages into structured positions."""
    if not settings.gemini_api_key:
        raise InterpretationError("GEMINI_API_KEY not configured")

    prompt = _build_batch_prompt(page_texts, page_offset)

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }

    endpoint = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
        f"?key={settings.gemini_api_key}"
    )

    with httpx.Client(timeout=90) as client:
        response = client.post(endpoint, json=payload)

    if response.status_code >= 400:
        raise InterpretationError(f"Gemini API error: {response.status_code} {response.text}")

    data = response.json()
    try:
        content = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise InterpretationError(f"Unexpected Gemini response format: {data}") from exc

    normalized = _normalize_json_array(content)

    try:
        parsed: list[dict[str, Any]] = json.loads(normalized)
    except json.JSONDecodeError as exc:
        raise InterpretationError(f"Invalid JSON returned by model: {exc}") from exc

    if not isinstance(parsed, list):
        raise InterpretationError("Gemini did not return a JSON array")

    return parsed


def _deduplicate_positions(all_raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the first occurrence of each ordnungszahl."""
    seen: dict[str, dict[str, Any]] = {}
    for pos in all_raw:
        oz = pos.get("ordnungszahl", "")
        if oz and oz not in seen:
            seen[oz] = pos
    return list(seen.values())


def _to_float(value: Any) -> float | None:
    """Safely convert a value to float."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(",", ".").replace(" ", "")
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def _assemble_position(idx: int, raw: dict[str, Any]) -> LVPosition:
    """Convert a raw LLM dict into an LVPosition."""
    pos_type = raw.get("position_type", "material")
    if pos_type not in ("material", "dienstleistung"):
        pos_type = "material"

    quantity = _to_float(raw.get("quantity"))
    unit = raw.get("unit")
    description = raw.get("description", "")

    params = TechnicalParameters(
        product_category=raw.get("product_category"),
        product_subcategory=raw.get("product_subcategory"),
        material=raw.get("material"),
        nominal_diameter_dn=raw.get("nominal_diameter_dn"),
        load_class=raw.get("load_class"),
        norm=raw.get("norm"),
        dimensions=raw.get("dimensions"),
        color=raw.get("color"),
        quantity=quantity,
        unit=unit,
        reference_product=raw.get("reference_product"),
        installation_area=raw.get("installation_area"),
    )

    return LVPosition(
        id=f"pos-{idx}",
        ordnungszahl=raw.get("ordnungszahl", f"?.{idx}"),
        description=description,
        raw_text=description,
        quantity=quantity,
        unit=unit,
        billable=pos_type == "material",
        position_type=pos_type,
        parameters=params,
    )


def _validate_with_heuristics(positions: list[LVPosition]) -> list[LVPosition]:
    """Run heuristic enrichment to fill gaps the LLM might have left."""
    validated: list[LVPosition] = []
    for pos in positions:
        if pos.position_type == "dienstleistung":
            validated.append(pos)
            continue

        heuristic_params = _infer_with_heuristics(pos)
        merged = pos.parameters.model_dump()
        # Only fill in nulls from heuristics, don't override LLM values
        for key, value in heuristic_params.model_dump().items():
            if merged.get(key) is None and value is not None:
                merged[key] = value
        validated.append(pos.model_copy(update={"parameters": TechnicalParameters(**merged)}))
    return validated


def parse_lv_with_llm(pdf_bytes: bytes) -> list[LVPosition]:
    """Parse an LV PDF using Gemini LLM for position extraction and classification."""
    pages = extract_raw_text_pages(pdf_bytes)
    if not pages:
        return []

    batches = _create_page_batches(pages)
    all_raw_positions: list[dict[str, Any]] = []

    for page_offset, batch_pages in batches:
        try:
            batch_result = _call_gemini_parse_batch(batch_pages, page_offset)
            all_raw_positions.extend(batch_result)
            logger.info(
                "LLM batch pages %d-%d: %d positions found",
                page_offset + 1,
                page_offset + len(batch_pages),
                len(batch_result),
            )
        except InterpretationError as exc:
            logger.warning("LLM batch at page %d failed: %s", page_offset + 1, exc)

    if not all_raw_positions:
        raise InterpretationError("LLM returned no positions from any batch")

    deduped = _deduplicate_positions(all_raw_positions)

    # Sort by ordnungszahl
    def _sort_key(raw: dict[str, Any]) -> list[int]:
        oz = raw.get("ordnungszahl", "0")
        try:
            return [int(x) for x in oz.split(".")]
        except ValueError:
            return [999]

    deduped.sort(key=_sort_key)

    positions = [_assemble_position(idx, raw) for idx, raw in enumerate(deduped, start=1)]

    # Validate with heuristics to fill gaps
    positions = _validate_with_heuristics(positions)

    logger.info(
        "LLM parsing complete: %d positions (%d material, %d dienstleistung)",
        len(positions),
        sum(1 for p in positions if p.position_type == "material"),
        sum(1 for p in positions if p.position_type == "dienstleistung"),
    )

    return positions
