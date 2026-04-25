import { useEffect, useRef, useState } from 'react'
import { dedupeCarReferenceFeatures } from '../services/carReferenceFeatureService'

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

function formatCarFeatureArea(value) {
  const area = Number(value)
  if (!Number.isFinite(area)) return null

  return `${area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`
}

function getCarFeatureCode(feature) {
  const properties = feature?.properties || {}

  return (
    properties.numero_car_recibo ||
    properties.codigo_imovel ||
    properties.cod_imovel ||
    properties.car ||
    null
  )
}

function getCarFeatureLabel(feature, index) {
  const properties = feature?.properties || {}

  return (
    properties.nome ||
    getCarFeatureCode(feature) ||
    `Imovel CAR ${index + 1}`
  )
}

function getCarFeatureMeta(feature) {
  const properties = feature?.properties || {}
  const code = getCarFeatureCode(feature)
  const municipalityUf = [
    properties.municipio,
    properties.uf,
  ].filter(Boolean).join(' / ')
  const area = formatCarFeatureArea(properties.area ?? properties.areaCalculada ?? properties.areaInformada)

  return [code, municipalityUf, area].filter(Boolean).join(' | ')
}

function formatContainmentRelationList(relations = []) {
  return relations
    .map((relation) => relation.datasetName || relation.featureName || null)
    .filter(Boolean)
    .join(' | ')
}

function getContainmentSummary(containment) {
  const insideLabel = formatContainmentRelationList(containment?.inside || [])
  const containsLabel = formatContainmentRelationList(containment?.contains || [])

  if (insideLabel) {
    return {
      tone: 'inside',
      label: `Dentro de ${insideLabel}`,
    }
  }

  if (containsLabel) {
    return {
      tone: 'contains',
      label: `Contem ${containsLabel}`,
    }
  }

  return null
}

function formatImportedDatasetSourceType(metadata) {
  if (!metadata) return '-'
  if (metadata.fileCount > 1 && metadata.sourceType === 'mixed') {
    return 'multiplos formatos'
  }

  return metadata.sourceType || '-'
}

function formatImportedDatasetLabel(metadata) {
  if (!metadata) return '-'
  if ((metadata.fileCount || 0) <= 1) {
    return metadata.fileName || metadata.fileNames?.[0] || 'Arquivo importado'
  }

  return `${metadata.fileCount} arquivos selecionados`
}

function CarDatasetList({
  datasets,
  activeDatasetId,
  selectedFeatureId,
  onSelect,
  onSelectFeature,
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
    if (activeDatasetId || selectedFeatureId) {
      setIsExpanded(true)
    }
  }, [activeDatasetId, selectedFeatureId])

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
            Selecione a base ativa para validar. Todas as bases importadas ficam visiveis no mapa.
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
          {datasets.map((dataset, datasetIndex) => {
            const isActive = dataset.datasetId === activeDatasetId
            const features = dedupeCarReferenceFeatures(dataset.geojson?.features || [])
            const datasetContainment = getContainmentSummary(dataset.metadata?.kmlContainment)

            return (
              <div
                key={dataset.datasetId}
                className={`coord-car-card${isActive ? ' coord-car-card--active' : ''}`}
              >
                <div className="coord-car-card__main">
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
                      <span>{formatCarDatasetCount(features.length || dataset.metadata.glebaCount)}</span>
                    </div>

                    {datasetContainment && (
                      <div className={`coord-car-containment coord-car-containment--${datasetContainment.tone}`}>
                        {datasetContainment.label}
                      </div>
                    )}
                  </button>

                  <button
                    type="button"
                    className="coord-inline-clear coord-inline-clear--icon"
                    onClick={() => onRemove(dataset.datasetId)}
                    aria-label={`Remover ${dataset.metadata.fileName}`}
                    title={`Remover ${dataset.metadata.fileName}`}
                  >
                    <IconClear />
                  </button>
                </div>

                {features.length > 0 && (
                  <div className="coord-car-feature-list" aria-label="Imoveis CAR desta base">
                    {features.map((feature, index) => {
                      const featureId = feature.properties?.id
                      const isSelected = Boolean(isActive && featureId && featureId === selectedFeatureId)
                      const featureContainment = getContainmentSummary(feature.properties?.kmlContainment)

                      return (
                        <button
                          key={featureId || `${dataset.datasetId}-${index}`}
                          type="button"
                          className={`coord-car-feature-button${isSelected ? ' is-selected' : ''}${isActive ? ' is-active-dataset' : ''}`}
                          onClick={() => onSelectFeature(dataset.datasetId, featureId)}
                          aria-pressed={isSelected}
                          disabled={!featureId}
                          title={isSelected ? 'Imovel CAR em destaque no mapa' : 'Destacar este imovel CAR no mapa'}
                        >
                          <span className="coord-car-feature-button__index">KML / CAR {datasetIndex + 1}</span>
                          <span className="coord-car-feature-button__body">
                            <span className="coord-car-feature-button__name">
                              {getCarFeatureLabel(feature, index)}
                            </span>
                            <span className="coord-car-feature-button__meta">
                              {getCarFeatureMeta(feature) || 'Sem metadados do CAR'}
                            </span>
                            {featureContainment && (
                              <span className={`coord-car-feature-button__containment coord-car-feature-button__containment--${featureContainment.tone}`}>
                                {featureContainment.label}
                              </span>
                            )}
                          </span>
                          <span className="coord-car-feature-button__state">
                            {isSelected ? 'Selecionado' : isActive ? 'Ativo' : 'Ver'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
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
  exportReport,
}) {
  const fileInputRef = useRef(null)
  const carFileInputRef = useRef(null)
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [inputError, setInputError] = useState('')

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    await importDataset(files)
    event.target.value = ''
  }

  const handleCarFileChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    await importCarReferenceDataset(files)
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

  const handleClearAllData = () => {
    setLat('')
    setLon('')
    setInputError('')

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }

    if (carFileInputRef.current) {
      carFileInputRef.current.value = ''
    }

    if (clearApplicationData) {
      clearApplicationData()
      return
    }

    clearImportedDataset?.()
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
        multiple
        accept=".xls,.xlsx,.geojson,.json"
        onChange={handleFileChange}
        disabled={isImporting}
      />

      <input
        ref={carFileInputRef}
        className="coord-file-input"
        type="file"
        multiple
        accept=".kml,.kmz,.shp,.dbf"
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
          <span className="coord-action-btn__label">Selecionar Arquivos Glebas</span>
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
          <span className="coord-action-btn__label">Importar KML/KMZ/SHP CAR</span>
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
          onClick={handleClearAllData}
          disabled={isImporting || isImportingCar}
        >
          <span className="coord-action-btn__icon">
            <IconClear />
          </span>
          <span className="coord-action-btn__label">Limpar Dados</span>
        </button>
      </div>

      <div className="coord-upload">
        <span className="coord-upload-label">
          {isImporting || isImportingCar ? 'Processando arquivos...' : 'Formatos suportados: Excel, GeoJSON, KML, KMZ e SHP'}
        </span>
        <span className="coord-upload-hint">
          Importe uma ou varias glebas em `.xls`, `.xlsx`, `.geojson` ou `.json` e carregue uma ou varias bases do CAR em `.kml`, `.kmz` ou `.shp`; selecione o `.dbf` junto com o `.shp` para importar atributos como o numero do CAR.
        </span>
      </div>

      {importedDataset && (
        <div className="coord-dataset-meta">
          <span>{formatImportedDatasetLabel(importedDataset.metadata)}</span>
          <span>{formatImportedDatasetSourceType(importedDataset.metadata)}</span>
          <span>{importedDataset.metadata.glebaCount} gleba(s)</span>
          <span>{importedDataset.metadata.rowCount} registro(s)</span>
        </div>
      )}

      <CarDatasetList
        datasets={carReferenceDatasets}
        activeDatasetId={activeCarReferenceDatasetId}
        selectedFeatureId={selectedCarReferenceFeatureId}
        onSelect={selectCarReferenceDataset}
        onSelectFeature={selectCarReferenceFeature}
        onRemove={removeCarReferenceDataset}
        onClearAll={clearCarReferenceDataset}
      />

      {carReferenceDataset && (
        <div className="coord-dataset-meta coord-dataset-meta--car">
          <span>Base ativa para validacao</span>
          <span>{carReferenceDataset.metadata.fileName}</span>
          <span>
            {formatCarDatasetCount(
              dedupeCarReferenceFeatures(carReferenceDataset.geojson?.features || []).length ||
              carReferenceDataset.metadata.glebaCount
            )}
          </span>
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
