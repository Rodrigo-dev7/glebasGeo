/**
 * Sidebar.jsx
 * Painel lateral esquerdo com resumo, importacao e detalhes da gleba selecionada.
 */
import { useEffect, useRef, useState } from 'react'

import GlebaPanel from './GlebaPanel'
import CoordinateValidationPanel from './CoordinateValidationPanel'
import GlebaAccordionList from './GlebaAccordionList'

const MIN_SIDEBAR_WIDTH = 320
const MAX_SIDEBAR_WIDTH = 680
const DEFAULT_SIDEBAR_WIDTH = 380

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
  importedDataset,
  importError,
  isImporting,
  importDataset,
  clearImportedDataset,
  validationResult,
  validateCoordinate,
  exportReport,
  sidebarCollapsed = false,
  onSidebarCollapsedChange,
}) {
  const sidebarRef = useRef(null)
  const isResizingRef = useRef(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)

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

  const handleResizeStart = (event) => {
    event.preventDefault()
    isResizingRef.current = true
    document.body.classList.add('is-resizing-sidebar')
  }

  return (
    <aside
      ref={sidebarRef}
      className={`sidebar${sidebarCollapsed ? ' sidebar--collapsed' : ''}`}
      style={sidebarCollapsed ? undefined : { width: `${sidebarWidth}px` }}
      aria-hidden={sidebarCollapsed}
    >
        <div className="sidebar-scroll">
          <div className="sidebar-header">
            <div className="sidebar-header-brand">
              <div className="sidebar-logo-icon">Geo</div>
              <div className="sidebar-logo-text">
                <div className="sidebar-logo-name">GlebasGEO</div>
                <div className="sidebar-logo-sub">Validador geoespacial · SICOR</div>
              </div>
            </div>
            <div className="sidebar-header-actions">
              <div className="sidebar-badge">v1.0</div>
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={() => onSidebarCollapsedChange?.(true)}
                aria-label="Ocultar painel lateral"
                title="Ocultar painel lateral"
              >
                <IconPanelLeft />
              </button>
            </div>
          </div>

          <div className="sidebar-stats">
            <div className="stats-title">Resumo da validacao</div>
            <div className="stats-grid">
              <StatCard value={stats.total} label="Total" variant="total" shortLabel="Base" />
              <StatCard value={stats.validas} label="Validas" variant="valida" shortLabel="OK" />
              <StatCard value={stats.invalidas} label="Invalidas" variant="invalida" shortLabel="ER" />
              <StatCard value={stats.pendentes} label="Pendentes" variant="pendente" shortLabel="AV" />
            </div>
            <div className="stats-area">
              <span className="stats-area-label">Area total cadastrada:</span>
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
              validationResult={validationResult}
              validateCoordinate={validateCoordinate}
              exportReport={exportReport}
            />
          </div>

          <div className="sidebar-divider" />

          <div className="sidebar-panel-wrap">
            <GlebaAccordionList
              glebas={glebas?.features || []}
              selectedGleba={selectedGleba}
              setSelectedGleba={setSelectedGleba}
            />

            {selectedGleba ? (
              <div className="sidebar-selected-panel">
                <div className="sidebar-section-title">
                  Gleba em destaque
                </div>
                <GlebaPanel
                  gleba={selectedGleba}
                  onClose={() => {
                    setSelectedGleba(null)
                  }}
                />
              </div>
            ) : (
              <div className="sidebar-hint">
                <div className="hint-icon">Mapa</div>
                <p className="hint-text">
                  Selecione ou expanda uma gleba para visualizar os detalhes tecnicos nesta lateral.
                </p>
              </div>
            )}
          </div>
        </div>

      <button
        type="button"
        className="sidebar-resize-handle"
        onMouseDown={handleResizeStart}
        aria-label="Redimensionar barra lateral"
        title="Arraste para redimensionar"
        disabled={sidebarCollapsed}
      />
    </aside>
  )
}
