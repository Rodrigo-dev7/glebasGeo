/**
 * GlebaPanel.jsx
 * Painel lateral com detalhes, erros SICOR, validacao CAR e coordenadas da gleba selecionada.
 */
import { useMemo, useState } from 'react'

const STATUS_CONFIG = {
  valida: { label: 'Valida', icon: 'Valida', cls: 'panel-status--valida' },
  invalida: { label: 'Invalida', icon: 'Invalida', cls: 'panel-status--invalida' },
  pendente: { label: 'Pendente', icon: 'Pendente', cls: 'panel-status--pendente' },
}

const TABS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'coordenadas', label: 'Coordenadas' },
  { key: 'criticas', label: 'Criticas SICOR' },
]

function DetailRow({ label, value, mono = false }) {
  const isEmpty = value === null || value === undefined || value === ''

  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className={`detail-value ${mono ? 'detail-mono' : ''}`}>
        {isEmpty ? <span className="detail-empty">-</span> : value}
      </span>
    </div>
  )
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(11) : '-'
}

function formatPointLabel(index) {
  return `P${Number(index) + 1}`
}

function formatSegmentLabel(index) {
  const start = formatPointLabel(index)
  const end = formatPointLabel(index + 1)
  return `${start} -> ${end}`
}

function buildCoordinateReference(featureId, coordinate, displayIndex) {
  return {
    featureId: featureId || null,
    displayIndex,
    vertexIndex: displayIndex,
  }
}

function CoordinateTable({
  coordinates = [],
  activeCoordinateIndex = null,
  featureId = null,
  onCoordinateActivate,
}) {
  if (!coordinates.length) return null

  return (
    <div className="coord-table-wrap">
      <div className="panel-section-title">Coordenadas da gleba</div>
      <div className="coord-table">
        <div className="coord-table-head">
          <span>Ponto</span>
          <span>Latitude</span>
          <span>Longitude</span>
          <span>Status</span>
        </div>

        {coordinates.map((coordinate, index) => (
          <div
            key={`${coordinate.index}-${coordinate.lat}-${coordinate.lon}`}
            className={`coord-table-row ${coordinate.isValid ? 'is-valid' : 'is-invalid'}${activeCoordinateIndex === index ? ' is-active-point' : ''}${onCoordinateActivate ? ' is-clickable' : ''}`}
            role={onCoordinateActivate ? 'button' : undefined}
            tabIndex={onCoordinateActivate ? 0 : undefined}
            onClick={onCoordinateActivate ? () => (
              onCoordinateActivate(buildCoordinateReference(featureId, coordinate, index))
            ) : undefined}
            onKeyDown={onCoordinateActivate ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onCoordinateActivate(buildCoordinateReference(featureId, coordinate, index))
            } : undefined}
          >
            <span className="coord-point-index">{coordinate.index}</span>
            <span className="coord-point-value">{formatCoordinate(coordinate.lat)}</span>
            <span className="coord-point-value">{formatCoordinate(coordinate.lon)}</span>
            <span className="coord-point-status">
              {coordinate.isValid ? 'Correta' : 'Com erro'}
            </span>
            {coordinate.issues?.length > 0 && (
              <div className="coord-point-issues">
                {coordinate.issues.map((issue, index) => (
                  <span key={`${coordinate.index}-${index}`}>{issue.message}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CarValidationSection({ carValidation }) {
  if (!carValidation) return null

  const statusLabel = {
    not_loaded: 'Nao analisado',
    clear: 'Sem sobreposicao',
    overlap: 'Com sobreposicao',
  }[carValidation.status] || 'Nao analisado'

  return (
    <div className="panel-section">
      <div className="panel-section-title">Validacao CAR</div>
      <div className="details-grid">
        <DetailRow label="Status" value={statusLabel} />
        <DetailRow label="Sobreposicoes" value={carValidation.overlapCount} />
      </div>

      <div className="details-grid details-grid--full">
        <DetailRow label="Base de referencia" value={carValidation.referenceFileName} />
        <DetailRow label="Resultado" value={carValidation.message} />
      </div>
    </div>
  )
}

function SelfOverlapSection({ metrics }) {
  const repeatedVertexGroups = metrics.repeatedVertexGroups || []
  const selfOverlapPairs = metrics.selfOverlapPairs || []

  if (!repeatedVertexGroups.length && !selfOverlapPairs.length) {
    return null
  }

  return (
    <div className="panel-section">
      <div className="panel-section-title panel-section-title--err">
        Sobreposicao interna da gleba
      </div>

      <div className="details-grid">
        <DetailRow label="Vertices repetidos" value={repeatedVertexGroups.length} />
        <DetailRow label="Cruzamentos" value={selfOverlapPairs.length} />
      </div>

      <div className="issues-list">
        {repeatedVertexGroups.map((group, index) => (
          <div key={`repeat-${index}`} className="issue-card issue-card--err">
            <span className="issue-code">Vertices coincidentes</span>
            <p className="issue-msg">
              {group.map((pointIndex) => formatPointLabel(pointIndex)).join(', ')}
            </p>
          </div>
        ))}

        {selfOverlapPairs.map((pair, index) => (
          <div key={`pair-${index}`} className="issue-card issue-card--err">
            <span className="issue-code">Trechos cruzados</span>
            <p className="issue-msg">
              {formatSegmentLabel(pair.leftSegmentIndex)} cruza {formatSegmentLabel(pair.rightSegmentIndex)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummarySection({ properties, metrics }) {
  const hasCarOverlap = properties.carOverlapValidation?.status === 'overlap'
  const hasSelfOverlap = (metrics.selfOverlapSegmentCount || 0) > 0 || (metrics.repeatedVertexIndexes?.length || 0) > 0

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">Dados cadastrais</div>
        <div className="details-grid">
          <DetailRow
            label="Area total"
            value={properties.area ? `${properties.area} ha` : null}
          />
          <DetailRow label="Tipo de uso" value={properties.tipo_uso} />
          <DetailRow label="Municipio" value={properties.municipio} />
          <DetailRow label="UF" value={properties.uf} />
          <DetailRow label="Situacao" value={properties.situacao_cadastral} />
          <DetailRow label="Data de inscricao" value={properties.data_inscricao} />
        </div>

        <div className="details-grid details-grid--full">
          <DetailRow label="Proprietario" value={properties.proprietario} />
          <DetailRow label="Codigo SNCR/CAR" value={properties.codigo_imovel} mono />
          <DetailRow label="Arquivo de origem" value={properties.origem_arquivo} />
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-section-title">Regras SICOR</div>
        <div className="details-grid">
          <DetailRow label="Poligono fechado" value={metrics.isClosed ? 'Sim' : 'Nao'} />
          <DetailRow label="Pontos informados" value={metrics.originalPointCount} />
          <DetailRow label="Pontos unicos" value={metrics.uniquePointCount} />
          <DetailRow label="Repeticoes do primeiro" value={metrics.repeatedStartCount} />
          <DetailRow label="Vertices sobrepostos" value={metrics.repeatedVertexIndexes?.length || 0} />
          <DetailRow label="Trechos cruzados" value={metrics.selfOverlapSegmentCount || 0} />
        </div>
      </div>

      <SelfOverlapSection metrics={metrics} />

      <CarValidationSection carValidation={properties.carOverlapValidation} />

      {!properties.errors?.length && !properties.warnings?.length && !hasCarOverlap && !hasSelfOverlap && (
        <div className="panel-ok">
          <span className="panel-ok-icon">OK</span>
          <p>Gleba validada sem criticas nas regras SICOR analisadas.</p>
        </div>
      )}
    </>
  )
}

function CritiquesSection({ properties }) {
  if (!properties.errors?.length && !properties.warnings?.length) {
    return (
      <div className="panel-ok">
        <span className="panel-ok-icon">OK</span>
        <p>Nenhuma critica registrada para esta gleba.</p>
      </div>
    )
  }

  return (
    <>
      {properties.errors?.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-title panel-section-title--err">
            Criticas SICOR <span className="issue-count">{properties.errors.length}</span>
          </div>
          <div className="issues-list">
            {properties.errors.map((error, index) => (
              <div key={index} className="issue-card issue-card--err">
                <span className="issue-code">{error.label}</span>
                <p className="issue-msg">{error.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {properties.warnings?.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-title panel-section-title--warn">
            Avisos <span className="issue-count">{properties.warnings.length}</span>
          </div>
          <div className="issues-list">
            {properties.warnings.map((warning, index) => (
              <div key={index} className="issue-card issue-card--warn">
                <span className="issue-code">{warning.label}</span>
                <p className="issue-msg">{warning.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export default function GlebaPanel({
  gleba,
  activeCoordinateIndex = null,
  onActiveVertexChange,
  onClose,
  titleId,
  showTabs = false,
}) {
  const [activeTab, setActiveTab] = useState('resumo')

  const properties = gleba?.properties
  const config = properties ? STATUS_CONFIG[properties.status] || STATUS_CONFIG.pendente : null
  const metrics = properties?.validationMetrics || {}

  const availableTabs = useMemo(() => {
    if (!showTabs) return []
    return TABS
  }, [showTabs])

  if (!gleba || !properties || !config) return null

  return (
    <div className="gleba-panel">
      <div className={`panel-status-bar ${config.cls}`}>
        <span className="panel-status-badge">
          {config.icon} {config.label}
        </span>
        <div className="panel-header-right">
          <span className="panel-id">{properties.id}</span>
          {onClose && (
            <button className="panel-close" onClick={onClose} title="Fechar">
              x
            </button>
          )}
        </div>
      </div>

      <div className="panel-body">
        <h3 className="panel-nome" id={titleId}>{properties.nome}</h3>
        <div className="panel-location-card">
          <span className="panel-location-card__label">Municipio / UF</span>
          <strong className="panel-location-card__value">
            {properties.municipio || '-'}
            {properties.uf ? ` / ${properties.uf}` : ''}
          </strong>
        </div>

        <div className="panel-edit-hint">
          Clique na gleba e arraste diretamente os pontos verdes ou vermelhos no mapa para redimensionar. A area, a validacao e a checagem contra o CAR sao recalculadas automaticamente.
        </div>

        {showTabs && (
          <div className="gleba-tabs" role="tablist" aria-label="Detalhes da gleba">
            {availableTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`gleba-tab ${activeTab === tab.key ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                aria-selected={activeTab === tab.key}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {(!showTabs || activeTab === 'resumo') && (
          <SummarySection properties={properties} metrics={metrics} />
        )}

        {(!showTabs || activeTab === 'coordenadas') && (
          <CoordinateTable
            coordinates={properties.coordinateStatuses}
            activeCoordinateIndex={activeCoordinateIndex}
            featureId={properties.id}
            onCoordinateActivate={onActiveVertexChange}
          />
        )}

        {(!showTabs || activeTab === 'criticas') && (
          <CritiquesSection properties={properties} />
        )}
      </div>
    </div>
  )
}
