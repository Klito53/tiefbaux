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
  load_class?: string | null
  norm?: string | null
  stock?: number | null
  delivery_days?: number | null
  price_net?: number | null
  total_net?: number | null
  currency: string
  score: number
  reasons: string[]
  warnings: string[]
  score_breakdown: ScoreBreakdown[]
}

export type PositionSuggestions = {
  position_id: string
  ordnungszahl: string
  description: string
  suggestions: ProductSuggestion[]
}

export type CompatibilityIssue = {
  severity: string
  rule: string
  message: string
  positions: string[]
}

export type ParseResponse = {
  positions: LVPosition[]
  total_positions: number
  billable_positions: number
  service_positions: number
}

export type SuggestionResponse = {
  suggestions: PositionSuggestions[]
  compatibility_issues: CompatibilityIssue[]
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

export type AnalysisStep = 'idle' | 'uploading' | 'parsing' | 'enriching' | 'matching' | 'done' | 'error'
