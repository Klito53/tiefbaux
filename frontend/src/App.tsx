import './App.css'
import { ExportConfirmDialog } from './components/ExportConfirmDialog'
import { Header } from './components/Header'
import { PositionsList } from './components/PositionsList'
import { ProgressOverlay } from './components/ProgressOverlay'
import { StatsBar } from './components/StatsBar'
import { SuggestionsPanel } from './components/SuggestionsPanel'
import { UploadPanel } from './components/UploadPanel'
import { useAnalysis } from './hooks/useAnalysis'

function App() {
  const analysis = useAnalysis()

  return (
    <main className="app-shell">
      <Header />

      <StatsBar
        totalPositions={analysis.positions.length}
        matchedCount={analysis.matchedCount}
        selectedCount={analysis.selectedCount}
        serviceCount={analysis.serviceCount}
        estimatedTotal={analysis.estimatedTotal}
        compatibilityIssues={analysis.compatibilityIssues}
      />

      <section className="workspace">
        <UploadPanel
          file={analysis.file}
          onFileChange={analysis.setFile}
          onAnalyze={analysis.handleAnalyze}
          onExport={analysis.handleExportPreview}
          onReset={analysis.handleReset}
          customerName={analysis.customerName}
          onCustomerNameChange={analysis.setCustomerName}
          projectName={analysis.projectName}
          onProjectNameChange={analysis.setProjectName}
          step={analysis.step}
          isExporting={analysis.isExporting}
          selectedCount={analysis.selectedCount}
          errorText={analysis.errorText}
        />

        <PositionsList
          positions={analysis.positions}
          activePositionId={analysis.activePositionId}
          onSelectPosition={analysis.setActivePositionId}
          selectedArticleIds={analysis.selectedArticleIds}
          suggestionMap={analysis.suggestionMap}
          skippedPositionIds={analysis.skippedPositionIds}
          onToggleSkip={analysis.handleToggleSkip}
        />

        <SuggestionsPanel
          activePosition={analysis.activePosition}
          suggestions={analysis.activeSuggestions}
          selectedArticleId={analysis.activePosition ? analysis.selectedArticleIds[analysis.activePosition.id] : undefined}
          onSelectArticle={analysis.handleSuggestionSelect}
          compatibilityIssues={analysis.compatibilityIssues}
          onParameterChange={analysis.handleParameterChange}
          isRefreshingSuggestions={analysis.isRefreshingSuggestions}
        />
      </section>

      <ProgressOverlay step={analysis.step} onCancel={analysis.handleCancel} />

      <ExportConfirmDialog
        isOpen={analysis.showExportDialog}
        preview={analysis.exportPreview}
        onConfirm={analysis.handleExportConfirm}
        onCancel={analysis.handleExportCancel}
        isExporting={analysis.isExporting}
      />
    </main>
  )
}

export default App
