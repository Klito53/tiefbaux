export type ComponentRequirement = {
  component_name: string
  product_category?: string | null
  product_subcategory?: string | null
  nominal_diameter_dn?: number | null
  quantity: number
  material?: string | null
}

export type TechnicalParameters = {
  product_category?: string | null
  product_subcategory?: string | null
  material?: string | null
  nominal_diameter_dn?: number | null
  load_class?: string | null
  norm?: string | null
  dimensions?: string | null
  color?: string | null
  quantity?: number | null
  unit?: string | null
  reference_product?: string | null
  installation_area?: string | null
  stiffness_class_sn?: number | null
  sortiment_relevant?: boolean | null
  components?: ComponentRequirement[] | null
}

export type LVPosition = {
  id: string
  ordnungszahl: string
  description: string
  raw_text: string
  quantity?: number | null
  unit?: string | null
  billable: boolean
  position_type?: 'material' | 'dienstleistung' | null
  parameters: TechnicalParameters
  source_page?: number | null
}

export type ScoreBreakdown = {
  component: string
  points: number
  detail: string
}

export type ProductSuggestion = {
  artikel_id: string
  artikelname: string
  hersteller?: string | null
  category?: string | null
  subcategory?: string | null
  dn?: number | null
  sn?: number | null
  load_class?: string | null
  norm?: string | null
  stock?: number | null
  delivery_days?: number | null
  price_net?: number | null
  total_net?: number | null
  currency: string
  score: number
  confidence?: 'high' | 'medium' | 'low' | null
  reasons: string[]
  warnings: string[]
  score_breakdown: ScoreBreakdown[]
  is_manual?: boolean
  is_override?: boolean
}

export type ComponentSuggestions = {
  component_name: string
  quantity: number
  suggestions: ProductSuggestion[]
}

export type PositionSuggestions = {
  position_id: string
  ordnungszahl: string
  description: string
  suggestions: ProductSuggestion[]
  component_suggestions?: ComponentSuggestions[] | null
}

export type ProjectMetadata = {
  bauvorhaben?: string | null
  objekt_nr?: string | null
  submission_date?: string | null
  auftraggeber?: string | null
  kunde_name?: string | null
  kunde_adresse?: string | null
}

export type DuplicateInfo = {
  is_duplicate: boolean
  project_id?: number | null
  project_name?: string | null
  created_at?: string | null
  total_positions?: number | null
}

export type ParseResponse = {
  positions: LVPosition[]
  total_positions: number
  billable_positions: number
  service_positions: number
  duplicate?: DuplicateInfo | null
  metadata?: ProjectMetadata | null
}

export type SuggestionResponse = {
  suggestions: PositionSuggestions[]
}

export type ExportWarning = {
  position_id: string
  ordnungszahl: string
  reason: string
}

export type ExportPreviewResponse = {
  included_count: number
  total_count: number
  skipped_positions: ExportWarning[]
  total_net: number
}

export type PriceAdjustmentMode = 'percent' | 'absolute'

export type PriceAdjustment = {
  mode: PriceAdjustmentMode
  value: string
}

export type ProductSearchResult = {
  artikel_id: string
  artikelname: string
  hersteller?: string | null
  kategorie?: string | null
  nennweite_dn?: number | null
  belastungsklasse?: string | null
  vk_listenpreis_netto?: number | null
  lager_gesamt?: number | null
  waehrung?: string | null
  steifigkeitsklasse_sn?: string | null
  norm_primaer?: string | null
  werkstoff?: string | null
}

export type AnalysisStep = 'idle' | 'uploading' | 'parsing' | 'enriching' | 'matching' | 'done' | 'error'

export type AppView = 'analysis' | 'archive' | 'radar'

export type ProjectSummary = {
  id: number
  filename: string | null
  project_name: string | null
  projekt_nr?: string | null
  total_positions: number
  billable_positions: number
  service_positions: number
  created_at: string
  bauvorhaben?: string | null
  objekt_nr?: string | null
  submission_date?: string | null
  kunde_name?: string | null
}

export type ProjectDetailResponse = {
  project: ProjectSummary
  positions: LVPosition[]
  metadata?: ProjectMetadata | null
  selections?: Record<string, string[]> | null
}

export type UndoAction =
  | { type: 'select'; positionId: string; previousArticleIds: string[] | undefined }
  | { type: 'deselect'; positionId: string; previousArticleIds: string[] }
  | { type: 'skip'; positionId: string }
  | { type: 'unskip'; positionId: string }

export type Supplier = {
  id: number
  name: string
  email: string
  phone?: string | null
  categories: string[]
  notes?: string | null
  active: boolean
}

export type Tender = {
  id: number
  external_id: string
  title: string
  description?: string | null
  auftraggeber?: string | null
  ort?: string | null
  cpv_codes: string[]
  submission_deadline?: string | null
  publication_date?: string | null
  url?: string | null
  status: 'neu' | 'relevant' | 'irrelevant' | 'analysiert'
  relevance_score: number
  lat?: number | null
  lng?: number | null
  created_at?: string | null
  project_id?: number | null
}

export type SupplierInquiry = {
  id: number
  supplier_name: string
  supplier_email: string
  project_id?: number | null
  position_id?: string | null
  ordnungszahl?: string | null
  product_description: string
  quantity?: number | null
  unit?: string | null
  status: 'offen' | 'angefragt' | 'angebot_erhalten'
  sent_at?: string | null
  email_subject?: string | null
  email_body?: string | null
  created_at: string
}
