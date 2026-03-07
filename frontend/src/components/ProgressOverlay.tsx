import type { AnalysisStep } from '../types'

type Props = {
  step: AnalysisStep
  onCancel: () => void
}

const STEPS = [
  { key: 'uploading', label: 'PDF hochladen', icon: '1' },
  { key: 'parsing', label: 'Positionen extrahieren & KI-Analyse', icon: '2' },
  { key: 'matching', label: 'Artikel abgleichen', icon: '3' },
  { key: 'done', label: 'Fertig', icon: '4' },
] as const

function stepIndex(step: AnalysisStep): number {
  const idx = STEPS.findIndex((s) => s.key === step)
  return idx >= 0 ? idx : -1
}

export function ProgressOverlay({ step, onCancel }: Props) {
  if (step === 'idle' || step === 'done' || step === 'error') return null

  const currentIdx = stepIndex(step)

  return (
    <div className="progress-overlay">
      <div className="progress-modal">
        <div className="progress-spinner" />
        <h2>LV wird analysiert</h2>
        <p className="progress-subtitle">Bitte warten Sie, während die KI das Leistungsverzeichnis verarbeitet...</p>
        <div className="progress-steps">
          {STEPS.map((s, i) => {
            let state: 'done' | 'active' | 'pending' = 'pending'
            if (i < currentIdx) state = 'done'
            else if (i === currentIdx) state = 'active'

            return (
              <div key={s.key} className={`progress-step ${state}`}>
                <div className="step-indicator">
                  {state === 'done' ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 8l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span>{s.icon}</span>
                  )}
                </div>
                <span className="step-label">{s.label}</span>
                {state === 'active' && <div className="step-pulse" />}
              </div>
            )
          })}
        </div>
        <button className="btn btn-ghost cancel-btn" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
