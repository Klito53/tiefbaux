import { useCallback, useEffect, useRef, useState } from 'react'
import { searchProducts } from '../api'
import type { ProductSearchResult } from '../types'

const CATEGORIES = [
  '', 'Kanalrohre', 'Formstücke', 'Schachtbauteile', 'Schachtabdeckungen',
  'Straßenentwässerung', 'Rinnen', 'Dichtungen & Zubehör', 'Geotextilien',
  'Kabelschutz', 'Regenwasser', 'Versickerung',
]

type Props = {
  isOpen: boolean
  onClose: () => void
  onSelect: (product: ProductSearchResult) => void
  initialCategory?: string | null
  initialDn?: number | null
}

function formatPrice(value?: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value)
}

export function ProductSearchModal({ isOpen, onClose, onSelect, initialCategory, initialDn }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(initialCategory ?? '')
  const [dn, setDn] = useState(initialDn?.toString() ?? '')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset filters when opening with new position
  useEffect(() => {
    if (isOpen) {
      setCategory(initialCategory ?? '')
      setDn(initialDn?.toString() ?? '')
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, initialCategory, initialDn])

  const doSearch = useCallback(async (q: string, cat: string, dnVal: string) => {
    setIsLoading(true)
    try {
      const parsedDn = dnVal ? parseInt(dnVal, 10) : undefined
      const data = await searchProducts({
        q: q || undefined,
        category: cat || undefined,
        dn: parsedDn && !isNaN(parsedDn) ? parsedDn : undefined,
      })
      setResults(data)
    } catch {
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Debounced search on any filter change
  useEffect(() => {
    if (!isOpen) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(query, category, dn)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, category, dn, isOpen, doSearch])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box product-search-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Katalog durchsuchen</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="search-filters">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Artikelname suchen..."
            className="search-input"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="search-select"
          >
            <option value="">Alle Kategorien</option>
            {CATEGORIES.filter(Boolean).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            type="number"
            value={dn}
            onChange={e => setDn(e.target.value)}
            placeholder="DN"
            className="search-dn"
          />
        </div>

        <div className="search-results">
          {isLoading && <div className="search-loading">Suche...</div>}
          {!isLoading && results.length === 0 && (
            <div className="search-empty">
              {query || category || dn ? 'Keine Ergebnisse' : 'Suchbegriff eingeben oder Filter setzen'}
            </div>
          )}
          {!isLoading && results.map(product => (
            <div key={product.artikel_id} className="search-result-row">
              <div className="search-result-info">
                <strong className="search-result-name">{product.artikelname}</strong>
                <div className="search-result-meta">
                  <span>{product.artikel_id}</span>
                  {product.hersteller && <span>{product.hersteller}</span>}
                  {product.nennweite_dn != null && <span>DN {product.nennweite_dn}</span>}
                  {product.belastungsklasse && <span>{product.belastungsklasse}</span>}
                </div>
                <div className="search-result-details">
                  <span>{formatPrice(product.vk_listenpreis_netto)}</span>
                  <span className={`stock-mini ${(product.lager_gesamt ?? 0) > 0 ? 'in-stock' : 'no-stock'}`}>
                    {(product.lager_gesamt ?? 0) > 0 ? `${product.lager_gesamt} auf Lager` : 'Nicht auf Lager'}
                  </span>
                </div>
              </div>
              <button
                className="search-select-btn"
                onClick={() => { onSelect(product); onClose() }}
              >
                Auswählen
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
