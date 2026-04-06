/**
 * FilterBar.jsx
 * Barra de filtros por status das glebas.
 */

const FILTERS = [
  { key: 'todas', label: 'Todas', icon: '🗺️' },
  { key: 'valida', label: 'Válidas', icon: '✅', stat: 'validas' },
  { key: 'invalida', label: 'Inválidas', icon: '❌', stat: 'invalidas' },
  { key: 'pendente', label: 'Pendentes', icon: '⏳', stat: 'pendentes' },
]

export default function FilterBar({ activeFilter, setActiveFilter, stats }) {
  return (
    <div className="filter-bar">
      <span className="filter-label">Exibir:</span>
      <div className="filter-pills">
        {FILTERS.map(({ key, label, icon, stat }) => (
          <button
            key={key}
            className={`filter-pill filter-pill--${key} ${activeFilter === key ? 'active' : ''}`}
            onClick={() => setActiveFilter(key)}
          >
            <span className="pill-icon">{icon}</span>
            <span className="pill-label">{label}</span>
            {stat && <span className="pill-badge">{stats[stat] ?? 0}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
