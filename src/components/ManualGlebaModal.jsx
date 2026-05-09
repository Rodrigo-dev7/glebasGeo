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

function ToggleControl({ label, checked, onChange }) {
  return (
    <button
      type="button"
      className={`manual-gleba-toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="manual-gleba-toggle__label">{label}</span>
      <span className="manual-gleba-toggle__control" aria-hidden="true">
        <span className="manual-gleba-toggle__knob" />
      </span>
      <span className="manual-gleba-toggle__state">{checked ? 'ON' : 'OFF'}</span>
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
          <div>
            <h2 id="manual-gleba-title">Adicionar Gleba</h2>
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
              checked={showMarkers}
              onChange={setShowMarkers}
            />
            <ToggleControl
              label="Validar Pontos"
              checked={validatePoints}
              onChange={setValidatePoints}
            />
          </div>

          <label className="manual-gleba-field">
            <span>Coordenadas</span>
            <textarea
              value={text}
              onChange={(event) => onTextChange?.(event.target.value)}
              placeholder={SAMPLE_PLACEHOLDER}
              spellCheck={false}
              rows={8}
            />
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
