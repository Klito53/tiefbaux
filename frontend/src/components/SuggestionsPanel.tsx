import type { CompatibilityIssue, LVPosition, ProductSuggestion, TechnicalParameters } from '../types'
import { ParameterEditor } from './ParameterEditor'

type Props = {
  activePosition: LVPosition | null
  suggestions: ProductSuggestion[]
  selectedArticleId: string | undefined
  onSelectArticle: (positionId: string, artikelId: string) => void
  compatibilityIssues: CompatibilityIssue[]
  onParameterChange: (positionId: string, params: Partial<TechnicalParameters>) => void
  isRefreshingSuggestions: boolean
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

export function SuggestionsPanel({
  activePosition,
  suggestions,
  selectedArticleId,
  onSelectArticle,
  compatibilityIssues,
  onParameterChange,
  isRefreshingSuggestions,
}: Props) {
  return (
    <aside className="panel suggestions-panel">
      <div className="panel-header">
        <div className="panel-number">3</div>
        <div>
          <h2>Artikelvorschläge</h2>
          <p className="panel-copy">
            {activePosition
              ? `Vorschläge für Position ${activePosition.ordnungszahl}`
              : 'Position aus der Mitte auswählen'}
          </p>
        </div>
      </div>

      {!activePosition && (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="empty-icon">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.5" />
            <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <p>Wählen Sie eine Position, um passende Artikel zu sehen.</p>
        </div>
      )}

      {activePosition && (
        <ParameterEditor
          position={activePosition}
          onParameterChange={onParameterChange}
          isRefreshing={isRefreshingSuggestions}
        />
      )}

      {activePosition && suggestions.length === 0 && !isRefreshingSuggestions && (
        <div className="no-match-info">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <strong>Kein passender Artikel gefunden</strong>
            {activePosition.parameters.product_category ? (
              <p>Kategorie: {activePosition.parameters.product_category} — kein Treffer im Katalog.</p>
            ) : (
              <p>Diese Position konnte keiner Produktkategorie zugeordnet werden. Versuchen Sie, die Kategorie oben manuell zu setzen.</p>
            )}
          </div>
        </div>
      )}

      <div className="suggestions-list">
        {activePosition &&
          suggestions.map((suggestion, idx) => {
            const checked = selectedArticleId === suggestion.artikel_id
            const stock = stockStatus(suggestion.stock)
            const isBest = idx === 0
            const hasWarnings = suggestion.warnings.length > 0

            return (
              <label
                key={suggestion.artikel_id}
                className={`suggestion-card ${checked ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name={`pick-${activePosition.id}`}
                  checked={checked}
                  onChange={() => onSelectArticle(activePosition.id, suggestion.artikel_id)}
                />
                <div className="suggestion-body">
                  <div className="suggestion-header">
                    <div className="suggestion-title-group">
                      {isBest && <span className="best-badge">Bester Treffer</span>}
                      <strong className="suggestion-name">{suggestion.artikelname}</strong>
                    </div>
                    <details className="score-details">
                      <summary
                        className="score-badge"
                        style={{ '--score-color': scoreColor(suggestion.score) } as React.CSSProperties}
                      >
                        {suggestion.score.toFixed(0)}
                      </summary>
                      <div className="score-breakdown">
                        {suggestion.score_breakdown.map((b) => (
                          <div key={b.component} className="breakdown-row">
                            <span className="breakdown-component">{b.component}</span>
                            <span className={`breakdown-points ${b.points >= 0 ? 'positive' : 'negative'}`}>
                              {b.points > 0 ? '+' : ''}{b.points}
                            </span>
                            <span className="breakdown-detail">{b.detail}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>

                  <div className="suggestion-meta">
                    <span>{suggestion.artikel_id}</span>
                    <span className="meta-sep" />
                    <span>{suggestion.hersteller ?? 'Unbekannt'}</span>
                    {suggestion.dn && (
                      <>
                        <span className="meta-sep" />
                        <span>DN {suggestion.dn}</span>
                      </>
                    )}
                  </div>

                  <div className="suggestion-price-row">
                    <div className="price-group">
                      <span className="price-main">{formatMoney(suggestion.price_net, suggestion.currency)}</span>
                      <span className="price-label">/ Einheit</span>
                    </div>
                    <div className="price-group">
                      <span className="price-total">{formatMoney(suggestion.total_net, suggestion.currency)}</span>
                      <span className="price-label">Gesamt</span>
                    </div>
                  </div>

                  <div className="suggestion-stock-row">
                    <span className={`stock-indicator ${stock.className}`}>
                      <span className="stock-dot" />
                      {stock.label}
                    </span>
                    {suggestion.delivery_days != null && (
                      <span className="delivery-badge">
                        {suggestion.delivery_days} Tage Lieferzeit
                      </span>
                    )}
                  </div>

                  {hasWarnings && (
                    <div className="suggestion-warnings">
                      {suggestion.warnings.map((warning) => (
                        <span key={warning} className="warning-chip">{warning}</span>
                      ))}
                    </div>
                  )}

                  {suggestion.reasons.length > 0 && (
                    <div className="reason-chips">
                      {suggestion.reasons.map((reason) => (
                        <span key={reason} className="reason-chip">{reason}</span>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            )
          })}
      </div>

      <div className="compatibility-box">
        <h3>Regelengine</h3>
        {compatibilityIssues.length === 0 && <p className="compat-ok">Keine Konflikte erkannt.</p>}
        {compatibilityIssues.map((issue) => (
          <div
            key={`${issue.rule}-${issue.message}`}
            className={`issue-item ${issue.severity === 'KRITISCH' ? 'critical' : 'warning'}`}
          >
            <div className="issue-header">
              <span className={`issue-severity ${issue.severity === 'KRITISCH' ? 'sev-critical' : 'sev-warning'}`}>
                {issue.severity}
              </span>
              <span className="issue-rule">{issue.rule}</span>
            </div>
            <p>{issue.message}</p>
          </div>
        ))}
      </div>
    </aside>
  )
}
