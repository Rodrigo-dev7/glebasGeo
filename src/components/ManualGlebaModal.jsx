import { useEffect, useState } from 'react'

const SAMPLE_PLACEHOLDER = `#Gleba #Ponto Latitude Longitude
1 1 -3.123456 -38.123456
1 2 -3.123500 -38.123600
1 3 -3.123700 -38.123400
1 1 -3.123456 -38.123456`

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function IconCoordinatePanel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <path d="M8 4v16" />
      <path d="M15 4v16" />
    </svg>
  )
}

function IconMarkers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s5-4.7 5-10a5 5 0 0 0-10 0c0 5.3 5 10 5 10Z" />
      <circle cx="12" cy="11" r="1.8" />
    </svg>
  )
}

function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </svg>
  )
}

function ToggleControl({ label, description, checked, onChange, icon: Icon }) {
  return (
    <button
      type="button"
      className={`manual-gleba-toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="manual-gleba-toggle__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="manual-gleba-toggle__copy">
        <span className="manual-gleba-toggle__label">{label}</span>
        <span className="manual-gleba-toggle__description">{description}</span>
      </span>
      <span className="manual-gleba-toggle__status">
        <span className="manual-gleba-toggle__control" aria-hidden="true">
          <span className="manual-gleba-toggle__knob" />
        </span>
        <span className="manual-gleba-toggle__state">{checked ? 'ON' : 'OFF'}</span>
      </span>
    </button>
  )
}

export default function ManualGlebaModal({
  open = false,
  onClose,
  onSubmit,
  text = '',
  onTextChange,
  defaultShowMarkers = true,
  defaultValidatePoints = false,
}) {
  const [showMarkers, setShowMarkers] = useState(defaultShowMarkers)
  const [validatePoints, setValidatePoints] = useState(defaultValidatePoints)
  const [feedback, setFeedback] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return

    setFeedback(null)
    setIsSubmitting(false)
    setShowMarkers(defaultShowMarkers)
    setValidatePoints(defaultValidatePoints)
  }, [defaultShowMarkers, defaultValidatePoints, open])

  if (!open) return null

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!text.trim()) {
      setFeedback({
        type: 'error',
        message: 'Cole os dados da gleba antes de continuar.',
      })
      return
    }

    setIsSubmitting(true)
    setFeedback(null)

    try {
      const result = await onSubmit?.({
        text,
        showMarkers,
        validatePoints,
      })
      const featureCount = result?.features?.length || 0
      setFeedback({
        type: 'success',
        message: featureCount === 1
          ? 'Gleba adicionada e exibida no mapa.'
          : `${featureCount} glebas adicionadas e exibidas no mapa.`,
      })
      onClose?.()
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error?.message || 'Nao foi possivel processar os dados informados.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="manual-gleba-overlay"
      role="presentation"
    >
      <section
        className="manual-gleba-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-gleba-title"
      >
        <header className="manual-gleba-header">
          <div className="manual-gleba-title-block">
            <span className="manual-gleba-title-icon" aria-hidden="true">
              <IconCoordinatePanel />
            </span>
            <div className="manual-gleba-title-copy">
              <h2 id="manual-gleba-title">Adicionar Gleba</h2>
              <p>Coordenadas georreferenciadas</p>
            </div>
          </div>

          <button
            type="button"
            className="manual-gleba-close"
            onClick={onClose}
            aria-label="Fechar Adicionar Gleba"
          >
            <IconClose />
          </button>
        </header>

        <form className="manual-gleba-body" onSubmit={handleSubmit}>
          <div className="manual-gleba-options" aria-label="Opcoes de visualizacao">
            <ToggleControl
              label="Mostrar Marcadores"
              description="Exibe os vertices no mapa"
              checked={showMarkers}
              onChange={setShowMarkers}
              icon={IconMarkers}
            />
            <ToggleControl
              label="Validar Pontos"
              description="Destaca pontos criticos"
              checked={validatePoints}
              onChange={setValidatePoints}
              icon={IconTarget}
            />
          </div>

          <label className="manual-gleba-field">
            <span className="manual-gleba-field-title">
              <span className="manual-gleba-field-title__icon" aria-hidden="true">
                <IconCoordinatePanel />
              </span>
              Coordenadas
            </span>
            <div className="manual-gleba-coordinate-panel">
              <div className="manual-gleba-coordinate-head" aria-hidden="true">
                <span>Gleba</span>
                <span>Ponto</span>
                <span>Latitude</span>
                <span>Longitude</span>
              </div>
              <textarea
                value={text}
                onChange={(event) => onTextChange?.(event.target.value)}
                placeholder={SAMPLE_PLACEHOLDER}
                spellCheck={false}
                rows={8}
              />
            </div>
          </label>

          {feedback && (
            <div className={`manual-gleba-feedback manual-gleba-feedback--${feedback.type}`}>
              {feedback.message}
            </div>
          )}

          <footer className="manual-gleba-footer">
            <button
              type="button"
              className="manual-gleba-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Fechar
            </button>
            <button
              type="submit"
              className="manual-gleba-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processando...' : 'Mostrar Glebas'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
