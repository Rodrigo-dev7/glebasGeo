import { useEffect, useState } from 'react'
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
  const [isMobileSidebar, setIsMobileSidebar] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [pointDisplayMode, setPointDisplayMode] = useState('marked')
  const [activeVertexReference, setActiveVertexReference] = useState(null)
  const [isMapHeaderCollapsed, setIsMapHeaderCollapsed] = useState(false)
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
    resetImportedDatasetCoordinates,
    removeGleba,
    clearImportedDataset,
    clearApplicationData,
    carReferenceDataset,
    carReferenceDatasets,
    activeCarReferenceDatasetId,
    selectedCarReferenceFeatureId,
    carImportError,
    isImportingCar,
    importCarReferenceDataset,
    selectCarReferenceDataset,
    selectCarReferenceFeature,
    removeCarReferenceDataset,
    clearCarReferenceDataset,
    validationResult,
    validateCoordinate,
    queryPoint,
    exportReport,
    matchedFeatureIds,
    visibleFeatureIds,
    hiddenFeatureIds,
    toggleGlebaVisibility,
    mapViewportRequest,
    updateFeatureCoordinates,
    updateSelectedGlebaCoordinates,
  } = useGlebas()

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)')

    const syncSidebarMode = (event) => {
      const nextIsMobile = event.matches
      setIsMobileSidebar(nextIsMobile)
      if (!nextIsMobile) {
        setIsMobileSidebarOpen(false)
      }
    }

    syncSidebarMode(mediaQuery)

    const listener = (event) => syncSidebarMode(event)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', listener)
      return () => mediaQuery.removeEventListener('change', listener)
    }

    mediaQuery.addListener(listener)
    return () => mediaQuery.removeListener(listener)
  }, [])

  const isSidebarVisible = isMobileSidebar ? isMobileSidebarOpen : !sidebarCollapsed

  const handleSidebarVisibilityChange = (nextVisible) => {
    if (isMobileSidebar) {
      setIsMobileSidebarOpen(Boolean(nextVisible))
      return
    }

    setSidebarCollapsed(!nextVisible)
  }

  const handleOpenSidebar = () => {
    handleSidebarVisibilityChange(true)
  }

  const handleCloseSidebar = () => {
    handleSidebarVisibilityChange(false)
  }

  const handlePointDisplayModeChange = (nextPointDisplayMode) => {
    resetImportedDatasetCoordinates?.()

    if (nextPointDisplayMode !== pointDisplayMode) {
      setPointDisplayMode(nextPointDisplayMode)
    }
  }

  const handleClearApplicationData = () => {
    clearApplicationData()
    setPointDisplayMode('marked')
    setActiveVertexReference(null)
  }

  const selectedGlebaForMap =
    selectedGleba?.properties?.id && hiddenFeatureIds.includes(selectedGleba.properties.id)
      ? null
      : selectedGleba

  return (
    <div className="app bg-geo-bg text-slate-100">
      <div className={`app-body flex min-h-0 overflow-hidden${!isSidebarVisible ? ' app-body--sidebar-collapsed' : ''}`}>
        {isMobileSidebar && isMobileSidebarOpen && (
          <button
            type="button"
            className="sidebar-mobile-backdrop"
            aria-label="Fechar painel lateral"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        <Sidebar
          stats={stats}
          glebas={glebas}
          selectedGleba={selectedGleba}
          setSelectedGleba={setSelectedGleba}
          hiddenFeatureIds={hiddenFeatureIds}
          toggleGlebaVisibility={toggleGlebaVisibility}
          activeVertexReference={activeVertexReference}
          onActiveVertexChange={setActiveVertexReference}
          importedDataset={importedDataset}
          importError={importError}
          isImporting={isImporting}
          importDataset={importDataset}
          removeGleba={removeGleba}
          clearImportedDataset={clearImportedDataset}
          clearApplicationData={handleClearApplicationData}
          carReferenceDataset={carReferenceDataset}
          carReferenceDatasets={carReferenceDatasets}
          activeCarReferenceDatasetId={activeCarReferenceDatasetId}
          selectedCarReferenceFeatureId={selectedCarReferenceFeatureId}
          carImportError={carImportError}
          isImportingCar={isImportingCar}
          importCarReferenceDataset={importCarReferenceDataset}
          selectCarReferenceDataset={selectCarReferenceDataset}
          selectCarReferenceFeature={selectCarReferenceFeature}
          removeCarReferenceDataset={removeCarReferenceDataset}
          clearCarReferenceDataset={clearCarReferenceDataset}
          validationResult={validationResult}
          validateCoordinate={validateCoordinate}
          exportReport={exportReport}
          sidebarCollapsed={!isSidebarVisible}
          onSidebarCollapsedChange={(nextCollapsed) => {
            if (typeof nextCollapsed === 'boolean') {
              handleSidebarVisibilityChange(!nextCollapsed)
              return
            }

            handleCloseSidebar()
          }}
          isMobile={isMobileSidebar}
          isMobileOpen={isMobileSidebarOpen}
        />

        <main className="map-area min-w-0 flex-1 overflow-hidden">
          <FilterBar
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            stats={stats}
            pointDisplayMode={pointDisplayMode}
            setPointDisplayMode={handlePointDisplayModeChange}
            collapsed={isMapHeaderCollapsed}
            onCollapsedChange={setIsMapHeaderCollapsed}
          />
          <MapView
            glebas={allGlebas}
            carReferenceDataset={carReferenceDataset}
            carReferenceDatasets={carReferenceDatasets}
            activeCarReferenceDatasetId={activeCarReferenceDatasetId}
            selectedCarReferenceFeatureId={selectedCarReferenceFeatureId}
            onSelectCarReferenceFeature={selectCarReferenceFeature}
            selectedGleba={selectedGlebaForMap}
            setSelectedGleba={setSelectedGleba}
            activeVertexReference={activeVertexReference}
            onActiveVertexChange={setActiveVertexReference}
            queryPoint={queryPoint}
            matchedFeatureIds={matchedFeatureIds}
            visibleFeatureIds={visibleFeatureIds}
            viewportRequest={mapViewportRequest}
            updateFeatureCoordinates={updateFeatureCoordinates}
            updateSelectedGlebaCoordinates={updateSelectedGlebaCoordinates}
            layoutRevision={`${isSidebarVisible}-${isMapHeaderCollapsed}`}
            pointDisplayMode={pointDisplayMode}
          />
        </main>

        {!isMobileSidebar && sidebarCollapsed && (
          <button
            type="button"
            className="sidebar-expand-fab"
            onClick={handleOpenSidebar}
            aria-label="Mostrar painel lateral"
            title="Mostrar painel lateral"
          >
            <span className="sidebar-toggle-icon" aria-hidden="true">
              <IconChevronRight />
            </span>
          </button>
        )}

        {isMobileSidebar && !isMobileSidebarOpen && (
          <button
            type="button"
            className="sidebar-mobile-trigger"
            onClick={handleOpenSidebar}
            aria-label="Abrir painel lateral"
            title="Abrir painel lateral"
          >
            <span className="sidebar-toggle-icon" aria-hidden="true">
              <IconChevronRight />
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
