import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchInquiries, getProjectPdfUrl, sendBatchInquiries } from '../api'
import type { LVPosition, PositionSuggestions, PriceAdjustment, ProductSearchResult, ProductSuggestion, SupplierInquiry } from '../types'
import { DinBadge } from './DinBadge'
import { InquiryModal } from './InquiryModal'
import { PriceAdjustmentControl } from './PriceAdjustmentControl'
import { ProductSearchModal } from './ProductSearchModal'
import { computeAdjustedTotal, computeAdjustedUnitPrice, isAdjustedPrice } from '../utils/pricing'

const PARAM_STYLES: Record<string, React.CSSProperties> = {
  match: { background: '#dcfce7', color: '#166534' },
  mismatch: { background: '#fee2e2', color: '#991b1b' },
  neutral: { background: '#f1f5f9', color: '#334155' },
}

const LOAD_CLASS_CATEGORIES = new Set(['Schachtabdeckungen', 'Straßenentwässerung'])

function ParamBadge({ label, status }: { label: string; status: 'match' | 'mismatch' | 'neutral' }) {
  return (
    <span
      className={`param-badge param-${status}`}
      style={{ ...PARAM_STYLES[status], padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}
    >
      {label}
    </span>
  )
}

function extractSnFromText(text: string): number | null {
  const match = text.match(/SN\s*(\d+)/i)
  return match ? parseInt(match[1], 10) : null
}

function formatMoney(value?: number | null, currency = 'EUR'): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

function scoreColor(score: number): string {
  if (score >= 50) return '#16a34a'
  if (score >= 30) return '#ca8a04'
  return '#dc2626'
}

function stockStatus(stock?: number | null): { label: string; className: string } {
  if (stock == null || stock <= 0) return { label: 'Nicht auf Lager', className: 'stock-red' }
  if (stock < 10) return { label: `${stock} auf Lager`, className: 'stock-amber' }
  return { label: `${stock} auf Lager`, className: 'stock-green' }
}

export type AssignmentDecision = 'accepted' | 'rejected' | 'skipped'

type FilterTab = 'alle' | 'zugeordnet' | 'offen' | 'dienstleistung'

type Props = {
  positions: LVPosition[]
  suggestionMap: Record<string, ProductSuggestion[]>
  selectedArticleIds: Record<string, string[]>
  skippedPositionIds: Set<string>
  priceAdjustments: Record<string, PriceAdjustment>
  categoryAdjustments: Record<string, PriceAdjustment>
  onAccept: (positionId: string, artikelId: string) => void
  onSwapPrimary: (positionId: string, artikelId: string) => void
  onReject: (positionId: string) => void
  onManualSelect: (positionId: string, product: ProductSearchResult) => void
  onAddArticle: (positionId: string, product: ProductSearchResult) => void
  onRemoveArticle: (positionId: string, artikelId: string) => void
  onPriceAdjustmentChange: (positionId: string, adjustment: PriceAdjustment) => void
  onFinish: () => void
  onBackToOverview: () => void
  projectId?: number | null
  projectName?: string | null
  alternativeFlags?: Record<string, boolean>
  onToggleAlternative?: (positionId: string) => void
  supplierOpenFlags?: Record<string, boolean>
  onToggleSupplierOpen?: (positionId: string) => void
  positionSuggestions?: PositionSuggestions[]
  componentSelections?: Record<string, string>
  onComponentSelect?: (positionId: string, componentName: string, artikelId: string) => void
}

export function AssignmentView({
  positions,
  suggestionMap,
  selectedArticleIds,
  skippedPositionIds,
  priceAdjustments,
  categoryAdjustments,
  onAccept,
  onSwapPrimary,
  onReject,
  onManualSelect,
  onAddArticle,
  onRemoveArticle,
  onPriceAdjustmentChange,
  onFinish,
  onBackToOverview,
  projectId,
  projectName,
  alternativeFlags = {},
  onToggleAlternative,
  supplierOpenFlags = {},
  onToggleSupplierOpen,
  positionSuggestions = [],
  componentSelections = {},
  onComponentSelect,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [decisions, setDecisions] = useState<Record<string, AssignmentDecision>>({})
  const [searchOpen, setSearchOpen] = useState(false)
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [inquiryProductName, setInquiryProductName] = useState<string | null>(null)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('alle')
  const [pendingInquiries, setPendingInquiries] = useState<SupplierInquiry[]>([])
  const [inquiriesLoading, setInquiriesLoading] = useState(false)
  const [sendingInquiries, setSendingInquiries] = useState(false)
  const [inquiriesSentResult, setInquiriesSentResult] = useState<{ sent: number; failed: number } | null>(null)

  // Categorize positions
  const materialPositions = useMemo(
    () => positions.filter(p => !skippedPositionIds.has(p.id)),
    [positions, skippedPositionIds],
  )

  const servicePositions = useMemo(
    () => positions.filter(p => skippedPositionIds.has(p.id)),
    [positions, skippedPositionIds],
  )

  // Filtered positions based on active tab
  const filteredPositions = useMemo(() => {
    switch (activeFilter) {
      case 'zugeordnet':
        return materialPositions.filter(p => (selectedArticleIds[p.id]?.length ?? 0) > 0)
      case 'offen':
        return materialPositions.filter(p => (selectedArticleIds[p.id]?.length ?? 0) === 0)
      case 'dienstleistung':
        return servicePositions
      default:
        return materialPositions
    }
  }, [activeFilter, materialPositions, servicePositions, selectedArticleIds])

  // Tab counts
  const assignedCount = useMemo(
    () => materialPositions.filter(p => (selectedArticleIds[p.id]?.length ?? 0) > 0).length,
    [materialPositions, selectedArticleIds],
  )
  const openCount = useMemo(
    () => materialPositions.filter(p => (selectedArticleIds[p.id]?.length ?? 0) === 0).length,
    [materialPositions, selectedArticleIds],
  )

  const currentPosition = filteredPositions[currentIndex] ?? null
  const currentSuggestions = currentPosition ? suggestionMap[currentPosition.id] ?? [] : []
  const currentSelectedArticles = currentPosition ? selectedArticleIds[currentPosition.id] ?? [] : []
  const currentSelectedArticle = currentSelectedArticles[0]
  const additionalArticleIds = useMemo(() => new Set(currentSelectedArticles.slice(1)), [currentSelectedArticles])
  // Carousel shows only matching suggestions, not manually added additional articles
  const carouselSuggestions = useMemo(
    () => currentSuggestions.filter(s => !additionalArticleIds.has(s.artikel_id)),
    [currentSuggestions, additionalArticleIds],
  )
  const [addArticleSearchOpen, setAddArticleSearchOpen] = useState(false)
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [showOriginalPdf, setShowOriginalPdf] = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [swipeDir, setSwipeDir] = useState<'up' | 'down' | null>(null)
  const totalCount = filteredPositions.length
  const decidedCount = Object.keys(decisions).length

  const isFinished = currentIndex >= totalCount

  // Reset index when filter changes
  useEffect(() => {
    setCurrentIndex(0)
  }, [activeFilter])

  // Reset raw text toggle and carousel on position change
  useEffect(() => {
    setShowOriginalPdf(false)
    setCarouselIndex(0)
    setSwipeDir(null)
  }, [currentIndex])

  // Clear swipe animation direction after animation completes
  useEffect(() => {
    if (swipeDir) {
      const timer = setTimeout(() => setSwipeDir(null), 250)
      return () => clearTimeout(timer)
    }
  }, [swipeDir, carouselIndex])

  // Auto-select the currently visible suggestion when swiping
  // Uses onSwapPrimary to only replace the primary article, keeping additional articles intact
  useEffect(() => {
    if (!currentPosition || isServiceView) return
    const suggestion = carouselSuggestions[carouselIndex]
    if (suggestion) {
      onSwapPrimary(currentPosition.id, suggestion.artikel_id)
    }
  }, [carouselIndex]) // intentionally minimal deps — only fire on carousel swipe

  // Slide animation
  useEffect(() => {
    if (slideDirection) {
      const timer = setTimeout(() => setSlideDirection(null), 300)
      return () => clearTimeout(timer)
    }
  }, [slideDirection])

  const goNext = useCallback(() => {
    setSlideDirection('left')
    setCurrentIndex(prev => Math.min(prev + 1, totalCount))
  }, [totalCount])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setSlideDirection('right')
      setCurrentIndex(prev => prev - 1)
    }
  }, [currentIndex])

  const handleSelectArticle = useCallback((artikelId: string) => {
    if (!currentPosition) return
    onAccept(currentPosition.id, artikelId)
  }, [currentPosition, onAccept])

  const handleContinue = useCallback(() => {
    if (!currentPosition || !currentSelectedArticle) return
    setDecisions(prev => ({ ...prev, [currentPosition.id]: 'accepted' }))
    goNext()
  }, [currentPosition, currentSelectedArticle, goNext])

  const handleRejectRequest = useCallback(() => {
    if (!currentPosition) return
    setShowRejectConfirm(true)
  }, [currentPosition])

  const handleRejectConfirm = useCallback(() => {
    if (!currentPosition) return
    setShowRejectConfirm(false)
    onReject(currentPosition.id)
    setDecisions(prev => ({ ...prev, [currentPosition.id]: 'rejected' }))
    goNext()
  }, [currentPosition, onReject, goNext])

  const handleRejectCancel = useCallback(() => {
    setShowRejectConfirm(false)
  }, [])

  const handleSkip = useCallback(() => {
    if (!currentPosition) return
    setDecisions(prev => ({ ...prev, [currentPosition.id]: 'skipped' }))
    goNext()
  }, [currentPosition, goNext])

  const handleManualSearchSelect = useCallback((product: ProductSearchResult) => {
    if (!currentPosition) return
    onManualSelect(currentPosition.id, product)
    setSearchOpen(false)
  }, [currentPosition, onManualSelect])

  const handleAddArticleSelect = useCallback((product: ProductSearchResult) => {
    if (!currentPosition) return
    onAddArticle(currentPosition.id, product)
    setAddArticleSearchOpen(false)
  }, [currentPosition, onAddArticle])

  const handleSkipAll = useCallback(() => {
    filteredPositions.forEach(p => {
      if (!decisions[p.id]) {
        setDecisions(prev => ({ ...prev, [p.id]: 'skipped' }))
      }
    })
    setCurrentIndex(totalCount)
  }, [filteredPositions, decisions, totalCount])

  // Keyboard shortcuts
  useEffect(() => {
    if (isFinished || searchOpen || showRejectConfirm) return
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case 'Enter':
          e.preventDefault()
          if (currentSelectedArticle ?? carouselSuggestions[0]?.artikel_id) {
            handleContinue()
          }
          break
        case 'Escape':
          e.preventDefault()
          handleRejectRequest()
          break
        case 'ArrowRight':
          e.preventDefault()
          handleSkip()
          break
        case 'ArrowLeft':
          e.preventDefault()
          goPrev()
          break
        case 'ArrowUp':
          e.preventDefault()
          if (carouselIndex > 0) {
            setSwipeDir('up')
            setCarouselIndex(prev => prev - 1)
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (carouselIndex < carouselSuggestions.length - 1) {
            setSwipeDir('down')
            setCarouselIndex(prev => prev + 1)
          }
          break
        case 's':
        case 'S':
          e.preventDefault()
          setSearchOpen(true)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFinished, searchOpen, showRejectConfirm, carouselSuggestions, currentSelectedArticle, carouselIndex, handleContinue, handleRejectRequest, handleSkip, goPrev])

  // Fetch pending inquiries when assignment is finished
  useEffect(() => {
    if (isFinished && projectId) {
      setInquiriesLoading(true)
      setInquiriesSentResult(null)
      fetchInquiries(projectId)
        .then(data => setPendingInquiries(data.filter(inq => inq.status === 'offen')))
        .catch(() => setPendingInquiries([]))
        .finally(() => setInquiriesLoading(false))
    }
  }, [isFinished, projectId])

  // Summary screen
  if (isFinished) {
    const acceptedCount = Object.values(decisions).filter(d => d === 'accepted').length
    const rejectedCount = Object.values(decisions).filter(d => d === 'rejected').length
    const skippedCount = totalCount - acceptedCount - rejectedCount
    const svcCount = positions.length - materialPositions.length
    const supplierOpenCount = Object.entries(supplierOpenFlags)
      .filter(([posId, open]) => open && (selectedArticleIds[posId]?.length ?? 0) > 0)
      .length

    // Calculate total value
    let totalValue = 0
    for (const [posId, artIds] of Object.entries(selectedArticleIds)) {
      if (skippedPositionIds.has(posId)) continue
      const suggestions = suggestionMap[posId]
      if (!suggestions) continue
      const position = positions.find(p => p.id === posId)
      for (let i = 0; i < artIds.length; i++) {
        const match = suggestions.find(s => s.artikel_id === artIds[i])
        const unitPrice = i === 0
          ? computeAdjustedUnitPrice(match?.price_net, priceAdjustments[posId])
          : match?.price_net ?? null
        const adjustedTotal = computeAdjustedTotal(unitPrice, position?.quantity)
        if (adjustedTotal != null) totalValue += adjustedTotal
      }
    }

    return (
      <div className="assignment-view">
        <div className="assignment-summary">
          <div className="summary-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#16a34a" strokeWidth="1.5" />
              <path d="M8 12l3 3 5-5" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2>Zuordnung abgeschlossen</h2>

          <div className="summary-stats">
            <div className="summary-stat stat-accepted">
              <span className="stat-number">{acceptedCount}</span>
              <span className="stat-label">Zugeordnet</span>
            </div>
            <div className="summary-stat stat-rejected">
              <span className="stat-number">{rejectedCount}</span>
              <span className="stat-label">Ohne Zuordnung</span>
            </div>
            <div className="summary-stat stat-skipped">
              <span className="stat-number">{skippedCount}</span>
              <span className="stat-label">Übersprungen</span>
            </div>
            {svcCount > 0 && (
              <div className="summary-stat stat-service">
                <span className="stat-number">{svcCount}</span>
                <span className="stat-label">Dienstleistungen</span>
              </div>
            )}
            {supplierOpenCount > 0 && (
              <div className="summary-stat stat-supplier-open">
                <span className="stat-number">{supplierOpenCount}</span>
                <span className="stat-label">Lieferant offen</span>
              </div>
            )}
          </div>

          {totalValue > 0 && (
            <div className="summary-total">
              Geschätzter Gesamtwert: {formatMoney(totalValue)}
            </div>
          )}

          <div className="summary-actions">
            <button className="btn btn-secondary" onClick={() => { setCurrentIndex(0); setDecisions({}) }}>
              Nochmal durchgehen
            </button>
            <button className="btn btn-secondary" onClick={onBackToOverview}>
              Zur Übersicht
            </button>
            <button className="btn btn-primary" onClick={onFinish}>
              Angebot exportieren
            </button>
          </div>

          {/* Inquiry overview */}
          {projectId && !inquiriesLoading && pendingInquiries.length > 0 && (
            <div className="summary-inquiries">
              <h3>Offene Lieferantenanfragen</h3>
              <div className="inquiry-summary-list">
                {Object.entries(
                  pendingInquiries.reduce<Record<string, SupplierInquiry[]>>((acc, inq) => {
                    const key = inq.supplier_name
                    if (!acc[key]) acc[key] = []
                    acc[key].push(inq)
                    return acc
                  }, {})
                ).map(([supplierName, inquiries]) => (
                  <div key={supplierName} className="inquiry-supplier-group">
                    <span className="inquiry-supplier-name">{supplierName}</span>
                    <span className="inquiry-count">{inquiries.length} Anfrage{inquiries.length !== 1 ? 'n' : ''}</span>
                  </div>
                ))}
              </div>
              {inquiriesSentResult ? (
                <p className="inquiry-sent-result">
                  {inquiriesSentResult.sent} gesendet{inquiriesSentResult.failed > 0 ? `, ${inquiriesSentResult.failed} fehlgeschlagen` : ''}
                </p>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={sendingInquiries}
                  onClick={async () => {
                    setSendingInquiries(true)
                    try {
                      const result = await sendBatchInquiries(projectId)
                      setInquiriesSentResult({ sent: result.sent_count, failed: result.failed_count })
                      setPendingInquiries([])
                    } catch {
                      setInquiriesSentResult({ sent: 0, failed: pendingInquiries.length })
                    } finally {
                      setSendingInquiries(false)
                    }
                  }}
                >
                  {sendingInquiries ? 'Wird gesendet...' : `Alle ${pendingInquiries.length} Anfragen absenden`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const isServiceView = activeFilter === 'dienstleistung'
  const topSuggestion = currentSuggestions[0] ?? null
  const showLoadClass = currentPosition ? LOAD_CLASS_CATEGORIES.has(currentPosition.parameters.product_category ?? '') : false
  const currentPriceAdjustment = currentPosition
    ? priceAdjustments[currentPosition.id] ?? categoryAdjustments[topSuggestion?.category ?? '']
    : undefined
  const pricingReferenceSuggestion = currentSuggestions.find((s) => s.artikel_id === currentSelectedArticles[0]) ?? topSuggestion
  const progressPercent = totalCount > 0 ? (currentIndex / totalCount) * 100 : 0

  // Multi-component: check if current position has component_suggestions
  const currentPosSuggestionEntry = currentPosition
    ? positionSuggestions.find(ps => ps.position_id === currentPosition.id)
    : null
  const currentComponentSuggestions = currentPosSuggestionEntry?.component_suggestions ?? null
  const isMultiComponent = currentComponentSuggestions != null && currentComponentSuggestions.length > 1

  return (
    <div className="assignment-view">
      {/* Filter tabs */}
      <div className="assignment-tabs">
        <button
          className={`tab-btn ${activeFilter === 'alle' ? 'tab-active' : ''}`}
          onClick={() => setActiveFilter('alle')}
        >
          Alle ({materialPositions.length})
        </button>
        <button
          className={`tab-btn ${activeFilter === 'zugeordnet' ? 'tab-active' : ''}`}
          onClick={() => setActiveFilter('zugeordnet')}
        >
          Zugeordnet ({assignedCount})
        </button>
        <button
          className={`tab-btn ${activeFilter === 'offen' ? 'tab-active' : ''}`}
          onClick={() => setActiveFilter('offen')}
        >
          Offen ({openCount})
        </button>
        <button
          className={`tab-btn ${activeFilter === 'dienstleistung' ? 'tab-active' : ''}`}
          onClick={() => setActiveFilter('dienstleistung')}
        >
          Dienstleistung ({servicePositions.length})
        </button>
        <div className="tab-spacer" />
        <button className="btn btn-ghost btn-overview" onClick={onBackToOverview}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Übersicht
        </button>
      </div>

      {/* Progress bar */}
      <div className="assignment-progress">
        <div className="progress-text">
          <span>{totalCount > 0 ? currentIndex + 1 : 0} / {totalCount} Positionen</span>
          <span className="progress-decided">{decidedCount} bearbeitet</span>
        </div>
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="progress-shortcuts">
          Enter = Übernehmen &middot; Esc = Ablehnen &middot; ←→ = Navigation &middot; ↑↓ = Vorschläge &middot; S = Suchen
        </div>
      </div>

      {/* Empty state when no positions in filter */}
      {totalCount === 0 && (
        <div className="assignment-card">
          <div className="assignment-no-match">
            <p>Keine Positionen in dieser Kategorie.</p>
          </div>
        </div>
      )}

      {/* Position card */}
      {currentPosition && (
        <div className={`assignment-card ${slideDirection === 'left' ? 'slide-out-left' : slideDirection === 'right' ? 'slide-out-right' : 'slide-in'}`}>
          <div className="assignment-position">
            <div className="position-oz">OZ {currentPosition.ordnungszahl}</div>
            <div className="position-desc">{currentPosition.description}</div>
            <div className="position-params">
              {currentPosition.parameters.nominal_diameter_dn && (
                <span className="param-chip">DN {currentPosition.parameters.nominal_diameter_dn}</span>
              )}
              {currentPosition.parameters.material && (
                <span className="param-chip">{currentPosition.parameters.material}</span>
              )}
              {currentPosition.parameters.product_category && (
                <span className="param-chip">{currentPosition.parameters.product_category}</span>
              )}
              {currentPosition.parameters.load_class && (
                <span className="param-chip">{currentPosition.parameters.load_class}</span>
              )}
              {currentPosition.parameters.stiffness_class_sn && (
                <span className="param-chip">SN{currentPosition.parameters.stiffness_class_sn}</span>
              )}
              {currentPosition.quantity != null && currentPosition.unit && (
                <span className="param-chip quantity">{currentPosition.quantity} {currentPosition.unit}</span>
              )}
            </div>
            {projectId && (
              <span
                className={`original-lv-toggle ${showOriginalPdf ? 'open' : ''}`}
                onClick={() => setShowOriginalPdf(v => !v)}
                title="Original-LV Position anzeigen"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Original-LV
              </span>
            )}
            {currentSelectedArticles.length > 0 && (() => {
              const badges = currentSelectedArticles.map((artId, idx) => {
                const sug = currentSuggestions.find(s => s.artikel_id === artId)
                if (!sug) return null
                const isPrimary = idx === 0
                return (
                  <div key={artId} className="assigned-article-badge">
                    {isPrimary ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span className="badge-plus">+</span>
                    )}
                    <span className="badge-name">{sug.artikelname}</span>
                    <span className="badge-id">{sug.artikel_id}</span>
                    {!isPrimary && (
                      <button
                        className="badge-remove"
                        title="Zusatzartikel entfernen"
                        onClick={(e) => { e.stopPropagation(); onRemoveArticle(currentPosition!.id, artId) }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                )
              }).filter(Boolean)
              return badges.length > 0 ? (
                <>
                  <hr className="selected-article-divider" />
                  <div className="assigned-articles-badges">{badges}</div>
                </>
              ) : null
            })()}
            {!isServiceView && currentSelectedArticles.length > 0 && onToggleAlternative && (
              <label className={`alt-check-label ${alternativeFlags[currentPosition.id] ? 'alt-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={alternativeFlags[currentPosition.id] ?? false}
                  onChange={() => onToggleAlternative(currentPosition.id)}
                />
                <span>Alternativ z. baus. Prüfung</span>
                {alternativeFlags[currentPosition.id] && <span className="alt-badge">ALT</span>}
              </label>
            )}
            {isServiceView && (
              <div className="service-badge-info">Dienstleistung — nicht im Angebot enthalten</div>
            )}
          </div>

          {showOriginalPdf && projectId && (
            <div className="original-lv-panel">
              <iframe
                key={currentPosition.ordnungszahl}
                src={`${getProjectPdfUrl(projectId)}#page=${currentPosition.source_page ?? 1}`}
                className="original-lv-iframe"
                title="Original LV"
              />
            </div>
          )}

          {!isServiceView && currentPosition && pricingReferenceSuggestion && (
            <PriceAdjustmentControl
              adjustment={currentPriceAdjustment}
              baseUnitPrice={pricingReferenceSuggestion.price_net}
              quantity={currentPosition.quantity}
              currency={pricingReferenceSuggestion.currency}
              onChange={(next) => onPriceAdjustmentChange(currentPosition.id, next)}
            />
          )}

          {/* Multi-component position */}
          {!isServiceView && isMultiComponent && currentPosition && currentComponentSuggestions && (
            <div className="multi-component-section">
              <div className="multi-component-badge">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Mehrkomponenten-Position ({currentComponentSuggestions.length} Teile)
              </div>
              {(() => {
                // DN consistency check
                const dns = currentComponentSuggestions
                  .map(cs => {
                    const selKey = `${currentPosition.id}::${cs.component_name}`
                    const selId = componentSelections[selKey]
                    const selSugg = selId ? cs.suggestions.find(s => s.artikel_id === selId) : cs.suggestions[0]
                    return selSugg?.dn
                  })
                  .filter((dn): dn is number => dn != null)
                const uniqueDns = new Set(dns)
                const dnInconsistent = uniqueDns.size > 1
                return dnInconsistent ? (
                  <div className="multi-component-warning">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#ca8a04" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    DN-Inkonsistenz: Komponenten haben unterschiedliche Nennweiten ({Array.from(uniqueDns).map(d => `DN${d}`).join(', ')})
                  </div>
                ) : null
              })()}
              <div className="component-list">
                {currentComponentSuggestions.map(cs => {
                  const selKey = `${currentPosition.id}::${cs.component_name}`
                  const selectedId = componentSelections[selKey]
                  const topComp = cs.suggestions[0]
                  const selectedSugg = selectedId ? cs.suggestions.find(s => s.artikel_id === selectedId) ?? topComp : topComp

                  return (
                    <div key={cs.component_name} className="component-card">
                      <div className="component-card-header">
                        <span className="component-name">{cs.component_name}</span>
                        <span className="component-qty">{cs.quantity}x</span>
                      </div>
                      {cs.suggestions.length > 0 && selectedSugg ? (
                        <div className="component-match">
                          <div className="component-match-info">
                            <span className="component-article-name">{selectedSugg.artikelname}</span>
                            <span className="component-article-meta">
                              {selectedSugg.artikel_id}
                              {selectedSugg.hersteller && <> &middot; {selectedSugg.hersteller}</>}
                              {selectedSugg.dn != null && <> &middot; DN{selectedSugg.dn}</>}
                            </span>
                            {selectedSugg.price_net != null && (
                              <span className="component-article-price">
                                {formatMoney(selectedSugg.price_net)} / Einheit
                              </span>
                            )}
                          </div>
                          {cs.suggestions.length > 1 && (
                            <select
                              className="component-select"
                              value={selectedId ?? topComp?.artikel_id ?? ''}
                              onChange={e => onComponentSelect?.(currentPosition.id, cs.component_name, e.target.value)}
                            >
                              {cs.suggestions.map(s => (
                                <option key={s.artikel_id} value={s.artikel_id}>
                                  {s.artikelname} ({formatMoney(s.price_net)})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div className="component-no-match">Kein passender Artikel</div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="top-actions">
                <button className="btn btn-accept" onClick={handleContinue}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Alle Komponenten übernehmen
                </button>
                <button className="btn btn-reject" onClick={handleRejectRequest}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  Ablehnen
                </button>
              </div>
            </div>
          )}

          {/* Unified suggestion carousel — all suggestions in one swipeable view */}
          {!isServiceView && !isMultiComponent && carouselSuggestions.length > 0 && (
            <div className="assignment-carousel-unified">
              <div className="carousel-header">
                <span className="carousel-title">
                  {carouselIndex === 0 ? 'Bester Vorschlag' : `Vorschlag ${carouselIndex + 1}`}
                </span>
                <div className="carousel-nav-compact">
                  <button
                    className="carousel-arrow-sm"
                    disabled={carouselIndex === 0}
                    onClick={() => { setSwipeDir('up'); setCarouselIndex(prev => prev - 1) }}
                    title="Vorheriger Vorschlag (↑)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <span className="carousel-indicator">{carouselIndex + 1} / {carouselSuggestions.length}</span>
                  <button
                    className="carousel-arrow-sm"
                    disabled={carouselIndex >= carouselSuggestions.length - 1}
                    onClick={() => { setSwipeDir('down'); setCarouselIndex(prev => prev + 1) }}
                    title="Nächster Vorschlag (↓)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
              <div
                key={carouselIndex}
                className={`carousel-card-animated ${swipeDir === 'down' ? 'swipe-up-enter' : swipeDir === 'up' ? 'swipe-down-enter' : ''}`}
              >
                {renderSuggestionCard(
                  carouselSuggestions[carouselIndex],
                  currentPosition,
                  showLoadClass,
                  carouselIndex === 0,
                  currentPriceAdjustment,
                  currentSelectedArticles,
                  () => handleSelectArticle(carouselSuggestions[carouselIndex].artikel_id),
                  () => {
                    setInquiryProductName(carouselSuggestions[carouselIndex].artikelname)
                    setInquiryOpen(true)
                  },
                )}
              </div>
              {carouselSuggestions.length > 1 && (
                <div className="carousel-dots">
                  {carouselSuggestions.map((_, i) => (
                    <button
                      key={i}
                      className={`carousel-dot ${i === carouselIndex ? 'active' : ''}`}
                      onClick={() => { setSwipeDir(i > carouselIndex ? 'down' : 'up'); setCarouselIndex(i) }}
                    />
                  ))}
                </div>
              )}
              <div className="top-actions">
                <button className="btn btn-accept" onClick={handleContinue} disabled={!currentSelectedArticle}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Übernehmen & weiter
                </button>
                <button className="btn btn-reject" onClick={handleRejectRequest}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  Ablehnen
                </button>
                {currentPosition && onToggleSupplierOpen && (
                  <label className="supplier-open-toggle">
                    <input
                      type="checkbox"
                      checked={supplierOpenFlags[currentPosition.id] ?? false}
                      onChange={() => onToggleSupplierOpen(currentPosition.id)}
                    />
                    Lieferant offen
                  </label>
                )}
              </div>
            </div>
          )}

          {!isServiceView && !isMultiComponent && carouselSuggestions.length === 0 && (
            <div className="assignment-no-match">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p>Kein passender Artikel gefunden</p>
              <div className="top-actions">
                <button className="btn btn-primary" onClick={() => setSearchOpen(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                    <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Manuell suchen
                </button>
                <button className="btn btn-ghost btn-inquiry" onClick={() => setInquiryOpen(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Lieferantenanfrage
                </button>
                <button className="btn btn-reject" onClick={handleRejectRequest}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  Ablehnen
                </button>
              </div>
            </div>
          )}

          {/* Additional articles section */}
          {!isServiceView && currentSelectedArticles.length > 1 && (() => {
            const additionalArts = currentSelectedArticles.slice(1)
              .map(id => currentSuggestions.find(s => s.artikel_id === id))
              .filter(Boolean) as ProductSuggestion[]
            return additionalArts.length > 0 ? (
              <div className="additional-articles-section">
                <div className="additional-articles-header">Zusatzartikel</div>
                {additionalArts.map(art => (
                  <div key={art.artikel_id} className="additional-article-card">
                    <div className="additional-article-info">
                      <span className="additional-article-plus">+</span>
                      <div className="additional-article-detail">
                        <strong>{art.artikelname}</strong>
                        <span className="additional-article-meta">
                          {art.artikel_id}
                          {art.hersteller && <> &middot; {art.hersteller}</>}
                          {art.price_net != null && <> &middot; {new Intl.NumberFormat('de-DE', { style: 'currency', currency: art.currency ?? 'EUR' }).format(art.price_net)} / Einheit</>}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn-icon-tiny"
                      title="Entfernen"
                      onClick={() => onRemoveArticle(currentPosition!.id, art.artikel_id)}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : null
          })()}

          {/* Manual search & add article buttons */}
          {!isServiceView && carouselSuggestions.length > 0 && (
            <div className="assignment-bottom-actions">
              <button className="btn btn-ghost assignment-search-btn" onClick={() => setSearchOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Manuell suchen
              </button>
              {currentSelectedArticles.length > 0 && (
                <button className="btn btn-ghost assignment-search-btn" onClick={() => setAddArticleSearchOpen(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Artikel hinzufügen
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation — single row, no duplicate skip */}
      {totalCount > 0 && (
        <div className="assignment-nav">
          <button
            className="btn btn-primary"
            onClick={handleContinue}
            disabled={!currentSelectedArticle || isServiceView}
          >
            Übernehmen & weiter
          </button>

          <button
            className="btn btn-ghost"
            onClick={goPrev}
            disabled={currentIndex === 0}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Zurück
          </button>

          <button className="btn btn-ghost" onClick={handleSkip}>
            Überspringen
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button className="btn btn-ghost btn-skip-all" onClick={handleSkipAll}>
            Alle offenen überspringen
          </button>
        </div>
      )}

      {/* Rejection confirmation dialog */}
      {showRejectConfirm && currentPosition && (
        <div className="modal-backdrop" onClick={handleRejectCancel}>
          <div className="modal-box reject-confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Position ohne Zuordnung lassen?</h3>
            <p className="reject-confirm-oz">OZ {currentPosition.ordnungszahl}</p>
            <p className="reject-confirm-desc">Für diese Position wird kein Artikel im Angebot enthalten sein.</p>
            <div className="reject-confirm-actions">
              <button className="btn btn-ghost" onClick={handleRejectCancel}>Abbrechen</button>
              <button className="btn btn-reject" onClick={handleRejectConfirm}>
                Ja, ohne Zuordnung
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product search modal */}
      {currentPosition && (
        <>
          <ProductSearchModal
            isOpen={searchOpen}
            onClose={() => setSearchOpen(false)}
            onSelect={handleManualSearchSelect}
            initialCategory={currentPosition.parameters.product_category}
            initialDn={currentPosition.parameters.nominal_diameter_dn}
          />
          <ProductSearchModal
            isOpen={addArticleSearchOpen}
            onClose={() => setAddArticleSearchOpen(false)}
            onSelect={handleAddArticleSelect}
            initialCategory={currentPosition.parameters.product_category}
            initialDn={currentPosition.parameters.nominal_diameter_dn}
          />
          <InquiryModal
            isOpen={inquiryOpen}
            onClose={() => { setInquiryOpen(false); setInquiryProductName(null) }}
            position={currentPosition}
            projectId={projectId}
            projectName={projectName}
            productDescription={inquiryProductName}
          />
        </>
      )}
    </div>
  )
}

function renderSuggestionCard(
  suggestion: ProductSuggestion,
  position: LVPosition,
  showLoadClass: boolean,
  isTop: boolean,
  priceAdjustment: PriceAdjustment | undefined,
  currentSelectedArticles: string[],
  onSelect: () => void,
  onInquiry?: () => void,
) {
  const stock = stockStatus(suggestion.stock)
  const isSelected = currentSelectedArticles.includes(suggestion.artikel_id)
  const adjustedUnitPrice = computeAdjustedUnitPrice(suggestion.price_net, priceAdjustment)
  const adjustedTotal = computeAdjustedTotal(adjustedUnitPrice, position.quantity)
  const isPrimary = currentSelectedArticles[0] === suggestion.artikel_id
  const showAdjusted = isPrimary && isAdjustedPrice(suggestion.price_net, adjustedUnitPrice)
  const hasWarnings = suggestion.warnings.length > 0

  return (
    <div
      className={`assignment-suggestion ${isTop ? 'suggestion-top' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="suggestion-header">
        <div className="suggestion-title-group">
          {suggestion.is_manual && <span className="manual-badge">Manuell gewählt</span>}
          {suggestion.is_override && <span className="override-badge">Häufig gewählt von Kollegen</span>}
          {isTop && !suggestion.is_manual && !suggestion.is_override && <span className="best-badge">Bester Treffer</span>}
          <strong className="suggestion-name">{suggestion.artikelname}</strong>
        </div>
        <div className="suggestion-header-actions">
          {!suggestion.is_manual && !suggestion.is_override && suggestion.score_breakdown.length > 0 ? (
            <details className="score-details" onClick={(e) => e.stopPropagation()}>
              <summary
                className="score-badge"
                style={{ '--score-color': scoreColor(suggestion.score) } as React.CSSProperties}
              >
                {suggestion.score.toFixed(0)}
              </summary>
              <div className="score-breakdown">
                {suggestion.score_breakdown.map((b) => (
                  <div key={b.component} className={`breakdown-row ${b.points > 0 ? 'row-positive' : b.points < 0 ? 'row-negative' : 'row-neutral'}`}>
                    <span className="breakdown-component">{b.component}</span>
                    <span className={`breakdown-points ${b.points > 0 ? 'positive' : b.points < 0 ? 'negative' : 'zero'}`}>
                      {b.points > 0 ? '+' : ''}{b.points}
                    </span>
                    <span className="breakdown-detail">{b.detail}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            !suggestion.is_manual && suggestion.score > 0 && (
              <span
                className="score-pill"
                style={{ '--score-color': scoreColor(suggestion.score) } as React.CSSProperties}
              >
                {suggestion.score.toFixed(0)}
              </span>
            )
          )}
        </div>
      </div>

      <div className="suggestion-meta">
        <span>{suggestion.artikel_id}</span>
        <span className="meta-sep" />
        <span>{suggestion.hersteller ?? 'Unbekannt'}</span>
      </div>

      <div className="param-badges">
        {suggestion.dn != null && (() => {
          const text = `${position.description ?? ''} ${position.raw_text ?? ''}`
          const dnMatch = text.match(/DN\s*(\d+)/i)
          const reqDn = position.parameters.nominal_diameter_dn ?? (dnMatch ? parseInt(dnMatch[1], 10) : null)
          return <ParamBadge
            label={`DN ${suggestion.dn}`}
            status={reqDn == null ? 'neutral' : reqDn === suggestion.dn ? 'match' : 'mismatch'}
          />
        })()}
        {suggestion.sn != null && (() => {
          const reqSn = position.parameters.stiffness_class_sn
            ?? extractSnFromText(position.description ?? '')
            ?? extractSnFromText(position.raw_text ?? '')
          return <ParamBadge
            label={`SN${suggestion.sn}`}
            status={reqSn == null ? 'neutral' : suggestion.sn! >= reqSn ? 'match' : 'mismatch'}
          />
        })()}
        {showLoadClass && suggestion.load_class && <ParamBadge
          label={suggestion.load_class}
          status={!position.parameters.load_class ? 'neutral' : position.parameters.load_class.toUpperCase() === suggestion.load_class.toUpperCase() ? 'match' : 'mismatch'}
        />}
        {suggestion.norm && (
          <span className={`param-badge param-${!position.parameters.norm ? 'neutral' : suggestion.norm.toLowerCase().includes(position.parameters.norm.toLowerCase()) ? 'match' : 'mismatch'}`}
            style={{
              ...PARAM_STYLES[!position.parameters.norm ? 'neutral' : suggestion.norm.toLowerCase().includes(position.parameters.norm.toLowerCase()) ? 'match' : 'mismatch'],
              padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
            }}
          >
            <DinBadge norm={suggestion.norm} />
          </span>
        )}
      </div>

      <div className="suggestion-price-stack">
        <div className="suggestion-price-row">
          <div className="price-group">
            <span className="price-main">{formatMoney(suggestion.price_net, suggestion.currency)}</span>
            <span className="price-label">EK / Einheit</span>
          </div>
          <div className="price-group">
            <span className="price-total">{formatMoney(suggestion.total_net, suggestion.currency)}</span>
            <span className="price-label">EK gesamt</span>
          </div>
        </div>
        {showAdjusted && (
          <div className="suggestion-price-row suggestion-price-row-vk">
            <div className="price-group">
              <span className="price-main">{formatMoney(adjustedUnitPrice, suggestion.currency)}</span>
              <span className="price-label">VK / Einheit</span>
            </div>
            <div className="price-group">
              <span className="price-total">{formatMoney(adjustedTotal, suggestion.currency)}</span>
              <span className="price-label">VK gesamt</span>
            </div>
          </div>
        )}
      </div>

      <div className="suggestion-stock-row">
        <span className={`stock-indicator ${stock.className}`}>
          <span className="stock-dot" />
          {stock.label}
          {suggestion.stock != null && suggestion.stock > 0 && position.quantity != null && suggestion.stock < position.quantity && (
            <span className="stock-needed"> (benötigt: {position.quantity})</span>
          )}
        </span>
        {suggestion.delivery_days != null && (
          <span className="delivery-badge">
            {suggestion.delivery_days} Tage Lieferzeit
          </span>
        )}
        {onInquiry && (suggestion.stock == null || suggestion.stock <= 0 || (position.quantity != null && suggestion.stock < position.quantity)) && (
          <button className="btn-inquiry-inline" onClick={(e) => { e.stopPropagation(); onInquiry() }} title="Lieferantenanfrage stellen">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Anfragen
          </button>
        )}
      </div>

      {hasWarnings && (
        <div className="suggestion-warnings">
          {suggestion.warnings.map(w => (
            <span key={w} className="warning-chip">{w}</span>
          ))}
        </div>
      )}

      {suggestion.reasons.length > 0 && !suggestion.is_manual && (() => {
        const filtered = suggestion.reasons.filter(r => !r.toLowerCase().includes('lager'))
        return filtered.length > 0 ? (
          <div className="reason-chips">
            {filtered.map((reason) => {
              const lower = reason.toLowerCase()
              const isNegative = lower.includes('abweichend') || lower.includes('weicht ab') || lower.includes('unter ') || lower.includes('≠') || lower.includes('kein') || lower.includes('nicht') || lower.includes('ohne') || lower.includes('fehlt')
              return (
                <span key={reason} className={`reason-chip ${isNegative ? 'reason-negative' : ''}`}>{reason}</span>
              )
            })}
          </div>
        ) : null
      })()}
    </div>
  )
}
