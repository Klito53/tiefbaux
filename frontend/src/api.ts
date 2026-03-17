import type { ExportPreviewResponse, LVPosition, ParseResponse, PositionSuggestions, ProductSearchResult, ProjectDetailResponse, ProjectSummary, Supplier, SupplierInquiry, SuggestionResponse, TechnicalParameters, Tender } from './types'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'

export class ApiError extends Error {
  type: 'network' | 'api' | 'validation' | 'timeout'
  status?: number

  constructor(
    message: string,
    type: 'network' | 'api' | 'validation' | 'timeout',
    status?: number,
  ) {
    super(message)
    this.type = type
    this.status = status
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body.detail ?? JSON.stringify(body)
    } catch {
      detail = await response.text()
    }
    if (response.status === 400 || response.status === 422) {
      throw new ApiError(detail || 'Ungültige Eingabedaten', 'validation', response.status)
    }
    throw new ApiError(
      detail || `Serverfehler (${response.status})`,
      'api',
      response.status,
    )
  }
  return (await response.json()) as T
}

function wrapFetch(promise: Promise<Response>): Promise<Response> {
  return promise.catch((err) => {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    throw new ApiError('Server nicht erreichbar. Bitte prüfen Sie die Verbindung.', 'network')
  })
}

export async function parseLV(file: File, signal?: AbortSignal): Promise<ParseResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await wrapFetch(
    fetch(`${API_BASE}/parse-lv`, { method: 'POST', body: formData, signal }),
  )
  return handleResponse<ParseResponse>(response)
}

export async function fetchSuggestions(positions: LVPosition[], signal?: AbortSignal): Promise<SuggestionResponse> {
  const response = await wrapFetch(
    fetch(`${API_BASE}/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions }),
      signal,
    }),
  )
  return handleResponse<SuggestionResponse>(response)
}

export async function fetchSingleSuggestions(position: LVPosition): Promise<PositionSuggestions> {
  const response = await wrapFetch(
    fetch(`${API_BASE}/suggestions/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(position),
    }),
  )
  return handleResponse<PositionSuggestions>(response)
}

export async function fetchExportPreview(
  positions: LVPosition[],
  selectedArticleIds: Record<string, string[]>,
  customerName: string,
  projectName: string,
  customUnitPrices?: Record<string, number>,
  alternativeFlags?: Record<string, boolean>,
  supplierOpenFlags?: Record<string, boolean>,
): Promise<ExportPreviewResponse> {
  const response = await wrapFetch(
    fetch(`${API_BASE}/export-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positions,
        selected_article_ids: selectedArticleIds,
        customer_name: customerName,
        project_name: projectName,
        custom_unit_prices: customUnitPrices,
        alternative_flags: alternativeFlags,
        supplier_open_flags: supplierOpenFlags,
      }),
    }),
  )
  return handleResponse<ExportPreviewResponse>(response)
}

export async function exportOffer(
  positions: LVPosition[],
  selectedArticleIds: Record<string, string[]>,
  customerName: string,
  projectName: string,
  customUnitPrices?: Record<string, number>,
  alternativeFlags?: Record<string, boolean>,
  supplierOpenFlags?: Record<string, boolean>,
): Promise<Blob> {
  const response = await wrapFetch(
    fetch(`${API_BASE}/export-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positions,
        selected_article_ids: selectedArticleIds,
        customer_name: customerName,
        project_name: projectName,
        custom_unit_prices: customUnitPrices,
        alternative_flags: alternativeFlags,
        supplier_open_flags: supplierOpenFlags,
      }),
    }),
  )

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body.detail ?? ''
    } catch {
      detail = await response.text()
    }
    throw new ApiError(detail || 'Export fehlgeschlagen', 'api', response.status)
  }

  return await response.blob()
}

export async function searchProducts(params: {
  q?: string
  category?: string
  dn?: number
  sn?: string
  load_class?: string
  material?: string
  angle?: number
}): Promise<ProductSearchResult[]> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.category) query.set('category', params.category)
  if (params.dn != null) query.set('dn', String(params.dn))
  if (params.sn) query.set('sn', params.sn)
  if (params.load_class) query.set('load_class', params.load_class)
  if (params.material) query.set('material', params.material)
  if (params.angle != null) query.set('angle', String(params.angle))

  const response = await wrapFetch(
    fetch(`${API_BASE}/products/search?${query.toString()}`),
  )
  return handleResponse<ProductSearchResult[]>(response)
}


export async function fetchProjects(q?: string): Promise<ProjectSummary[]> {
  const params = q ? `?q=${encodeURIComponent(q)}` : ''
  const response = await wrapFetch(fetch(`${API_BASE}/projects${params}`))
  return handleResponse<ProjectSummary[]>(response)
}

export async function fetchProject(projectId: number): Promise<ProjectDetailResponse> {
  const response = await wrapFetch(fetch(`${API_BASE}/projects/${projectId}`))
  return handleResponse<ProjectDetailResponse>(response)
}

export async function deleteProject(projectId: number): Promise<void> {
  const response = await wrapFetch(
    fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' }),
  )
  if (!response.ok) {
    await handleResponse(response)
  }
}

export async function saveSelections(projectId: number, selectedArticleIds: Record<string, string[]>): Promise<void> {
  await wrapFetch(
    fetch(`${API_BASE}/projects/save-selections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, selected_article_ids: selectedArticleIds }),
    }),
  )
}

export async function recordOverride(data: {
  position_description: string
  ordnungszahl?: string
  category?: string | null
  dn?: number | null
  material?: string | null
  chosen_artikel_id: string
}): Promise<void> {
  await wrapFetch(
    fetch(`${API_BASE}/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
}

export function getProjectPdfUrl(projectId: number): string {
  return `${API_BASE}/projects/${projectId}/pdf`
}

// --- Supplier & Inquiry ---

export async function fetchSuppliers(): Promise<Supplier[]> {
  const response = await wrapFetch(fetch(`${API_BASE}/suppliers`))
  return handleResponse<Supplier[]>(response)
}

export async function createSupplier(data: {
  name: string
  email: string
  phone?: string
  categories?: string[]
  notes?: string
}): Promise<Supplier> {
  const response = await wrapFetch(
    fetch(`${API_BASE}/suppliers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
  return handleResponse<Supplier>(response)
}

export async function createInquiry(data: {
  supplier_id: number
  project_id?: number | null
  position_id?: string | null
  ordnungszahl?: string | null
  product_description: string
  technical_params?: TechnicalParameters | null
  quantity?: number | null
  unit?: string | null
  custom_message?: string | null
  send_email?: boolean
}): Promise<SupplierInquiry> {
  const response = await wrapFetch(
    fetch(`${API_BASE}/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
  return handleResponse<SupplierInquiry>(response)
}

export async function createInquiryBatch(data: {
  supplier_ids: number[]
  project_id?: number | null
  position_id?: string | null
  ordnungszahl?: string | null
  product_description: string
  technical_params?: TechnicalParameters | null
  quantity?: number | null
  unit?: string | null
  custom_message?: string | null
}): Promise<SupplierInquiry[]> {
  const response = await wrapFetch(
    fetch(`${API_BASE}/inquiries/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  )
  return handleResponse<SupplierInquiry[]>(response)
}

export async function sendBatchInquiries(projectId: number): Promise<{ sent_count: number; failed_count: number }> {
  const response = await wrapFetch(
    fetch(`${API_BASE}/inquiries/send-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId }),
    }),
  )
  return handleResponse<{ sent_count: number; failed_count: number }>(response)
}

export async function fetchInquiries(projectId?: number): Promise<SupplierInquiry[]> {
  const params = projectId != null ? `?project_id=${projectId}` : ''
  const response = await wrapFetch(fetch(`${API_BASE}/inquiries${params}`))
  return handleResponse<SupplierInquiry[]>(response)
}

export async function updateInquiryStatus(
  inquiryId: number,
  status: string,
  notes?: string,
): Promise<void> {
  await wrapFetch(
    fetch(`${API_BASE}/inquiries/${inquiryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes }),
    }),
  )
}


// ── Objektradar / Tenders ──

export async function fetchTenders(status?: string, minRelevance?: number): Promise<Tender[]> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (minRelevance && minRelevance > 0) params.set('min_relevance', String(minRelevance))
  const qs = params.toString()
  return handleResponse<Tender[]>(
    await wrapFetch(fetch(`${API_BASE}/tenders${qs ? '?' + qs : ''}`)),
  )
}

export async function refreshTenders(): Promise<{ status: string }> {
  return handleResponse(
    await wrapFetch(
      fetch(`${API_BASE}/tenders/refresh`, { method: 'POST' }),
    ),
  )
}

export async function getRefreshStatus(): Promise<{ running: boolean; last_result: any }> {
  return handleResponse(
    await wrapFetch(fetch(`${API_BASE}/tenders/refresh-status`)),
  )
}

export async function updateTenderStatus(tenderId: number, status: string): Promise<void> {
  await wrapFetch(
    fetch(`${API_BASE}/tenders/${tenderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  )
}
