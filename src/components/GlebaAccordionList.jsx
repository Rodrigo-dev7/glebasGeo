import { useEffect, useMemo, useState } from 'react'

const STATUS_META = {
  valida: { label: 'Valida', cls: 'is-valida' },
  invalida: { label: 'Invalida', cls: 'is-invalida' },
  pendente: { label: 'Pendente', cls: 'is-pendente' },
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : '-'
}

function GlebaAccordionCard({ gleba, isExpanded, isSelected, onToggle }) {
  const properties = gleba.properties || {}
  const statusMeta = STATUS_META[properties.status] || STATUS_META.pendente
  const coordinateStatuses = properties.coordinateStatuses || []

  return (
    <article
      className={`gleba-accordion-card ${isSelected ? 'is-selected' : ''}`}
    >
      <button
        type="button"
        className="gleba-accordion-trigger"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="gleba-accordion-main">
          <div className="gleba-accordion-name">{properties.nome}</div>
          <div className="gleba-accordion-meta">
            <span className={`gleba-accordion-status ${statusMeta.cls}`}>
              {statusMeta.label}
            </span>
            <span className="gleba-accordion-id">{properties.id}</span>
          </div>
        </div>

        <span className="gleba-accordion-arrow" aria-hidden="true">
          {isExpanded ? '^' : 'v'}
        </span>
      </button>

      <div className={`gleba-accordion-content ${isExpanded ? 'is-open' : ''}`}>
        <div className="gleba-accordion-inner">
          <div className="gleba-accordion-grid">
            <div className="gleba-accordion-field">
              <span>Status</span>
              <strong>{statusMeta.label}</strong>
            </div>
            <div className="gleba-accordion-field">
              <span>Pontos</span>
              <strong>{coordinateStatuses.length}</strong>
            </div>
            <div className="gleba-accordion-field">
              <span>Uso</span>
              <strong>{properties.tipo_uso || '-'}</strong>
            </div>
            <div className="gleba-accordion-field">
              <span>Origem</span>
              <strong>{properties.origem_arquivo || 'Base interna'}</strong>
            </div>
            <div className="gleba-accordion-field">
              <span>Municipio</span>
              <strong>{properties.municipio || '-'}</strong>
            </div>
            <div className="gleba-accordion-field">
              <span>UF</span>
              <strong>{properties.uf || '-'}</strong>
            </div>
          </div>

          {coordinateStatuses.length > 0 && (
            <div className="gleba-accordion-coordinates">
              <div className="gleba-accordion-section-title">Coordenadas</div>
              <div className="gleba-accordion-coordinate-list">
                {coordinateStatuses.map((coordinate) => (
                  <div
                    key={`${properties.id}-${coordinate.index}`}
                    className={`gleba-accordion-coordinate ${coordinate.isValid ? 'is-valid' : 'is-invalid'}`}
                  >
                    <span>P{coordinate.index}</span>
                    <span>{formatCoordinate(coordinate.lat)}</span>
                    <span>{formatCoordinate(coordinate.lon)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(properties.errors?.length > 0 || properties.warnings?.length > 0) && (
            <div className="gleba-accordion-issues">
              <div className="gleba-accordion-section-title">Criticas</div>
              {[...(properties.errors || []), ...(properties.warnings || [])].map((issue, index) => (
                <div key={`${properties.id}-issue-${index}`} className="gleba-accordion-issue">
                  {issue.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

export default function GlebaAccordionList({
  glebas = [],
  selectedGleba,
  setSelectedGleba,
}) {
  const [expandedIds, setExpandedIds] = useState([])

  useEffect(() => {
    const selectedId = selectedGleba?.properties?.id
    if (!selectedId) return

    setExpandedIds((current) => (
      current.includes(selectedId) ? current : [...current, selectedId]
    ))
  }, [selectedGleba])

  const expandedIdSet = useMemo(() => new Set(expandedIds), [expandedIds])

  const handleToggle = (gleba) => {
    const featureId = gleba.properties.id

    setExpandedIds((current) => (
      current.includes(featureId)
        ? current.filter((id) => id !== featureId)
        : [...current, featureId]
    ))

    setSelectedGleba((current) => (
      current?.properties?.id === featureId ? current : gleba
    ))
  }

  if (!glebas.length) {
    return (
      <div className="sidebar-hint sidebar-hint--compact">
        <div className="hint-icon">Lista</div>
        <p className="hint-text">
          Nenhuma gleba disponivel para o filtro atual.
        </p>
      </div>
    )
  }

  return (
    <section className="sidebar-gleba-list">
      <div className="sidebar-section-title">
        Glebas carregadas <span>{glebas.length}</span>
      </div>

      <div className="sidebar-gleba-list-items">
        {glebas.map((gleba) => (
          <GlebaAccordionCard
            key={gleba.properties.id}
            gleba={gleba}
            isExpanded={expandedIdSet.has(gleba.properties.id)}
            isSelected={selectedGleba?.properties?.id === gleba.properties.id}
            onToggle={() => handleToggle(gleba)}
          />
        ))}
      </div>
    </section>
  )
}
