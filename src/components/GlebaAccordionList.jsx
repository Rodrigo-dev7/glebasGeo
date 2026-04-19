import { useEffect, useMemo, useState } from 'react'

const STATUS_META = {
  valida: { label: 'Valida', cls: 'is-valida' },
  invalida: { label: 'Invalida', cls: 'is-invalida' },
  pendente: { label: 'Pendente', cls: 'is-pendente' },
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : '-'
}

function buildCoordinateReference(properties, coordinate, displayIndex) {
  return {
    featureId: properties?.id || null,
    displayIndex,
    vertexIndex: displayIndex,
  }
}

function getCarValidationBadge(carValidation) {
  const primaryType = carValidation?.primaryMatch?.referenceType || 'CAR/KML'

  if (carValidation?.status === 'inside') {
    return {
      className: 'is-inside-car',
      label: `Dentro do ${primaryType}`,
    }
  }

  if (carValidation?.status === 'partial') {
    return {
      className: 'is-partial-car',
      label: `Parcial no ${primaryType}`,
    }
  }

  return null
}

function formatCarValidationMatches(carValidation) {
  const matches = carValidation?.inside?.length
    ? carValidation.inside
    : carValidation?.partialOverlaps || []

  return matches
    .map((match) => match.nome || match.datasetName || match.codigo || null)
    .filter(Boolean)
    .join(' | ')
}

function GlebaAccordionCard({
  gleba,
  isExpanded,
  isSelected,
  activeCoordinateIndex = null,
  onToggle,
  onCoordinateActivate,
}) {
  const properties = gleba.properties || {}
  const statusMeta = STATUS_META[properties.status] || STATUS_META.pendente
  const coordinateStatuses = properties.coordinateStatuses || []
  const carValidationBadge = getCarValidationBadge(properties.carOverlapValidation)
  const carValidationMatches = formatCarValidationMatches(properties.carOverlapValidation)

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
            {carValidationBadge && (
              <span className={`gleba-accordion-car-badge ${carValidationBadge.className}`}>
                {carValidationBadge.label}
              </span>
            )}
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
            {carValidationBadge && (
              <div className="gleba-accordion-field gleba-accordion-field--full gleba-accordion-field--car">
                <span>Validacao CAR/KML</span>
                <strong>{properties.carOverlapValidation?.message || carValidationBadge.label}</strong>
              </div>
            )}
            {carValidationMatches && (
              <div className="gleba-accordion-field gleba-accordion-field--full">
                <span>Contido em</span>
                <strong>{carValidationMatches}</strong>
              </div>
            )}
          </div>

          {coordinateStatuses.length > 0 && (
            <div className="gleba-accordion-coordinates">
              <div className="gleba-accordion-section-title">Coordenadas</div>
              <div className="gleba-accordion-coordinate-list">
                {coordinateStatuses.map((coordinate, index) => (
                  <div
                    key={`${properties.id}-${coordinate.index}`}
                    className={`gleba-accordion-coordinate ${coordinate.isValid ? 'is-valid' : 'is-invalid'}${activeCoordinateIndex === index ? ' is-active-point' : ''}${onCoordinateActivate ? ' is-clickable' : ''}`}
                    role={onCoordinateActivate ? 'button' : undefined}
                    tabIndex={onCoordinateActivate ? 0 : undefined}
                    onClick={onCoordinateActivate ? () => onCoordinateActivate(coordinate, index) : undefined}
                    onKeyDown={onCoordinateActivate ? (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      onCoordinateActivate(coordinate, index)
                    } : undefined}
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
  activeVertexReference = null,
  onActiveVertexChange,
}) {
  const [expandedIds, setExpandedIds] = useState([])

  useEffect(() => {
    const selectedId = selectedGleba?.properties?.id
    if (!selectedId) return

    setExpandedIds((current) => (
      current.includes(selectedId) ? current : [...current, selectedId]
    ))
  }, [selectedGleba])

  useEffect(() => {
    const activeFeatureId = activeVertexReference?.featureId
    if (!activeFeatureId) return

    setExpandedIds((current) => (
      current.includes(activeFeatureId) ? current : [...current, activeFeatureId]
    ))
  }, [activeVertexReference])

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

  const handleCoordinateActivate = (gleba, coordinate, displayIndex) => {
    setSelectedGleba((current) => (
      current?.properties?.id === gleba.properties.id ? current : gleba
    ))

    onActiveVertexChange?.(
      buildCoordinateReference(gleba.properties, coordinate, displayIndex)
    )
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
            activeCoordinateIndex={
              activeVertexReference?.featureId === gleba.properties.id
                ? activeVertexReference.displayIndex
                : null
            }
            onToggle={() => handleToggle(gleba)}
            onCoordinateActivate={(coordinate, index) => (
              handleCoordinateActivate(gleba, coordinate, index)
            )}
          />
        ))}
      </div>
    </section>
  )
}
