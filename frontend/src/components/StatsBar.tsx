import type { CompatibilityIssue } from '../types'

type Props = {
  totalPositions: number
  matchedCount: number
  selectedCount: number
  serviceCount: number
  estimatedTotal: number
  compatibilityIssues: CompatibilityIssue[]
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function StatsBar({ totalPositions, matchedCount, selectedCount, serviceCount, estimatedTotal, compatibilityIssues }: Props) {
  if (totalPositions === 0) return null

  const matchPercent = totalPositions > 0 ? Math.round((matchedCount / totalPositions) * 100) : 0
  const criticalCount = compatibilityIssues.filter((i) => i.severity === 'KRITISCH').length

  return (
    <div className="stats-bar">
      <div className="stat-item">
        <span className="stat-value">{totalPositions}</span>
        <span className="stat-label">Positionen</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-value stat-accent">{matchedCount}</span>
        <span className="stat-label">Treffer ({matchPercent}%)</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-value">{selectedCount}</span>
        <span className="stat-label">Zugeordnet</span>
      </div>
      {serviceCount > 0 && (
        <>
          <div className="stat-divider" />
          <div className="stat-item">
            <span className="stat-value">{serviceCount}</span>
            <span className="stat-label">Dienstleistung</span>
          </div>
        </>
      )}
      <div className="stat-divider" />
      <div className="stat-item">
        <span className="stat-value">{formatMoney(estimatedTotal)}</span>
        <span className="stat-label">Geschätzter Wert</span>
      </div>
      {criticalCount > 0 && (
        <>
          <div className="stat-divider" />
          <div className="stat-item stat-warning">
            <span className="stat-value">{criticalCount}</span>
            <span className="stat-label">Warnungen</span>
          </div>
        </>
      )}
    </div>
  )
}
