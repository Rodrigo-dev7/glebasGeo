/**
 * Legend.jsx
 * Legenda do mapa inserida como controle Leaflet nativo.
 */
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

const ITEMS = [
  { color: '#22c55e', label: 'Gleba valida' },
  { color: '#ef4444', label: 'Gleba com erro' },
  { color: '#38bdf8', label: 'Gleba encontrada' },
  { color: '#facc15', label: 'Gleba dentro da base' },
  { color: '#fb923c', label: 'Gleba parcial na base' },
  { color: '#a855f7', label: 'Base de referencia' },
  { color: '#facc15', label: 'KML dentro de outro' },
]

export default function Legend() {
  const map = useMap()
  const containerRef = useRef(null)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const control = L.control({ position: 'bottomright' })

    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend')
      containerRef.current = div
      L.DomEvent.disableClickPropagation(div)
      L.DomEvent.disableScrollPropagation(div)

      div.innerHTML = `
        <div class="legend-head">
          <div class="legend-title">Legenda</div>
          <button
            type="button"
            class="legend-toggle"
            aria-expanded="${!isCollapsed}"
            aria-label="${isCollapsed ? 'Expandir legenda' : 'Esconder legenda'}"
            title="${isCollapsed ? 'Expandir legenda' : 'Esconder legenda'}"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 15 12 9 18 15"></polyline>
            </svg>
          </button>
        </div>
        <div class="legend-content">
          ${ITEMS.map(
            ({ color, label }) => `
            <div class="legend-item">
              <span class="legend-swatch" style="background:${color};border-color:${color}"></span>
              <span class="legend-label">${label}</span>
            </div>`
          ).join('')}
          <div class="legend-item legend-item--points">
            <span class="legend-dot legend-dot--ok"></span>
            <span class="legend-label">Coordenada correta</span>
          </div>
          <div class="legend-item legend-item--points">
            <span class="legend-dot legend-dot--err"></span>
            <span class="legend-label">Coordenada com erro</span>
          </div>
        </div>
      `

      const toggleButton = div.querySelector('.legend-toggle')
      toggleButton?.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        setIsCollapsed((current) => !current)
      })

      return div
    }

    control.addTo(map)
    return () => {
      containerRef.current = null
      control.remove()
    }
  }, [map])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const toggleButton = container.querySelector('.legend-toggle')
    container.classList.toggle('map-legend--collapsed', isCollapsed)
    toggleButton?.classList.toggle('is-collapsed', isCollapsed)
    toggleButton?.setAttribute('aria-expanded', String(!isCollapsed))
    toggleButton?.setAttribute('aria-label', isCollapsed ? 'Expandir legenda' : 'Esconder legenda')
    toggleButton?.setAttribute('title', isCollapsed ? 'Expandir legenda' : 'Esconder legenda')
  }, [isCollapsed])

  return null
}
