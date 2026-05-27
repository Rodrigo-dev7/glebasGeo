import { useEffect, useState } from 'react'
import { normalizeCarCode } from '../services/carPublicConsultationService'

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function IconSearchMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4 4" />
      <path d="M4 19V5l4-2 5 2 5-2 2 1v9" />
      <path d="M8 3v4" />
      <path d="M13 5v7" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function formatArea(value) {
  const area = Number(value)
  if (!Number.isFinite(area)) return '-'

  return `${area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`
}

function ResultMetric({ label, value, tone, infoLabel = '', infoText = '' }) {
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const hasInfo = Boolean(infoText)

  return (
    <div className={`car-consult-metric${tone ? ` car-consult-metric--${tone}` : ''}`}>
      <span className="car-consult-metric__label">{label}</span>
      <span className="car-consult-metric__value-row">
        <span className="car-consult-metric__value">{value || '-'}</span>
        {hasInfo && (
          <button
            type="button"
            className="car-consult-info-btn"
            aria-label={infoLabel || `Entenda ${label}`}
            aria-expanded={isInfoOpen}
            onClick={() => setIsInfoOpen((current) => !current)}
          >
            <IconInfo />
          </button>
        )}
      </span>
      {hasInfo && isInfoOpen && (
        <div className="car-consult-info-popover" role="status">
          {infoText}
        </div>
      )}
    </div>
  )
}

export default function CarConsultModal({
  open = false,
  onClose,
  onConsult,
  onClear,
  onFocus,
  consultedCar = null,
  error = '',
  isLoading = false,
}) {
  const [carCode, setCarCode] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!open) return

    setFeedback('')
    if (consultedCar?.code) {
      setCarCode(consultedCar.code)
    }
  }, [consultedCar, open])

  if (!open) return null

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!carCode.trim()) {
      setFeedback('Informe o numero do CAR antes de consultar.')
      return
    }

    const normalizedCode = normalizeCarCode(carCode)
    if (!normalizedCode) {
      setFeedback('Codigo CAR invalido. Verifique o numero informado e tente novamente.')
      return
    }

    setCarCode(normalizedCode)
    setFeedback('')

    try {
      await onConsult?.(normalizedCode)
    } catch {
      // A mensagem detalhada vem do estado central para manter o resultado sincronizado.
    }
  }

  const handleBlur = () => {
    if (!carCode.trim()) return

    const normalizedCode = normalizeCarCode(carCode)
    if (normalizedCode) {
      setCarCode(normalizedCode)
      setFeedback('')
    }
  }

  const handleClear = () => {
    setCarCode('')
    setFeedback('')
    onClear?.()
  }

  const locationLabel = [
    consultedCar?.municipio,
    consultedCar?.uf,
  ].filter(Boolean).join(' / ')

  return (
    <div className="manual-gleba-overlay car-consult-overlay" role="presentation">
      <section
        className="manual-gleba-modal car-consult-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="car-consult-title"
      >
        <header className="manual-gleba-header">
          <div className="manual-gleba-title-block">
            <span className="manual-gleba-title-icon car-consult-title-icon" aria-hidden="true">
              <IconSearchMap />
            </span>
            <div className="manual-gleba-title-copy">
              <h2 id="car-consult-title">Consultar CAR</h2>
              <p>Buscar imovel por codigo publico</p>
            </div>
          </div>

          <button
            type="button"
            className="manual-gleba-close"
            onClick={onClose}
            aria-label="Fechar Consultar CAR"
          >
            <IconClose />
          </button>
        </header>

        <form className="manual-gleba-body car-consult-body" onSubmit={handleSubmit}>
          <label className="car-consult-field">
            <span>Numero do CAR</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="Ex: CE-2302206-8B205F9B91724C7B8667674C185AFC08"
              value={carCode}
              onChange={(event) => setCarCode(event.target.value)}
              onBlur={handleBlur}
              disabled={isLoading}
            />
          </label>

          <div className="car-consult-actions">
            <button
              type="submit"
              className="manual-gleba-primary"
              disabled={isLoading}
            >
              {isLoading ? 'Consultando...' : 'Consultar'}
            </button>
            <button
              type="button"
              className="manual-gleba-secondary"
              onClick={handleClear}
              disabled={isLoading && !consultedCar}
            >
              Limpar
            </button>
          </div>

          {(feedback || error) && (
            <div className="manual-gleba-feedback manual-gleba-feedback--error">
              {feedback || error}
            </div>
          )}

          {consultedCar ? (
            <div className="car-consult-result">
              <div className="car-consult-result__head">
                <span className={`car-consult-status car-consult-status--${consultedCar.statusTone || 'unknown'}`}>
                  {consultedCar.statusLabel || 'Status desconhecido'}
                </span>
                <span className="car-consult-result__source">
                  {consultedCar.geometrySource === 'bounderBox' ? 'Geometria aproximada' : 'Geometria oficial WFS'}
                </span>
              </div>

              <div className="car-consult-code">
                <span>Codigo do CAR</span>
                <strong>{consultedCar.code}</strong>
              </div>

              <div className="car-consult-metrics">
                <ResultMetric label="Municipio / UF" value={locationLabel} />
                <ResultMetric label="Area" value={formatArea(consultedCar.area)} />
                <ResultMetric label="Tipo" value={consultedCar.tipo} />
                <ResultMetric
                  label="Analise"
                  value={consultedCar.analysisStatus}
                  tone={consultedCar.analysisStatus ? 'pending' : null}
                  infoLabel="Entenda a situacao da analise do CAR"
                  infoText="Este campo indica a situação da analise tecnica do cadastro pelo orgão ambiental. Aguardando analise significa que o cadastro existe, mas ainda não teve a conferência concluida"
                />
              </div>

              <button
                type="button"
                className="car-consult-focus"
                onClick={onFocus}
              >
                Centralizar no mapa
              </button>
            </div>
          ) : (
            <div className="car-consult-empty">
              Consulte um codigo publico do CAR para visualizar status, area e poligono no mapa.
            </div>
          )}

          <footer className="manual-gleba-footer car-consult-footer">
            <button
              type="button"
              className="manual-gleba-secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              Fechar
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
