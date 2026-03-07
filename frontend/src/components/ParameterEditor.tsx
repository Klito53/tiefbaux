import { useCallback, useEffect, useState } from 'react'
import type { LVPosition, TechnicalParameters } from '../types'

const CATEGORIES = [
  'Kanalrohre',
  'Formstücke',
  'Schachtbauteile',
  'Schachtabdeckungen',
  'Straßenentwässerung',
  'Rinnen',
  'Dichtungen & Zubehör',
  'Geotextilien',
]

const LOAD_CLASSES = ['', 'A15', 'B125', 'C250', 'D400', 'E600', 'F900']

type Props = {
  position: LVPosition
  onParameterChange: (positionId: string, params: Partial<TechnicalParameters>) => void
  isRefreshing: boolean
}

export function ParameterEditor({ position, onParameterChange, isRefreshing }: Props) {
  const params = position.parameters
  const [dn, setDn] = useState(params.nominal_diameter_dn?.toString() ?? '')
  const [category, setCategory] = useState(params.product_category ?? '')
  const [material, setMaterial] = useState(params.material ?? '')
  const [loadClass, setLoadClass] = useState(params.load_class ?? '')

  // Sync when position changes
  useEffect(() => {
    setDn(position.parameters.nominal_diameter_dn?.toString() ?? '')
    setCategory(position.parameters.product_category ?? '')
    setMaterial(position.parameters.material ?? '')
    setLoadClass(position.parameters.load_class ?? '')
  }, [position.id, position.parameters])

  const commitChanges = useCallback(
    (overrides: Partial<{ dn: string; category: string; material: string; loadClass: string }> = {}) => {
      const finalDn = overrides.dn ?? dn
      const finalCategory = overrides.category ?? category
      const finalMaterial = overrides.material ?? material
      const finalLoadClass = overrides.loadClass ?? loadClass

      const parsedDn = finalDn ? parseInt(finalDn, 10) : null
      const updates: Partial<TechnicalParameters> = {
        nominal_diameter_dn: parsedDn && !isNaN(parsedDn) ? parsedDn : null,
        product_category: finalCategory || null,
        material: finalMaterial || null,
        load_class: finalLoadClass || null,
      }
      onParameterChange(position.id, updates)
    },
    [position.id, dn, category, material, loadClass, onParameterChange],
  )

  const handleDnBlur = () => commitChanges()
  const handleDnKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitChanges()
  }
  const handleCategoryChange = (value: string) => {
    setCategory(value)
    commitChanges({ category: value })
  }
  const handleLoadClassChange = (value: string) => {
    setLoadClass(value)
    commitChanges({ loadClass: value })
  }
  const handleMaterialBlur = () => commitChanges()
  const handleMaterialKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitChanges()
  }

  return (
    <div className={`parameter-editor ${isRefreshing ? 'refreshing' : ''}`}>
      <h3 className="param-editor-title">
        Erkannte Parameter
        {isRefreshing && <span className="param-spinner" />}
      </h3>
      <div className="param-grid">
        <label className="param-field">
          <span className="param-label">Kategorie</span>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="param-input"
          >
            <option value="">— nicht erkannt —</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </label>
        <label className="param-field">
          <span className="param-label">DN (Nennweite)</span>
          <input
            type="number"
            value={dn}
            onChange={(e) => setDn(e.target.value)}
            onBlur={handleDnBlur}
            onKeyDown={handleDnKeyDown}
            placeholder="z.B. 200"
            className="param-input"
          />
        </label>
        <label className="param-field">
          <span className="param-label">Material</span>
          <input
            type="text"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            onBlur={handleMaterialBlur}
            onKeyDown={handleMaterialKeyDown}
            placeholder="z.B. PVC-U"
            className="param-input"
          />
        </label>
        <label className="param-field">
          <span className="param-label">Belastungsklasse</span>
          <select
            value={loadClass}
            onChange={(e) => handleLoadClassChange(e.target.value)}
            className="param-input"
          >
            {LOAD_CLASSES.map((lc) => (
              <option key={lc} value={lc}>{lc || '— nicht relevant —'}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
