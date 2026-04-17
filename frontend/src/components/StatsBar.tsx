type Props = {
  totalPositions: number
  matchedCount: number
  selectedCount: number
  serviceCount: number
  estimatedTotal: number
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function StatsBar({ totalPositions, matchedCount, selectedCount, serviceCount, estimatedTotal }: Props) {
  if (totalPositions === 0) return null

  const matchPercent = totalPositions > 0 ? Math.round((matchedCount / totalPositions) * 100) : 0
  const materialCount = totalPositions - serviceCount

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
        {materialCount > 0 && (
          <div className="stat-progress-bar">
            <div
              className="stat-progress-fill"
              style={{ width: `${Math.round((selectedCount / materialCount) * 100)}%` }}
            />
          </div>
        )}
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
    </div>
  )
}
