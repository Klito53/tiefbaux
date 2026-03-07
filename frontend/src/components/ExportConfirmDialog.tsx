import type { ExportPreviewResponse } from '../types'

type Props = {
  isOpen: boolean
  preview: ExportPreviewResponse | null
  onConfirm: () => void
  onCancel: () => void
  isExporting: boolean
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

export function ExportConfirmDialog({ isOpen, preview, onConfirm, onCancel, isExporting }: Props) {
  if (!isOpen || !preview) return null

  const hasWarnings = preview.skipped_positions.length > 0
  const skippedCount = preview.total_count - preview.included_count

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Angebot exportieren</h3>

        <div className="dialog-summary">
          <div className="dialog-stat">
            <span className="dialog-stat-value">{preview.included_count}</span>
            <span className="dialog-stat-label">von {preview.total_count} Positionen</span>
          </div>
          <div className="dialog-stat">
            <span className="dialog-stat-value">{formatMoney(preview.total_net)}</span>
            <span className="dialog-stat-label">Netto-Gesamtwert</span>
          </div>
        </div>

        {skippedCount > 0 && (
          <p className="dialog-info">
            {skippedCount} Position{skippedCount !== 1 ? 'en' : ''} ohne Zuordnung — nicht im Angebot enthalten.
          </p>
        )}

        {hasWarnings && (
          <div className="dialog-warnings">
            <h4>Hinweise</h4>
            <ul>
              {preview.skipped_positions.map((w, i) => (
                <li key={i}>
                  <strong>{w.ordnungszahl}:</strong> {w.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={isExporting}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={isExporting}>
            {isExporting ? 'Exportiere…' : 'PDF herunterladen'}
          </button>
        </div>
      </div>
    </div>
  )
}
