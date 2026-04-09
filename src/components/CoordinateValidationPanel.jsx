import { useEffect, useRef, useState } from 'react'

function IconFileSelect() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function IconExport() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconLayer() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function IconClear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function IconChevronToggle({ expanded }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points={expanded ? '6 15 12 9 18 15' : '9 6 15 12 9 18'} />
    </svg>
  )
}

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : '-'
}

function formatCarDatasetCount(value) {
  return `${value || 0} imovel(is)`
}

function CarDatasetList({
  datasets,
  activeDatasetId,
  onSelect,
  onRemove,
  onClearAll,
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [contentHeight, setContentHeight] = useState(0)
  const contentRef = useRef(null)

  useEffect(() => {
    if (datasets?.length) {
      setIsExpanded(true)
    }
  }, [datasets?.length])

  useEffect(() => {
    const node = contentRef.current
    if (!node) return

    const updateHeight = () => {
      setContentHeight(node.scrollHeight)
    }

    updateHeight()

    if (typeof ResizeObserver !== 'function') {
      return undefined
    }

    const observer = new ResizeObserver(() => {
      updateHeight()
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [datasets, isExpanded])

  if (!datasets?.length) return null

  return (
    <div className="coord-car-library">
      <div className="coord-car-library__header">
        <div>
          <div className="coord-car-library__title">Bases CAR importadas</div>
          <div className="coord-car-library__subtitle">
            Selecione qual base deseja exibir e validar no mapa.
          </div>
        </div>

        <div className="coord-car-library__controls">
          {datasets.length > 1 && (
            <button
              type="button"
              className="coord-inline-clear coord-inline-clear--ghost"
              onClick={onClearAll}
            >
              Limpar CAR
            </button>
          )}

          <button
            type="button"
            className="coord-car-library__toggle"
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Recolher bases CAR importadas' : 'Expandir bases CAR importadas'}
            title={isExpanded ? 'Recolher' : 'Expandir'}
          >
            <span>{isExpanded ? 'Ocultar' : 'Exibir'}</span>
            <span className={`coord-car-library__toggle-icon${isExpanded ? ' is-expanded' : ''}`}>
              <IconChevronToggle expanded={isExpanded} />
            </span>
          </button>
        </div>
      </div>

      <div
        className={`coord-car-library__body${isExpanded ? ' is-expanded' : ''}`}
        style={{ maxHeight: isExpanded ? `${contentHeight}px` : '0px' }}
      >
        <div ref={contentRef} className="coord-car-library__list">
          {datasets.map((dataset) => {
            const isActive = dataset.datasetId === activeDatasetId

            return (
              <div
                key={dataset.datasetId}
                className={`coord-car-card${isActive ? ' coord-car-card--active' : ''}`}
              >
                <button
                  type="button"
                  className="coord-car-card__select"
                  onClick={() => onSelect(dataset.datasetId)}
                  aria-pressed={isActive}
                  title={isActive ? 'Base CAR ativa' : 'Selecionar esta base CAR'}
                >
                  <div className="coord-car-card__row">
                    <span className="coord-car-card__name">{dataset.metadata.fileName}</span>
                    <span className={`coord-car-card__badge${isActive ? ' coord-car-card__badge--active' : ''}`}>
                      {isActive ? 'Ativo' : 'Selecionar'}
                    </span>
                  </div>

                  <div className="coord-car-card__meta">
                    <span>{dataset.metadata.sourceType || 'KML/KMZ CAR'}</span>
                    <span>{formatCarDatasetCount(dataset.metadata.glebaCount)}</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="coord-inline-clear"
                  onClick={() => onRemove(dataset.datasetId)}
                >
                  Remover
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ResultBlock({ result }) {
  if (!result) {
    return (
      <div className="coord-result coord-result--idle">
        Informe uma latitude e longitude e clique em Validar Gleba.
      </div>
    )
  }

  const relatedFeatures =
    result.matchType === 'direct' ? result.exactMatches : result.containingFeatures

  return (
    <div className={`coord-result coord-result--${result.isMatch ? 'success' : 'failure'}`}>
      <div className="coord-result-head">
        <span className="coord-result-badge">
          {result.isMatch ? 'Coordenada encontrada' : 'Coordenada ausente'}
        </span>
        <span className="coord-result-type">
          {result.matchType === 'direct' && 'Correspondência direta'}
          {result.matchType === 'area' && 'Inclusão em área'}
          {result.matchType === 'none' && 'Fora da base'}
        </span>
      </div>

      <p className="coord-result-message">{result.message}</p>

      <div className="coord-result-query">
        Lat {formatCoordinate(result.query.lat)} | Lon {formatCoordinate(result.query.lon)}
      </div>

      {relatedFeatures?.length > 0 && (
        <div className="coord-result-list">
          {relatedFeatures.map((feature) => (
            <div key={feature.properties.id} className="coord-result-item">
              <strong>{feature.properties.nome}</strong>
              <span>{feature.properties.tipo_uso || 'Sem cultura informada'}</span>
              <span>{feature.properties.origem_arquivo || 'Base interna'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CoordinateValidationPanel({
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
}) {
  const fileInputRef = useRef(null)
  const carFileInputRef = useRef(null)
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [inputError, setInputError] = useState('')

  const handleFileChange = async (event) => {
    const [file] = event.target.files || []
    if (!file) return

    await importDataset(file)
    event.target.value = ''
  }

  const handleCarFileChange = async (event) => {
    const [file] = event.target.files || []
    if (!file) return

    await importCarReferenceDataset(file)
    event.target.value = ''
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const parsedLat = Number(String(lat).replace(',', '.'))
    const parsedLon = Number(String(lon).replace(',', '.'))

    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
      setInputError('Digite latitude e longitude válidas em formato numérico.')
      return
    }

    setInputError('')
    validateCoordinate({ lat: parsedLat, lon: parsedLon })
  }

  const handleSelectFile = () => {
    fileInputRef.current?.click()
  }

  const handleSelectCarFile = () => {
    carFileInputRef.current?.click()
  }

  return (
    <section className="coord-panel">
      <div className="coord-panel-header">
        <div>
          <div className="coord-panel-kicker">Validação geoespacial</div>
          <h2 className="coord-panel-title">Coordenadas da gleba</h2>
        </div>
      </div>

      <input
        ref={fileInputRef}
        className="coord-file-input"
        type="file"
        accept=".xls,.xlsx,.geojson,.json"
        onChange={handleFileChange}
        disabled={isImporting}
      />

      <input
        ref={carFileInputRef}
        className="coord-file-input"
        type="file"
        accept=".kml,.kmz"
        onChange={handleCarFileChange}
        disabled={isImportingCar}
      />

      <div className="coord-actions-grid">
        <button
          type="button"
          className="coord-action-btn coord-action-btn--primary"
          onClick={handleSelectFile}
          disabled={isImporting}
        >
          <span className="coord-action-btn__icon">
            <IconFileSelect />
          </span>
          <span className="coord-action-btn__label">Selecionar Arquivo</span>
        </button>

        <button
          type="button"
          className="coord-action-btn coord-action-btn--secondary"
          onClick={handleSelectCarFile}
          disabled={isImportingCar}
        >
          <span className="coord-action-btn__icon">
            <IconLayer />
          </span>
          <span className="coord-action-btn__label">Importar KML/KMZ CAR</span>
        </button>

        <button
          type="button"
          className="coord-action-btn coord-action-btn--success"
          onClick={exportReport}
          disabled={!importedDataset && !validationResult}
        >
          <span className="coord-action-btn__icon">
            <IconExport />
          </span>
          <span className="coord-action-btn__label">Exportar Relatório</span>
        </button>

        <button
          type="button"
          className="coord-action-btn coord-action-btn--danger"
          onClick={clearImportedDataset}
          disabled={!importedDataset && !validationResult}
        >
          <span className="coord-action-btn__icon">
            <IconClear />
          </span>
          <span className="coord-action-btn__label">Limpar Dados</span>
        </button>
      </div>

      <div className="coord-upload">
        <span className="coord-upload-label">
          {isImporting || isImportingCar ? 'Processando arquivo...' : 'Formatos suportados: Excel, GeoJSON, KML e KMZ'}
        </span>
        <span className="coord-upload-hint">
          Importe a gleba em `.xls`, `.xlsx`, `.geojson` ou `.json` e carregue a base do CAR em `.kml` ou `.kmz` para checar sobreposicao e visualizar o imovel no mapa.
        </span>
      </div>

      {importedDataset && (
        <div className="coord-dataset-meta">
          <span>{importedDataset.metadata.fileName}</span>
          <span>{importedDataset.metadata.sourceType}</span>
          <span>{importedDataset.metadata.glebaCount} gleba(s)</span>
          <span>{importedDataset.metadata.rowCount} registro(s)</span>
        </div>
      )}

      <CarDatasetList
        datasets={carReferenceDatasets}
        activeDatasetId={activeCarReferenceDatasetId}
        onSelect={selectCarReferenceDataset}
        onRemove={removeCarReferenceDataset}
        onClearAll={clearCarReferenceDataset}
      />

      {carReferenceDataset && (
        <div className="coord-dataset-meta coord-dataset-meta--car">
          <span>Base ativa no mapa</span>
          <span>{carReferenceDataset.metadata.fileName}</span>
          <span>{formatCarDatasetCount(carReferenceDataset.metadata.glebaCount)}</span>
        </div>
      )}

      {importError && <div className="coord-feedback coord-feedback--error">{importError}</div>}
      {carImportError && <div className="coord-feedback coord-feedback--error">{carImportError}</div>}

      <form className="coord-form" onSubmit={handleSubmit}>
        <div className="coord-input-grid">
          <label className="coord-field">
            <span>Latitude</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="-4.227865"
              value={lat}
              onChange={(event) => setLat(event.target.value)}
            />
          </label>

          <label className="coord-field">
            <span>Longitude</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="-38.188896"
              value={lon}
              onChange={(event) => setLon(event.target.value)}
            />
          </label>
        </div>

        <button
          type="submit"
          className="coord-submit-btn"
          disabled={!importedDataset || isImporting}
        >
          Validar Gleba
        </button>
      </form>

      {inputError && <div className="coord-feedback coord-feedback--error">{inputError}</div>}
      {!importedDataset && (
        <div className="coord-feedback">
          Selecione um arquivo para habilitar a validação de coordenadas.
        </div>
      )}

      <ResultBlock result={validationResult} />
    </section>
  )
}
