/**
 * Legend.jsx
 * Legenda do mapa inserida como controle Leaflet nativo.
 */
import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

const ITEMS = [
  { color: '#22c55e', label: 'Gleba válida' },
  { color: '#ef4444', label: 'Gleba com erro' },
  { color: '#f59e0b', label: 'Gleba pendente' },
  { color: '#38bdf8', label: 'Gleba encontrada' },
]

export default function Legend() {
  const map = useMap()

  useEffect(() => {
    const control = L.control({ position: 'bottomright' })

    control.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend')

      div.innerHTML = `
        <div class="legend-title">Legenda</div>
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
      `
      return div
    }

    control.addTo(map)
    return () => control.remove()
  }, [map])

  return null
}
