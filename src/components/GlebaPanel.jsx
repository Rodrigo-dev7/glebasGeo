/**
 * GlebaPanel.jsx
 * Painel lateral com detalhes, erros SICOR e coordenadas da gleba selecionada.
 */
import { useMemo, useState } from 'react'

const STATUS_CONFIG = {
  valida: { label: 'Válida', icon: 'Válida', cls: 'panel-status--valida' },
  invalida: { label: 'Inválida', icon: 'Inválida', cls: 'panel-status--invalida' },
  pendente: { label: 'Pendente', icon: 'Pendente', cls: 'panel-status--pendente' },
}

const TABS = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'coordenadas', label: 'Coordenadas' },
  { key: 'criticas', label: 'Críticas SICOR' },
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

function CoordinateTable({ coordinates = [] }) {
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

        {coordinates.map((coordinate) => (
          <div
            key={`${coordinate.index}-${coordinate.lat}-${coordinate.lon}`}
            className={`coord-table-row ${coordinate.isValid ? 'is-valid' : 'is-invalid'}`}
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

function SummarySection({ properties, metrics }) {
  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">Dados cadastrais</div>
        <div className="details-grid">
          <DetailRow
            label="Área total"
            value={properties.area ? `${properties.area} ha` : null}
          />
          <DetailRow label="Tipo de uso" value={properties.tipo_uso} />
          <DetailRow label="Município" value={properties.municipio} />
          <DetailRow label="UF" value={properties.uf} />
          <DetailRow label="Situação" value={properties.situacao_cadastral} />
          <DetailRow label="Data de inscrição" value={properties.data_inscricao} />
        </div>

        <div className="details-grid details-grid--full">
          <DetailRow label="Proprietário" value={properties.proprietario} />
          <DetailRow label="Código SNCR/CAR" value={properties.codigo_imovel} mono />
          <DetailRow label="Arquivo de origem" value={properties.origem_arquivo} />
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-section-title">Regras SICOR</div>
        <div className="details-grid">
          <DetailRow label="Polígono fechado" value={metrics.isClosed ? 'Sim' : 'Não'} />
          <DetailRow label="Pontos informados" value={metrics.originalPointCount} />
          <DetailRow label="Pontos únicos" value={metrics.uniquePointCount} />
          <DetailRow label="Repetições do primeiro" value={metrics.repeatedStartCount} />
        </div>
      </div>

      {!properties.errors?.length && !properties.warnings?.length && (
        <div className="panel-ok">
          <span className="panel-ok-icon">✓</span>
          <p>Gleba validada sem críticas nas duas regras SICOR analisadas.</p>
        </div>
      )}
    </>
  )
}

function CritiquesSection({ properties }) {
  if (!properties.errors?.length && !properties.warnings?.length) {
    return (
      <div className="panel-ok">
        <span className="panel-ok-icon">✓</span>
        <p>Nenhuma crítica registrada para esta gleba.</p>
      </div>
    )
  }

  return (
    <>
      {properties.errors?.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-title panel-section-title--err">
            Críticas SICOR <span className="issue-count">{properties.errors.length}</span>
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
              ×
            </button>
          )}
        </div>
      </div>

      <div className="panel-body">
        <h3 className="panel-nome" id={titleId}>{properties.nome}</h3>

        <div className="panel-edit-hint">
          Clique na gleba e arraste diretamente os pontos verdes ou vermelhos no mapa para redimensionar. A area e a validacao sao recalculadas automaticamente.
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
          <CoordinateTable coordinates={properties.coordinateStatuses} />
        )}

        {(!showTabs || activeTab === 'criticas') && (
          <CritiquesSection properties={properties} />
        )}
      </div>
    </div>
  )
}
