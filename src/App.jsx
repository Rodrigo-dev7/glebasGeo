/**
 * App.jsx
 * Componente raiz da aplicação GlebasGEO.
 */
import { useState } from 'react'
import { useGlebas } from './hooks/useGlebas'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import FilterBar from './components/FilterBar'

function IconChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const {
    glebas,
    allGlebas,
    stats,
    selectedGleba,
    setSelectedGleba,
    activeFilter,
    setActiveFilter,
    importedDataset,
    importError,
    isImporting,
    importDataset,
    clearImportedDataset,
    validationResult,
    validateCoordinate,
    queryPoint,
    exportReport,
    matchedFeatureIds,
    visibleFeatureIds,
    mapViewportRequest,
    updateSelectedGlebaCoordinates,
  } = useGlebas()

  return (
    <div className="app">
      <header className="topbar topbar--centered">
        <div className="topbar-title">
          Sistema de Validação de Glebas - SICOR / CAR
        </div>
      </header>

      <div className={`app-body${sidebarCollapsed ? ' app-body--sidebar-collapsed' : ''}`}>
        <Sidebar
          stats={stats}
          glebas={glebas}
          selectedGleba={selectedGleba}
          setSelectedGleba={setSelectedGleba}
          importedDataset={importedDataset}
          importError={importError}
          isImporting={isImporting}
          importDataset={importDataset}
          clearImportedDataset={clearImportedDataset}
          validationResult={validationResult}
          validateCoordinate={validateCoordinate}
          exportReport={exportReport}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarCollapsedChange={setSidebarCollapsed}
        />

        <main className="map-area">
          <FilterBar
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            stats={stats}
          />
          <MapView
            glebas={allGlebas}
            selectedGleba={selectedGleba}
            setSelectedGleba={setSelectedGleba}
            queryPoint={queryPoint}
            matchedFeatureIds={matchedFeatureIds}
            visibleFeatureIds={visibleFeatureIds}
            viewportRequest={mapViewportRequest}
            updateSelectedGlebaCoordinates={updateSelectedGlebaCoordinates}
            layoutRevision={sidebarCollapsed}
          />
        </main>

        {sidebarCollapsed && (
          <button
            type="button"
            className="sidebar-expand-fab"
            onClick={() => setSidebarCollapsed(false)}
            aria-label="Mostrar painel lateral"
            title="Mostrar painel lateral"
          >
            <IconChevronRight />
          </button>
        )}
      </div>
    </div>
  )
}
