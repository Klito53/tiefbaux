from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Product
from ..schemas import (
    CompatibilityCheckRequest,
    CompatibilityIssue,
    ExportOfferRequest,
    ExportPreviewResponse,
    ExportWarning,
    HealthResponse,
    LVPosition,
    OfferLine,
    ParseLVResponse,
    PositionSuggestions,
    ProductSearchResult,
    ProductSuggestion,
    SuggestionsRequest,
    SuggestionsResponse,
)
import logging

from ..config import settings
from ..services.ai_interpreter import enrich_positions_with_parameters
from ..services.compatibility import check_compatibility
from ..services.llm_parser import parse_lv_with_llm
from ..services.matcher import load_active_products, suggest_products_for_position
from ..services.offer_export import build_offer_pdf, now_metadata
from ..services.pdf_parser import extract_positions_from_pdf

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api", tags=["tiefbaux"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


def _fallback_parse(pdf_bytes: bytes) -> list[LVPosition]:
    """Regex-based parsing with optional LLM enrichment. Handles LLM errors gracefully."""
    positions = extract_positions_from_pdf(pdf_bytes)
    try:
        positions = enrich_positions_with_parameters(positions)
    except Exception as exc:
        logger.warning("LLM enrichment failed, using raw regex positions: %s", exc)
    return positions


@router.post("/parse-lv", response_model=ParseLVResponse)
async def parse_lv(file: UploadFile = File(...)) -> ParseLVResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported in MVP")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty")

    if settings.gemini_api_key:
        try:
            positions = parse_lv_with_llm(pdf_bytes)
        except Exception as exc:
            logger.warning("LLM parsing failed, falling back to regex: %s", exc)
            positions = _fallback_parse(pdf_bytes)
    else:
        positions = _fallback_parse(pdf_bytes)

    return ParseLVResponse(
        positions=positions,
        total_positions=len(positions),
        billable_positions=sum(1 for p in positions if p.billable),
        service_positions=sum(1 for p in positions if p.position_type == "dienstleistung"),
    )


@router.post("/suggestions", response_model=SuggestionsResponse)
def get_suggestions(request: SuggestionsRequest, db: Session = Depends(get_db)) -> SuggestionsResponse:
    position_suggestions: list[PositionSuggestions] = []
    selected_for_check: list[tuple[LVPosition, object]] = []
    products = load_active_products(db)

    for position in request.positions:
        suggestions = suggest_products_for_position(db, position, products=products)
        position_suggestions.append(
            PositionSuggestions(
                position_id=position.id,
                ordnungszahl=position.ordnungszahl,
                description=position.description,
                suggestions=suggestions,
            )
        )
        if suggestions:
            selected_for_check.append((position, suggestions[0]))

    compatibility_issues = check_compatibility(selected_for_check)

    return SuggestionsResponse(suggestions=position_suggestions, compatibility_issues=compatibility_issues)



@router.post("/suggestions/single", response_model=PositionSuggestions)
def get_single_suggestions(position: LVPosition, db: Session = Depends(get_db)) -> PositionSuggestions:
    suggestions = suggest_products_for_position(db, position)
    return PositionSuggestions(
        position_id=position.id,
        ordnungszahl=position.ordnungszahl,
        description=position.description,
        suggestions=suggestions,
    )


def _resolve_unit_price(product: Product, quantity: float) -> float | None:
    if quantity >= 100 and product.staffelpreis_ab_100 is not None:
        return product.staffelpreis_ab_100
    if quantity >= 50 and product.staffelpreis_ab_50 is not None:
        return product.staffelpreis_ab_50
    if quantity >= 10 and product.staffelpreis_ab_10 is not None:
        return product.staffelpreis_ab_10
    return product.vk_listenpreis_netto


def _build_offer_lines(
    request: ExportOfferRequest, db: Session
) -> tuple[list[OfferLine], list[ExportWarning]]:
    """Build offer lines and collect warnings about skipped/problematic positions."""
    positions_by_id = {position.id: position for position in request.positions}
    lines: list[OfferLine] = []
    warnings: list[ExportWarning] = []

    # Check for positions without article assignment
    for position in request.positions:
        if position.id not in request.selected_article_ids:
            warnings.append(ExportWarning(
                position_id=position.id,
                ordnungszahl=position.ordnungszahl,
                reason="Kein Artikel zugeordnet",
            ))

    for position_id, artikel_id in request.selected_article_ids.items():
        position = positions_by_id.get(position_id)
        if position is None:
            continue

        product = db.scalar(select(Product).where(Product.artikel_id == artikel_id))
        if product is None:
            warnings.append(ExportWarning(
                position_id=position_id,
                ordnungszahl=position.ordnungszahl if position else "?",
                reason=f"Artikel {artikel_id} nicht in Datenbank gefunden",
            ))
            continue

        quantity = float(position.quantity or 1)
        unit = position.unit or product.preiseinheit or "Stk"
        unit_price = _resolve_unit_price(product, quantity)

        if unit_price is None:
            unit_price = 0.0
            warnings.append(ExportWarning(
                position_id=position_id,
                ordnungszahl=position.ordnungszahl,
                reason="Kein Preis verfügbar, 0 EUR verwendet",
            ))

        if position.quantity is None:
            warnings.append(ExportWarning(
                position_id=position_id,
                ordnungszahl=position.ordnungszahl,
                reason="Menge nicht erkannt, Standard 1 verwendet",
            ))

        total = round(unit_price * quantity, 2)
        lines.append(
            OfferLine(
                ordnungszahl=position.ordnungszahl,
                description=position.description,
                quantity=quantity,
                unit=unit,
                artikel_id=product.artikel_id,
                artikelname=product.artikelname,
                hersteller=product.hersteller,
                price_net=round(unit_price, 2),
                total_net=total,
            )
        )

    return lines, warnings


@router.post("/export-preview", response_model=ExportPreviewResponse)
def export_preview(request: ExportOfferRequest, db: Session = Depends(get_db)) -> ExportPreviewResponse:
    lines, warnings = _build_offer_lines(request, db)
    total_net = sum(line.total_net for line in lines)
    return ExportPreviewResponse(
        included_count=len(lines),
        total_count=len(request.positions),
        skipped_positions=warnings,
        total_net=round(total_net, 2),
    )


@router.post("/export-offer")
def export_offer(request: ExportOfferRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    lines, _warnings = _build_offer_lines(request, db)

    if not lines:
        raise HTTPException(status_code=400, detail="Keine gültigen Artikel für den Export ausgewählt")

    total_net = sum(line.total_net for line in lines)
    metadata = now_metadata(request.customer_name, request.project_name, total_net, request.customer_address)
    pdf_bytes = build_offer_pdf(lines, metadata)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"tiefbaux-angebot-{timestamp}.pdf"

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/products/search", response_model=list[ProductSearchResult])
def search_products(
    q: str = "",
    category: str | None = None,
    dn: int | None = None,
    limit: int = 25,
    db: Session = Depends(get_db),
) -> list[ProductSearchResult]:
    query = select(Product).where(Product.status == "aktiv")

    if q:
        like_q = f"%{q}%"
        query = query.where(
            Product.artikelname.ilike(like_q) | Product.artikelbeschreibung.ilike(like_q)
        )
    if category:
        query = query.where(Product.kategorie == category)
    if dn is not None:
        query = query.where(Product.nennweite_dn == dn)

    query = query.limit(limit)
    products = list(db.scalars(query))

    return [
        ProductSearchResult(
            artikel_id=p.artikel_id,
            artikelname=p.artikelname,
            hersteller=p.hersteller,
            kategorie=p.kategorie,
            nennweite_dn=p.nennweite_dn,
            belastungsklasse=p.belastungsklasse,
            vk_listenpreis_netto=p.vk_listenpreis_netto,
            lager_gesamt=p.lager_gesamt,
            waehrung=p.waehrung,
        )
        for p in products
    ]


@router.post("/compatibility-check", response_model=list[CompatibilityIssue])
def check_compatibility_endpoint(
    request: CompatibilityCheckRequest,
    db: Session = Depends(get_db),
) -> list[CompatibilityIssue]:
    positions_by_id = {p.id: p for p in request.positions}
    selected: list[tuple[LVPosition, ProductSuggestion]] = []

    for pos_id, artikel_id in request.selected_article_ids.items():
        position = positions_by_id.get(pos_id)
        if not position:
            continue
        product = db.scalar(select(Product).where(Product.artikel_id == artikel_id))
        if not product:
            continue
        selected.append((
            position,
            ProductSuggestion(
                artikel_id=product.artikel_id,
                artikelname=product.artikelname,
                category=product.kategorie,
                subcategory=product.unterkategorie,
                dn=product.nennweite_dn,
                load_class=product.belastungsklasse,
                score=0,
            ),
        ))

    return check_compatibility(selected)
