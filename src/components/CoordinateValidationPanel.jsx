import { useRef, useState } from 'react'

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

function formatCoordinate(value) {
  return Number.isFinite(value) ? value.toFixed(6) : '-'
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
  validationResult,
  validateCoordinate,
  exportReport,
}) {
  const fileInputRef = useRef(null)
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [inputError, setInputError] = useState('')

  const handleFileChange = async (event) => {
    const [file] = event.target.files || []
    if (!file) return

    await importDataset(file)
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
          className="coord-action-btn coord-action-btn--success"
          onClick={exportReport}
          disabled={!validationResult}
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
          {isImporting ? 'Processando arquivo...' : 'Formatos suportados: Excel e GeoJSON'}
        </span>
        <span className="coord-upload-hint">
          Importe arquivos `.xls`, `.xlsx`, `.geojson` ou `.json` com pontos ou glebas.
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

      {importError && <div className="coord-feedback coord-feedback--error">{importError}</div>}

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
