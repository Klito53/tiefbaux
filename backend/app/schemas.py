from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ComponentRequirement(BaseModel):
    component_name: str
    product_category: str | None = None
    product_subcategory: str | None = None
    nominal_diameter_dn: int | None = None
    quantity: int = 1
    material: str | None = None


class TechnicalParameters(BaseModel):
    model_config = ConfigDict(extra="ignore")

    product_category: str | None = None
    product_subcategory: str | None = None
    material: str | None = None
    nominal_diameter_dn: int | None = None
    load_class: str | None = None
    norm: str | None = None
    dimensions: str | None = None
    color: str | None = None
    quantity: float | None = None
    unit: str | None = None
    reference_product: str | None = None
    installation_area: str | None = None
    stiffness_class_sn: int | None = None
    sortiment_relevant: bool | None = None
    pipe_length_mm: int | None = None
    angle_deg: int | None = None
    application_area: str | None = None
    components: list[ComponentRequirement] | None = None


class LVPosition(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    ordnungszahl: str
    description: str
    raw_text: str
    quantity: float | None = None
    unit: str | None = None
    billable: bool = True
    position_type: Literal["material", "dienstleistung"] | None = None
    parameters: TechnicalParameters = Field(default_factory=TechnicalParameters)
    source_page: int | None = None


class DuplicateInfo(BaseModel):
    is_duplicate: bool
    project_id: int | None = None
    project_name: str | None = None
    created_at: datetime | None = None
    total_positions: int | None = None


class ProjectMetadata(BaseModel):
    bauvorhaben: str | None = None
    objekt_nr: str | None = None
    submission_date: str | None = None
    auftraggeber: str | None = None
    kunde_name: str | None = None
    kunde_adresse: str | None = None


class ParseLVResponse(BaseModel):
    positions: list[LVPosition]
    total_positions: int
    billable_positions: int
    service_positions: int = 0
    duplicate: DuplicateInfo | None = None
    metadata: ProjectMetadata | None = None


class ScoreBreakdown(BaseModel):
    component: str
    points: float
    detail: str


class ProductSuggestion(BaseModel):
    artikel_id: str
    artikelname: str
    hersteller: str | None = None
    category: str | None = None
    subcategory: str | None = None
    dn: int | None = None
    sn: int | None = None
    load_class: str | None = None
    norm: str | None = None
    stock: int | None = None
    delivery_days: int | None = None
    price_net: float | None = None
    total_net: float | None = None
    currency: str = "EUR"
    score: float
    confidence: str | None = None
    reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    score_breakdown: list[ScoreBreakdown] = Field(default_factory=list)
    is_override: bool = False


class ComponentSuggestions(BaseModel):
    component_name: str
    quantity: int = 1
    suggestions: list[ProductSuggestion] = Field(default_factory=list)


class PositionSuggestions(BaseModel):
    position_id: str
    ordnungszahl: str
    description: str
    suggestions: list[ProductSuggestion] = Field(default_factory=list)
    component_suggestions: list[ComponentSuggestions] | None = None


class SuggestionsRequest(BaseModel):
    positions: list[LVPosition]


class SuggestionsResponse(BaseModel):
    suggestions: list[PositionSuggestions]


class ExportOfferRequest(BaseModel):
    positions: list[LVPosition]
    selected_article_ids: dict[str, list[str]]
    custom_unit_prices: dict[str, float] = Field(default_factory=dict)
    customer_name: str | None = None
    customer_address: str | None = None
    project_name: str | None = None
    alternative_flags: dict[str, bool] = Field(default_factory=dict)
    supplier_open_flags: dict[str, bool] = Field(default_factory=dict)


class OfferLine(BaseModel):
    ordnungszahl: str
    description: str
    quantity: float
    unit: str
    artikel_id: str
    artikelname: str
    hersteller: str | None = None
    price_net: float
    total_net: float
    is_additional: bool = False
    is_alternative: bool = False
    supplier_open: bool = False


class ExportOfferMetadata(BaseModel):
    customer_name: str | None = None
    customer_address: str | None = None
    project_name: str | None = None
    created_at: datetime
    total_net: float


class ExportWarning(BaseModel):
    position_id: str
    ordnungszahl: str
    reason: str


class ExportPreviewResponse(BaseModel):
    included_count: int
    total_count: int
    skipped_positions: list[ExportWarning] = Field(default_factory=list)
    total_net: float


class ProductSearchResult(BaseModel):
    artikel_id: str
    artikelname: str
    hersteller: str | None = None
    kategorie: str | None = None
    nennweite_dn: int | None = None
    belastungsklasse: str | None = None
    vk_listenpreis_netto: float | None = None
    lager_gesamt: int | None = None
    waehrung: str | None = None
    steifigkeitsklasse_sn: str | None = None
    norm_primaer: str | None = None
    werkstoff: str | None = None


class HealthResponse(BaseModel):
    status: str


class ProjectSummary(BaseModel):
    id: int
    filename: str | None = None
    project_name: str | None = None
    projekt_nr: str | None = None
    total_positions: int
    billable_positions: int
    service_positions: int
    created_at: datetime
    bauvorhaben: str | None = None
    objekt_nr: str | None = None
    submission_date: str | None = None
    kunde_name: str | None = None


class ProjectDetailResponse(BaseModel):
    project: ProjectSummary
    positions: list[LVPosition]
    metadata: ProjectMetadata | None = None
    selections: dict[str, list[str]] | None = None


class SaveSelectionsRequest(BaseModel):
    project_id: int
    selected_article_ids: dict[str, list[str]]


class OverrideRequest(BaseModel):
    position_description: str
    ordnungszahl: str | None = None
    category: str | None = None
    dn: int | None = None
    material: str | None = None
    chosen_artikel_id: str


# --- Supplier & Inquiry ---

class SupplierCreate(BaseModel):
    name: str
    email: str
    phone: str | None = None
    categories: list[str] = Field(default_factory=list)
    notes: str | None = None


class SupplierResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str | None = None
    categories: list[str] = Field(default_factory=list)
    notes: str | None = None
    active: bool


class InquiryCreateRequest(BaseModel):
    supplier_id: int
    project_id: int | None = None
    position_id: str | None = None
    ordnungszahl: str | None = None
    product_description: str
    technical_params: TechnicalParameters | None = None
    quantity: float | None = None
    unit: str | None = None
    custom_message: str | None = None
    send_email: bool = True


class InquiryBatchCreateRequest(BaseModel):
    supplier_ids: list[int]
    project_id: int | None = None
    position_id: str | None = None
    ordnungszahl: str | None = None
    product_description: str
    technical_params: TechnicalParameters | None = None
    quantity: float | None = None
    unit: str | None = None
    custom_message: str | None = None


class BatchSendRequest(BaseModel):
    project_id: int


class BatchSendResponse(BaseModel):
    sent_count: int
    failed_count: int


class InquiryResponse(BaseModel):
    id: int
    supplier_name: str
    supplier_email: str
    project_id: int | None = None
    position_id: str | None = None
    ordnungszahl: str | None = None
    product_description: str
    quantity: float | None = None
    unit: str | None = None
    status: str
    sent_at: datetime | None = None
    email_subject: str | None = None
    email_body: str | None = None
    created_at: datetime


class InquiryStatusUpdate(BaseModel):
    status: str
    notes: str | None = None


# --- Objektradar / Tenders ---

class TenderResponse(BaseModel):
    id: int
    external_id: str
    title: str
    description: str | None = None
    auftraggeber: str | None = None
    ort: str | None = None
    cpv_codes: list[str] = Field(default_factory=list)
    submission_deadline: str | None = None
    publication_date: str | None = None
    url: str | None = None
    status: str = "neu"
    relevance_score: int = 0
    lat: float | None = None
    lng: float | None = None
    created_at: datetime | None = None
    project_id: int | None = None


class TenderStatusUpdate(BaseModel):
    status: str
