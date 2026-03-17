import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, exportOffer, fetchExportPreview, fetchProject, fetchSingleSuggestions, fetchSuggestions, parseLV, recordOverride, saveSelections } from '../api'
import type {
  AnalysisStep,
  DuplicateInfo,
  ExportPreviewResponse,
  LVPosition,
  PriceAdjustment,
  PositionSuggestions,
  ProductSearchResult,
  ProductSuggestion,
  ProjectMetadata,
  TechnicalParameters,
  UndoAction,
} from '../types'
import { computeAdjustedTotal, computeAdjustedUnitPrice, isAdjustedPrice } from '../utils/pricing'

export function useAnalysis() {
  const [file, setFile] = useState<File | null>(null)
  const [positions, setPositions] = useState<LVPosition[]>([])
  const [positionSuggestions, setPositionSuggestions] = useState<PositionSuggestions[]>([])
  const [selectedArticleIds, setSelectedArticleIds] = useState<Record<string, string[]>>({})
  const [activePositionId, setActivePositionId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [step, setStep] = useState<AnalysisStep>('idle')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [skippedPositionIds, setSkippedPositionIds] = useState<Set<string>>(new Set())
  const [exportPreview, setExportPreview] = useState<ExportPreviewResponse | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false)
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null)
  const [metadata, setMetadata] = useState<ProjectMetadata | null>(null)
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<number | null>(null)
  const [showPdfViewer, setShowPdfViewer] = useState(false)
  const [priceAdjustments, setPriceAdjustments] = useState<Record<string, PriceAdjustment>>({})
  const [categoryAdjustments, setCategoryAdjustments] = useState<Record<string, PriceAdjustment>>({})
  const [alternativeFlags, setAlternativeFlags] = useState<Record<string, boolean>>({})
  const [supplierOpenFlags, setSupplierOpenFlags] = useState<Record<string, boolean>>({})
  // Component selections: key = `${positionId}::${componentName}`, value = artikel_id
  const [componentSelections, setComponentSelections] = useState<Record<string, string>>({})

  const abortRef = useRef<AbortController | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Auto-fill customer/project from metadata
  const metadataAppliedRef = useRef(false)

  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack(prev => [...prev.slice(-19), action])
  }, [])

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000)
  }, [])

  const suggestionMap = useMemo(() => {
    const map: Record<string, ProductSuggestion[]> = {}
    positionSuggestions.forEach((entry) => {
      map[entry.position_id] = entry.suggestions
    })
    return map
  }, [positionSuggestions])

  const activePosition = useMemo(
    () => positions.find((p) => p.id === activePositionId) ?? null,
    [positions, activePositionId],
  )

  const activeSuggestions = activePosition ? suggestionMap[activePosition.id] ?? [] : []

  const selectedCount = useMemo(() => {
    const regularCount = Object.values(selectedArticleIds).filter(ids => ids.length > 0).length
    // Count positions that have component selections but no regular selection
    const componentPositionIds = new Set<string>()
    for (const key of Object.keys(componentSelections)) {
      const [posId] = key.split('::')
      if (!selectedArticleIds[posId]?.length) componentPositionIds.add(posId)
    }
    return regularCount + componentPositionIds.size
  }, [selectedArticleIds, componentSelections])

  const matchedCount = useMemo(() => {
    return positionSuggestions.filter((ps) => ps.suggestions.length > 0).length
  }, [positionSuggestions])

  const serviceCount = useMemo(() => skippedPositionIds.size, [skippedPositionIds])

  const estimatedTotal = useMemo(() => {
    let total = 0
    for (const [posId, artIds] of Object.entries(selectedArticleIds)) {
      if (skippedPositionIds.has(posId)) continue
      const suggestions = suggestionMap[posId]
      if (!suggestions) continue
      const position = positions.find((p) => p.id === posId)
      for (let i = 0; i < artIds.length; i++) {
        const match = suggestions.find((s) => s.artikel_id === artIds[i])
        // Price adjustments only apply to primary article
        const unitPrice = i === 0
          ? computeAdjustedUnitPrice(match?.price_net, priceAdjustments[posId])
          : match?.price_net ?? null
        const artTotal = computeAdjustedTotal(unitPrice, position?.quantity)
        if (artTotal != null) total += artTotal
      }
    }
    return total
  }, [selectedArticleIds, suggestionMap, skippedPositionIds, positions, priceAdjustments])

  const customUnitPrices = useMemo(() => {
    const prices: Record<string, number> = {}
    for (const [posId, artIds] of Object.entries(selectedArticleIds)) {
      if (skippedPositionIds.has(posId) || artIds.length === 0) continue
      const suggestions = suggestionMap[posId]
      const match = suggestions?.find((s) => s.artikel_id === artIds[0])
      const adjustedUnitPrice = computeAdjustedUnitPrice(match?.price_net, priceAdjustments[posId])
      if (isAdjustedPrice(match?.price_net, adjustedUnitPrice) && adjustedUnitPrice != null) {
        prices[posId] = adjustedUnitPrice
      }
    }
    return prices
  }, [selectedArticleIds, suggestionMap, skippedPositionIds, priceAdjustments])

  const handlePriceAdjustmentChange = useCallback((positionId: string, adjustment: PriceAdjustment) => {
    setPriceAdjustments((prev) => ({ ...prev, [positionId]: adjustment }))
    // Remember adjustment per product category for auto-fill
    const posSuggestions = positionSuggestions.find(ps => ps.position_id === positionId)
    const primaryCategory = posSuggestions?.suggestions[0]?.category
    if (primaryCategory) {
      setCategoryAdjustments(prev => ({ ...prev, [primaryCategory]: adjustment }))
    }
  }, [positionSuggestions])

  const handleToggleAlternative = useCallback((positionId: string) => {
    setAlternativeFlags(prev => ({ ...prev, [positionId]: !prev[positionId] }))
  }, [])

  const handleToggleSupplierOpen = useCallback((positionId: string) => {
    setSupplierOpenFlags(prev => ({ ...prev, [positionId]: !prev[positionId] }))
  }, [])

  const handleComponentSelect = useCallback((positionId: string, componentName: string, artikelId: string) => {
    const key = `${positionId}::${componentName}`
    setComponentSelections(prev => ({ ...prev, [key]: artikelId }))
  }, [])

  /** Auto-detect if a product deviates from position requirements */
  const autoDetectAlternative = useCallback((positionId: string, suggestion: ProductSuggestion) => {
    const position = positions.find(p => p.id === positionId)
    if (!position) return

    const reqDn = position.parameters.nominal_diameter_dn
    const reqSn = position.parameters.stiffness_class_sn

    let isDeviation = false
    if (reqDn != null && suggestion.dn != null && reqDn !== suggestion.dn) isDeviation = true
    if (reqSn != null && suggestion.sn != null && suggestion.sn < reqSn) isDeviation = true

    if (isDeviation) {
      setAlternativeFlags(prev => ({ ...prev, [positionId]: true }))
      showToast('Als Alternative zur bauseitigen Prüfung markiert')
    }
  }, [positions, showToast])

  const handleAnalyze = useCallback(async () => {
    if (!file) {
      setErrorText('Bitte zuerst ein LV-PDF auswählen.')
      return
    }
    if (step === 'parsing' || step === 'matching' || step === 'uploading') return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeoutId = setTimeout(() => controller.abort(), 300_000)

    setErrorText(null)
    setStep('uploading')
    setUndoStack([])
    setPriceAdjustments({})
    setCategoryAdjustments({})
    setSupplierOpenFlags({})
    setComponentSelections({})
    metadataAppliedRef.current = false

    try {
      setStep('parsing')
      const parseData = await parseLV(file, controller.signal)
      setPositions(parseData.positions)
      setActivePositionId(parseData.positions[0]?.id ?? null)
      setDuplicateInfo(parseData.duplicate ?? null)
      setMetadata(parseData.metadata ?? null)
      setProjectId(parseData.duplicate?.project_id ?? null)

      // Auto-fill from metadata
      if (parseData.metadata) {
        const m = parseData.metadata
        if (m.kunde_name && !customerName) setCustomerName(m.kunde_name)
        if (m.bauvorhaben && !projectName) setProjectName(m.bauvorhaben)
        metadataAppliedRef.current = true
      }

      // Auto-skip positions the LLM classified as service
      const autoSkipped = new Set(
        parseData.positions
          .filter((p) => p.position_type === 'dienstleistung')
          .map((p) => p.id),
      )
      setSkippedPositionIds(autoSkipped)

      setStep('matching')
      const suggestionData = await fetchSuggestions(parseData.positions, controller.signal)
      setPositionSuggestions(suggestionData.suggestions)

      const defaults: Record<string, string[]> = {}
      const compDefaults: Record<string, string> = {}
      suggestionData.suggestions.forEach((entry) => {
        if (entry.suggestions.length > 0) {
          defaults[entry.position_id] = [entry.suggestions[0].artikel_id]
        }
        if (entry.component_suggestions) {
          for (const cs of entry.component_suggestions) {
            if (cs.suggestions.length > 0) {
              compDefaults[`${entry.position_id}::${cs.component_name}`] = cs.suggestions[0].artikel_id
            }
          }
        }
      })
      setSelectedArticleIds(defaults)
      setComponentSelections(compDefaults)
      setStep('done')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setErrorText('Analyse wurde abgebrochen.')
      } else if (error instanceof ApiError) {
        setErrorText(error.message)
      } else {
        const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
        setErrorText(message)
      }
      setStep('error')
    } finally {
      clearTimeout(timeoutId)
    }
  }, [file, step, customerName, projectName])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /** Swap only the primary (first) article, keeping additional articles intact */
  const handleSwapPrimary = useCallback((positionId: string, artikelId: string) => {
    setSelectedArticleIds((current) => {
      const prev = current[positionId] ?? []
      const additional = prev.slice(1) // keep additional articles
      if (prev[0] === artikelId) return current // no change needed
      return { ...current, [positionId]: [artikelId, ...additional] }
    })
  }, [])

  const handleSuggestionSelect = useCallback((positionId: string, artikelId: string) => {
    setSelectedArticleIds((current) => {
      const prev = current[positionId]
      pushUndo({ type: 'select', positionId, previousArticleIds: prev })
      const next = { ...current, [positionId]: [artikelId] }

      // Record override if user chose a non-top suggestion
      const posSuggestions = positionSuggestions.find(ps => ps.position_id === positionId)
      const topSuggestion = posSuggestions?.suggestions[0]
      if (topSuggestion && topSuggestion.artikel_id !== artikelId && !topSuggestion.is_override) {
        const pos = positions.find(p => p.id === positionId)
        if (pos) {
          recordOverride({
            position_description: pos.description,
            ordnungszahl: pos.ordnungszahl,
            category: pos.parameters.product_category,
            dn: pos.parameters.nominal_diameter_dn,
            material: pos.parameters.material,
            chosen_artikel_id: artikelId,
          }).catch(() => {})
        }
      }

      // Auto-detect alternative
      const selected = positionSuggestions.find(ps => ps.position_id === positionId)
        ?.suggestions.find(s => s.artikel_id === artikelId)
      if (selected) autoDetectAlternative(positionId, selected)

      return next
    })
  }, [positions, positionSuggestions, pushUndo, autoDetectAlternative])

  const handleManualSelect = useCallback((positionId: string, product: ProductSearchResult) => {
    const position = positions.find(p => p.id === positionId)
    const qty = position?.quantity ?? 1
    const unitPrice = product.vk_listenpreis_netto ?? null
    const totalNet = unitPrice != null ? Math.round(unitPrice * qty * 100) / 100 : null

    const syntheticSuggestion: ProductSuggestion = {
      artikel_id: product.artikel_id,
      artikelname: product.artikelname,
      hersteller: product.hersteller ?? null,
      category: product.kategorie ?? null,
      subcategory: null,
      dn: product.nennweite_dn ?? null,
      sn: product.steifigkeitsklasse_sn != null ? parseFloat(String(product.steifigkeitsklasse_sn)) || null : null,
      load_class: product.belastungsklasse ?? null,
      norm: product.norm_primaer ?? null,
      stock: product.lager_gesamt ?? null,
      delivery_days: null,
      price_net: unitPrice,
      total_net: totalNet,
      currency: product.waehrung ?? 'EUR',
      score: 0,
      reasons: ['Manuell gewählt'],
      warnings: [],
      score_breakdown: [],
      is_manual: true,
    }

    setPositionSuggestions(prev => {
      const hasEntry = prev.some(ps => ps.position_id === positionId)
      if (!hasEntry) {
        return [...prev, { position_id: positionId, suggestions: [syntheticSuggestion] }]
      }
      return prev.map(ps => {
        if (ps.position_id !== positionId) return ps
        const filtered = ps.suggestions.filter(s => !s.is_manual)
        return { ...ps, suggestions: [syntheticSuggestion, ...filtered] }
      })
    })

    setSelectedArticleIds(current => {
      const prev = current[positionId]
      pushUndo({ type: 'select', positionId, previousArticleIds: prev })
      const next = { ...current, [positionId]: [product.artikel_id] }
      return next
    })

    // Record override
    if (position) {
      recordOverride({
        position_description: position.description,
        ordnungszahl: position.ordnungszahl,
        category: position.parameters.product_category,
        dn: position.parameters.nominal_diameter_dn,
        material: position.parameters.material,
        chosen_artikel_id: product.artikel_id,
      }).catch(() => {})
    }

    // Auto-detect alternative
    autoDetectAlternative(positionId, syntheticSuggestion)
  }, [positions, pushUndo, autoDetectAlternative])

  const handleAddArticle = useCallback((positionId: string, product: ProductSearchResult) => {
    const position = positions.find(p => p.id === positionId)
    const qty = position?.quantity ?? 1
    const unitPrice = product.vk_listenpreis_netto ?? null
    const totalNet = unitPrice != null ? Math.round(unitPrice * qty * 100) / 100 : null

    const syntheticSuggestion: ProductSuggestion = {
      artikel_id: product.artikel_id,
      artikelname: product.artikelname,
      hersteller: product.hersteller ?? null,
      category: product.kategorie ?? null,
      subcategory: null,
      dn: product.nennweite_dn ?? null,
      sn: product.steifigkeitsklasse_sn != null ? parseFloat(String(product.steifigkeitsklasse_sn)) || null : null,
      load_class: product.belastungsklasse ?? null,
      norm: product.norm_primaer ?? null,
      stock: product.lager_gesamt ?? null,
      delivery_days: null,
      price_net: unitPrice,
      total_net: totalNet,
      currency: product.waehrung ?? 'EUR',
      score: 0,
      reasons: ['Zusatzartikel'],
      warnings: [],
      score_breakdown: [],
      is_manual: true,
    }

    setPositionSuggestions(prev => {
      const hasEntry = prev.some(ps => ps.position_id === positionId)
      if (!hasEntry) {
        // Position has no suggestions entry yet — create one
        return [...prev, { position_id: positionId, suggestions: [syntheticSuggestion] }]
      }
      return prev.map(ps => {
        if (ps.position_id !== positionId) return ps
        // Only add if not already in suggestions
        if (ps.suggestions.some(s => s.artikel_id === product.artikel_id)) return ps
        return { ...ps, suggestions: [...ps.suggestions, syntheticSuggestion] }
      })
    })

    setSelectedArticleIds(current => {
      const prev = current[positionId] ?? []
      if (prev.includes(product.artikel_id)) return current
      pushUndo({ type: 'select', positionId, previousArticleIds: prev })
      const next = { ...current, [positionId]: [...prev, product.artikel_id] }
      return next
    })

    showToast('Zusatzartikel hinzugefügt')
  }, [positions, pushUndo, showToast])

  const handleRemoveArticle = useCallback((positionId: string, artikelId: string) => {
    setSelectedArticleIds(current => {
      const prev = current[positionId] ?? []
      pushUndo({ type: 'select', positionId, previousArticleIds: prev })
      const next = { ...current, [positionId]: prev.filter(id => id !== artikelId) }
      if (next[positionId].length === 0) delete next[positionId]
      return next
    })
  }, [positions, pushUndo])

  const handleToggleSkip = useCallback((positionId: string) => {
    setSkippedPositionIds((prev) => {
      const next = new Set(prev)
      if (next.has(positionId)) {
        next.delete(positionId)
        pushUndo({ type: 'unskip', positionId })
      } else {
        next.add(positionId)
        pushUndo({ type: 'skip', positionId })
        showToast('Position ausgeschlossen')
      }
      return next
    })
  }, [pushUndo, showToast])

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const action = prev[prev.length - 1]
      const rest = prev.slice(0, -1)

      switch (action.type) {
        case 'select':
          setSelectedArticleIds(current => {
            const next = { ...current }
            if (action.previousArticleIds && action.previousArticleIds.length > 0) {
              next[action.positionId] = action.previousArticleIds
            } else {
              delete next[action.positionId]
            }
            return next
          })
          break
        case 'deselect':
          setSelectedArticleIds(current => {
            const next = { ...current, [action.positionId]: action.previousArticleIds }
            return next
          })
          break
        case 'skip':
          setSkippedPositionIds(current => {
            const next = new Set(current)
            next.delete(action.positionId)
            return next
          })
          break
        case 'unskip':
          setSkippedPositionIds(current => {
            const next = new Set(current)
            next.add(action.positionId)
            return next
          })
          break
      }

      showToast('Rückgängig gemacht')
      return rest
    })
  }, [positions, showToast])

  // Ctrl+Z handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (undoStack.length > 0) {
          e.preventDefault()
          handleUndo()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undoStack.length, handleUndo])

  const handleParameterChange = useCallback(async (positionId: string, paramUpdates: Partial<TechnicalParameters>) => {
    const updatedPositions = positions.map((p) => {
      if (p.id !== positionId) return p
      return { ...p, parameters: { ...p.parameters, ...paramUpdates } }
    })
    setPositions(updatedPositions)

    const updatedPosition = updatedPositions.find((p) => p.id === positionId)
    if (!updatedPosition) return

    setIsRefreshingSuggestions(true)
    try {
      const result = await fetchSingleSuggestions(updatedPosition)
      setPositionSuggestions((prev) =>
        prev.map((ps) => (ps.position_id === positionId ? result : ps)),
      )
      if (result.suggestions.length > 0) {
        setSelectedArticleIds((prev) => {
          const next = { ...prev, [positionId]: [result.suggestions[0].artikel_id] }
          return next
        })
      } else {
        setSelectedArticleIds((prev) => {
          const next = { ...prev }
          delete next[positionId]
          return next
        })
      }
    } catch {
      // keep edited parameters even if suggestion refresh fails
    } finally {
      setIsRefreshingSuggestions(false)
    }
  }, [positions])

  /** Build active selections including component selections for multi-component positions */
  const buildActiveSelections = useCallback(() => {
    const activeSelections: Record<string, string[]> = {}
    for (const [posId, artIds] of Object.entries(selectedArticleIds)) {
      if (!skippedPositionIds.has(posId) && artIds.length > 0) {
        activeSelections[posId] = artIds
      }
    }
    // Merge component selections: each component article becomes an additional entry
    for (const [key, artikelId] of Object.entries(componentSelections)) {
      const [posId] = key.split('::')
      if (skippedPositionIds.has(posId)) continue
      if (!activeSelections[posId]) activeSelections[posId] = []
      if (!activeSelections[posId].includes(artikelId)) {
        activeSelections[posId].push(artikelId)
      }
    }
    return activeSelections
  }, [selectedArticleIds, skippedPositionIds, componentSelections])

  const handleExportPreview = useCallback(async () => {
    if (positions.length === 0 || selectedCount === 0) {
      setErrorText('Bitte zuerst eine Analyse durchführen und Artikel auswählen.')
      return
    }

    setIsExporting(true)
    setErrorText(null)

    const activeSelections = buildActiveSelections()

    try {
      const preview = await fetchExportPreview(positions, activeSelections, customerName, projectName, customUnitPrices, alternativeFlags, supplierOpenFlags)
      setExportPreview(preview)
      setShowExportDialog(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
      setErrorText(message)
    } finally {
      setIsExporting(false)
    }
  }, [positions, selectedCount, customerName, projectName, customUnitPrices, alternativeFlags, supplierOpenFlags, buildActiveSelections])

  const handleExportConfirm = useCallback(async () => {
    if (isExporting) return
    setShowExportDialog(false)
    setIsExporting(true)
    setErrorText(null)

    const activeSelections = buildActiveSelections()

    try {
      const blob = await exportOffer(positions, activeSelections, customerName, projectName, customUnitPrices, alternativeFlags, supplierOpenFlags)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tiefbaux-angebot-${Date.now()}.pdf`
      anchor.click()
      window.URL.revokeObjectURL(url)

      // Feature 5: Save selections for future duplicate reuse
      if (projectId) {
        saveSelections(projectId, activeSelections).catch(() => {})
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
      setErrorText(message)
    } finally {
      setIsExporting(false)
    }
  }, [positions, customerName, projectName, isExporting, projectId, customUnitPrices, alternativeFlags, supplierOpenFlags, buildActiveSelections])

  const handleExportCancel = useCallback(() => {
    setShowExportDialog(false)
  }, [])

  const handleAcceptAllTop = useCallback(() => {
    const defaults: Record<string, string[]> = {}
    positionSuggestions.forEach((entry) => {
      if (entry.suggestions.length > 0 && !skippedPositionIds.has(entry.position_id)) {
        defaults[entry.position_id] = [entry.suggestions[0].artikel_id]
      }
    })
    setSelectedArticleIds(defaults)
  }, [positionSuggestions, skippedPositionIds])

  const handleLoadProject = useCallback(async (loadProjectId: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const timeoutId = setTimeout(() => controller.abort(), 300_000)

    setErrorText(null)
    setFile(null)
    setDuplicateInfo(null)
    setUndoStack([])
    setPriceAdjustments({})
    setCategoryAdjustments({})
    setSupplierOpenFlags({})
    setComponentSelections({})
    setStep('matching')
    metadataAppliedRef.current = false

    try {
      const { project, positions: loadedPositions, metadata: loadedMetadata, selections } = await fetchProject(loadProjectId)
      setPositions(loadedPositions)
      setActivePositionId(loadedPositions[0]?.id ?? null)
      setProjectName(project.project_name ?? '')
      setMetadata(loadedMetadata ?? null)
      setProjectId(loadProjectId)

      if (loadedMetadata) {
        if (loadedMetadata.kunde_name) setCustomerName(loadedMetadata.kunde_name)
        if (loadedMetadata.bauvorhaben && !project.project_name) setProjectName(loadedMetadata.bauvorhaben)
      }

      const autoSkipped = new Set(
        loadedPositions
          .filter((p) => p.position_type === 'dienstleistung')
          .map((p) => p.id),
      )
      setSkippedPositionIds(autoSkipped)

      const suggestionData = await fetchSuggestions(loadedPositions, controller.signal)
      setPositionSuggestions(suggestionData.suggestions)

      // Auto-default component selections
      const compDefaults: Record<string, string> = {}
      suggestionData.suggestions.forEach((entry) => {
        if (entry.component_suggestions) {
          for (const cs of entry.component_suggestions) {
            if (cs.suggestions.length > 0) {
              compDefaults[`${entry.position_id}::${cs.component_name}`] = cs.suggestions[0].artikel_id
            }
          }
        }
      })
      setComponentSelections(compDefaults)

      // Use stored selections if available, otherwise default to top suggestions
      if (selections && Object.keys(selections).length > 0) {
        setSelectedArticleIds(selections)
      } else {
        const defaults: Record<string, string[]> = {}
        suggestionData.suggestions.forEach((entry) => {
          if (entry.suggestions.length > 0) {
            defaults[entry.position_id] = [entry.suggestions[0].artikel_id]
          }
        })
        setSelectedArticleIds(defaults)
      }
      setStep('done')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setErrorText('Laden wurde abgebrochen.')
      } else if (error instanceof ApiError) {
        setErrorText(error.message)
      } else {
        setErrorText(error instanceof Error ? error.message : 'Unbekannter Fehler')
      }
      setStep('error')
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])

  const handleRejectSuggestion = useCallback((positionId: string) => {
    setSelectedArticleIds((current) => {
      const prev = current[positionId]
      if (prev && prev.length > 0) {
        pushUndo({ type: 'deselect', positionId, previousArticleIds: prev })
      }
      const next = { ...current }
      delete next[positionId]
      return next
    })
  }, [pushUndo])

  const handleReset = useCallback(() => {
    abortRef.current?.abort()
    setFile(null)
    setPositions([])
    setPositionSuggestions([])
    setSelectedArticleIds({})
    setActivePositionId(null)
    setSkippedPositionIds(new Set())
    setExportPreview(null)
    setShowExportDialog(false)
    setDuplicateInfo(null)
    setMetadata(null)
    setUndoStack([])
    setProjectId(null)
    setShowPdfViewer(false)
    setPriceAdjustments({})
    setCategoryAdjustments({})
    setSupplierOpenFlags({})
    setComponentSelections({})
    setAlternativeFlags({})
    setStep('idle')
    setErrorText(null)
  }, [])

  return {
    file, setFile,
    positions,
    positionSuggestions,
    selectedArticleIds,
    activePositionId, setActivePositionId,
    activePosition,
    activeSuggestions,
    customerName, setCustomerName,
    projectName, setProjectName,
    step,
    errorText,
    isExporting,
    selectedCount,
    matchedCount,
    serviceCount,
    estimatedTotal,
    suggestionMap,
    skippedPositionIds,
    isRefreshingSuggestions,
    duplicateInfo,
    showExportDialog,
    exportPreview,
    metadata,
    undoStack,
    toastMessage,
    projectId,
    showPdfViewer, setShowPdfViewer,
    priceAdjustments,
    categoryAdjustments,
    customUnitPrices,
    handleAnalyze,
    handleCancel,
    handleSuggestionSelect,
    handleSwapPrimary,
    handleManualSelect,
    handleToggleSkip,
    handleParameterChange,
    handleExportPreview,
    handleExportConfirm,
    handleExportCancel,
    handleLoadProject,
    handleReset,
    handleAcceptAllTop,
    handleUndo,
    handleRejectSuggestion,
    handlePriceAdjustmentChange,
    handleAddArticle,
    handleRemoveArticle,
    alternativeFlags,
    handleToggleAlternative,
    supplierOpenFlags,
    handleToggleSupplierOpen,
    componentSelections,
    handleComponentSelect,
  }
}
