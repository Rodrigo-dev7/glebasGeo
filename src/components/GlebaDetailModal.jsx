import { useEffect } from 'react'

import GlebaPanel from './GlebaPanel'

export default function GlebaDetailModal({ gleba, onClose }) {
  if (!gleba) return null

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="gleba-modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="gleba-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gleba-modal-title"
      >
        <button
          type="button"
          className="gleba-modal-close"
          onClick={onClose}
          aria-label="Fechar modal"
        >
          ×
        </button>

        <div className="gleba-modal-body">
          <GlebaPanel
            gleba={gleba}
            onClose={onClose}
            titleId="gleba-modal-title"
            showTabs
          />
        </div>
      </div>
    </div>
  )
}
