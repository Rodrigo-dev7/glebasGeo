import { useEffect, useRef, useState } from 'react'

import GlebaPanel from './GlebaPanel'
import CoordinateValidationPanel from './CoordinateValidationPanel'
import GlebaAccordionList from './GlebaAccordionList'

const MIN_SIDEBAR_WIDTH = 280
const MAX_SIDEBAR_WIDTH = 640
const DEFAULT_SIDEBAR_WIDTH = 320
const SIDEBAR_WIDTH_STORAGE_KEY = 'glebasgeo:sidebar-width'
const RESIZE_EDGE_HITBOX = 18

function IconPanelLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  )
}

function StatCard({ value, label, variant, shortLabel }) {
  return (
    <div className={`stat-card stat-card--${variant}`}>
      <span className="stat-card__badge">{shortLabel}</span>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  )
}

export default function Sidebar({
  stats,
  glebas,
  selectedGleba,
  setSelectedGleba,
  activeVertexReference,
  onActiveVertexChange,
  importedDataset,
  importError,
  isImporting,
  importDataset,
  clearImportedDataset,
  carReferenceDataset,
  carReferenceDatasets,
  activeCarReferenceDatasetId,
  carImportError,
  isImportingCar,
  importCarReferenceDataset,
  selectCarReferenceDataset,
  removeCarReferenceDataset,
  clearCarReferenceDataset,
  validationResult,
  validateCoordinate,
  exportReport,
  sidebarCollapsed = false,
  onSidebarCollapsedChange,
  isMobile = false,
  isMobileOpen = false,
}) {
  const sidebarRef = useRef(null)
  const isResizingRef = useRef(false)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH

    const savedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
    if (!Number.isFinite(savedWidth)) return DEFAULT_SIDEBAR_WIDTH

    return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, savedWidth))
  })

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!isResizingRef.current || !sidebarRef.current) return

      const { left } = sidebarRef.current.getBoundingClientRect()
      const nextWidth = event.clientX - left
      const clampedWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, nextWidth))
      setSidebarWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      if (!isResizingRef.current) return

      isResizingRef.current = false
      document.body.classList.remove('is-resizing-sidebar')
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.classList.remove('is-resizing-sidebar')
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  const handleResizeStart = (event) => {
    if (isMobile || sidebarCollapsed) return
    event.preventDefault()
    isResizingRef.current = true
    document.body.classList.add('is-resizing-sidebar')
  }

  const handleResizeReset = () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
  }

  const handleSidebarMouseDown = (event) => {
    if (isMobile || sidebarCollapsed || !sidebarRef.current) return

    const bounds = sidebarRef.current.getBoundingClientRect()
    const distanceFromRight = bounds.right - event.clientX

    if (distanceFromRight < 0 || distanceFromRight > RESIZE_EDGE_HITBOX) {
      return
    }

    handleResizeStart(event)
  }

  const sidebarContentId = 'sidebar-content'

  return (
    <aside
      ref={sidebarRef}
      className={`sidebar${sidebarCollapsed ? ' sidebar--collapsed' : ''}`}
      data-collapsed={sidebarCollapsed ? 'true' : 'false'}
      data-mobile={isMobile ? 'true' : 'false'}
      data-open={isMobileOpen ? 'true' : 'false'}
      style={sidebarCollapsed ? undefined : { width: `${sidebarWidth}px` }}
      aria-hidden={sidebarCollapsed}
      onMouseDown={handleSidebarMouseDown}
    >
      <div id={sidebarContentId} className="sidebar-scroll">
        <div className="sidebar-header">
          <div className="sidebar-header-brand">
            <div className="sidebar-logo-icon">Geo</div>
            <div className="sidebar-logo-text">
              <div className="sidebar-logo-name">GlebasGEO</div>
              <div className="sidebar-logo-meta">
                <div className="sidebar-logo-sub">Validacao tecnica integrada</div>
              </div>
            </div>
          </div>

          <div className="sidebar-header-actions">
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={() => onSidebarCollapsedChange?.(true)}
              aria-label="Ocultar painel lateral"
              aria-controls={sidebarContentId}
              aria-expanded={!sidebarCollapsed}
              title="Ocultar painel lateral"
            >
              <IconPanelLeft />
            </button>
          </div>
        </div>

        <div className="sidebar-stats">
          <div className="stats-head">
            <div>
              <div className="stats-kicker">Resumo operacional</div>
              <div className="stats-title">Panorama da base</div>
            </div>
          </div>

          <div className="stats-grid">
            <StatCard value={stats.total} label="Total" variant="total" shortLabel="Base" />
            <StatCard value={stats.validas} label="Validas" variant="valida" shortLabel="OK" />
            <StatCard value={stats.invalidas} label="Invalidas" variant="invalida" shortLabel="ER" />
          </div>

          <div className="stats-area">
            <span className="stats-area-label">Area total cadastrada</span>
            <span className="stats-area-value">{stats.areaTotal} ha</span>
          </div>
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-tools">
          <CoordinateValidationPanel
            importedDataset={importedDataset}
            importError={importError}
          isImporting={isImporting}
          importDataset={importDataset}
          clearImportedDataset={clearImportedDataset}
          carReferenceDataset={carReferenceDataset}
          carReferenceDatasets={carReferenceDatasets}
          activeCarReferenceDatasetId={activeCarReferenceDatasetId}
          carImportError={carImportError}
          isImportingCar={isImportingCar}
          importCarReferenceDataset={importCarReferenceDataset}
          selectCarReferenceDataset={selectCarReferenceDataset}
          removeCarReferenceDataset={removeCarReferenceDataset}
          clearCarReferenceDataset={clearCarReferenceDataset}
          validationResult={validationResult}
          validateCoordinate={validateCoordinate}
          exportReport={exportReport}
          />
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-panel-wrap">
          <div className="sidebar-surface">
            <GlebaAccordionList
              glebas={glebas?.features || []}
              selectedGleba={selectedGleba}
              setSelectedGleba={setSelectedGleba}
              activeVertexReference={activeVertexReference}
              onActiveVertexChange={onActiveVertexChange}
            />
          </div>

          {selectedGleba ? (
            <div className="sidebar-surface sidebar-surface--selected">
              <div className="sidebar-section-title">
                Gleba em destaque
              </div>
              <GlebaPanel
                gleba={selectedGleba}
                activeCoordinateIndex={
                  activeVertexReference?.featureId === selectedGleba.properties?.id
                    ? activeVertexReference.displayIndex
                    : null
                }
                onActiveVertexChange={onActiveVertexChange}
                onClose={() => {
                  setSelectedGleba(null)
                }}
              />
            </div>
          ) : (
            <div className="sidebar-surface sidebar-surface--hint">
              <div className="sidebar-hint">
                <div className="hint-icon">Mapa</div>
                <p className="hint-text">
                  Selecione ou expanda uma gleba para visualizar os detalhes tecnicos nesta lateral.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className="sidebar-resize-handle"
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResizeReset}
        aria-label="Redimensionar barra lateral"
        title="Arraste para redimensionar. Clique duplo para restaurar."
        disabled={sidebarCollapsed}
      />
    </aside>
  )
}
