import { useCallback, useMemo, useRef, useState } from 'react'
import { ApiError, exportOffer, fetchExportPreview, fetchSingleSuggestions, fetchSuggestions, parseLV } from '../api'
import type {
  AnalysisStep,
  CompatibilityIssue,
  ExportPreviewResponse,
  LVPosition,
  PositionSuggestions,
  ProductSuggestion,
  TechnicalParameters,
} from '../types'

export function useAnalysis() {
  const [file, setFile] = useState<File | null>(null)
  const [positions, setPositions] = useState<LVPosition[]>([])
  const [positionSuggestions, setPositionSuggestions] = useState<PositionSuggestions[]>([])
  const [selectedArticleIds, setSelectedArticleIds] = useState<Record<string, string>>({})
  const [compatibilityIssues, setCompatibilityIssues] = useState<CompatibilityIssue[]>([])
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

  const abortRef = useRef<AbortController | null>(null)

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

  const selectedCount = useMemo(() => Object.keys(selectedArticleIds).length, [selectedArticleIds])

  const matchedCount = useMemo(() => {
    return positionSuggestions.filter((ps) => ps.suggestions.length > 0).length
  }, [positionSuggestions])

  const serviceCount = useMemo(() => skippedPositionIds.size, [skippedPositionIds])

  const estimatedTotal = useMemo(() => {
    let total = 0
    for (const [posId, artId] of Object.entries(selectedArticleIds)) {
      if (skippedPositionIds.has(posId)) continue
      const suggestions = suggestionMap[posId]
      if (!suggestions) continue
      const match = suggestions.find((s) => s.artikel_id === artId)
      if (match?.total_net) total += match.total_net
    }
    return total
  }, [selectedArticleIds, suggestionMap, skippedPositionIds])

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

    try {
      setStep('parsing')
      const parseData = await parseLV(file, controller.signal)
      setPositions(parseData.positions)
      setActivePositionId(parseData.positions[0]?.id ?? null)

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
      setCompatibilityIssues(suggestionData.compatibility_issues)

      const defaults: Record<string, string> = {}
      suggestionData.suggestions.forEach((entry) => {
        if (entry.suggestions.length > 0) {
          defaults[entry.position_id] = entry.suggestions[0].artikel_id
        }
      })
      setSelectedArticleIds(defaults)
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
  }, [file, step])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleSuggestionSelect = useCallback((positionId: string, artikelId: string) => {
    setSelectedArticleIds((current) => ({
      ...current,
      [positionId]: artikelId,
    }))
  }, [])

  const handleToggleSkip = useCallback((positionId: string) => {
    setSkippedPositionIds((prev) => {
      const next = new Set(prev)
      if (next.has(positionId)) {
        next.delete(positionId)
      } else {
        next.add(positionId)
      }
      return next
    })
  }, [])

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
        setSelectedArticleIds((prev) => ({ ...prev, [positionId]: result.suggestions[0].artikel_id }))
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

  const handleExportPreview = useCallback(async () => {
    if (positions.length === 0 || selectedCount === 0) {
      setErrorText('Bitte zuerst eine Analyse durchführen und Artikel auswählen.')
      return
    }

    setIsExporting(true)
    setErrorText(null)

    // Filter out skipped positions from selection
    const activeSelections: Record<string, string> = {}
    for (const [posId, artId] of Object.entries(selectedArticleIds)) {
      if (!skippedPositionIds.has(posId)) {
        activeSelections[posId] = artId
      }
    }

    try {
      const preview = await fetchExportPreview(positions, activeSelections, customerName, projectName)
      setExportPreview(preview)
      setShowExportDialog(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
      setErrorText(message)
    } finally {
      setIsExporting(false)
    }
  }, [positions, selectedArticleIds, selectedCount, customerName, projectName, skippedPositionIds])

  const handleExportConfirm = useCallback(async () => {
    setShowExportDialog(false)
    setIsExporting(true)
    setErrorText(null)

    const activeSelections: Record<string, string> = {}
    for (const [posId, artId] of Object.entries(selectedArticleIds)) {
      if (!skippedPositionIds.has(posId)) {
        activeSelections[posId] = artId
      }
    }

    try {
      const blob = await exportOffer(positions, activeSelections, customerName, projectName)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tiefbaux-angebot-${Date.now()}.pdf`
      anchor.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler'
      setErrorText(message)
    } finally {
      setIsExporting(false)
    }
  }, [positions, selectedArticleIds, customerName, projectName, skippedPositionIds])

  const handleExportCancel = useCallback(() => {
    setShowExportDialog(false)
  }, [])

  const handleReset = useCallback(() => {
    abortRef.current?.abort()
    setFile(null)
    setPositions([])
    setPositionSuggestions([])
    setSelectedArticleIds({})
    setCompatibilityIssues([])
    setActivePositionId(null)
    setSkippedPositionIds(new Set())
    setExportPreview(null)
    setShowExportDialog(false)
    setStep('idle')
    setErrorText(null)
  }, [])

  return {
    file, setFile,
    positions,
    positionSuggestions,
    selectedArticleIds,
    compatibilityIssues,
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
    showExportDialog,
    exportPreview,
    handleAnalyze,
    handleCancel,
    handleSuggestionSelect,
    handleToggleSkip,
    handleParameterChange,
    handleExportPreview,
    handleExportConfirm,
    handleExportCancel,
    handleReset,
  }
}
