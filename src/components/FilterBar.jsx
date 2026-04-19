function IconAll() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="7" height="7" rx="2" />
      <rect x="14" y="4" width="7" height="7" rx="2" />
      <rect x="3" y="13" width="7" height="7" rx="2" />
      <rect x="14" y="13" width="7" height="7" rx="2" />
    </svg>
  )
}

function IconSuccess() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

function IconDanger() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  )
}

function IconPending() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function IconChevron({ expanded }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points={expanded ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
    </svg>
  )
}

const FILTERS = [
  { key: 'todas', label: 'Todas', icon: IconAll, stat: 'total' },
  { key: 'valida', label: 'Validas', icon: IconSuccess, stat: 'validas' },
  { key: 'invalida', label: 'Invalidas', icon: IconDanger, stat: 'invalidas' },
]

const POINT_DISPLAY_OPTIONS = [
  {
    key: 'validated',
    label: 'Validar Pontos',
    description: 'Mostra os pontos de validacao em todas as glebas visiveis.',
  },
  {
    key: 'marked',
    label: 'Mostrar Marcadores',
    description: 'Mostra todos os pontos marcados das glebas visiveis.',
  },
]

export default function FilterBar({
  activeFilter,
  setActiveFilter,
  stats,
  pointDisplayMode = 'marked',
  setPointDisplayMode,
  collapsed = false,
  onCollapsedChange,
}) {
  return (
    <div className={`filter-bar${collapsed ? ' filter-bar--collapsed' : ''}`}>
      <button
        type="button"
        className="filter-bar__toggle"
        onClick={() => onCollapsedChange?.(!collapsed)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expandir header do mapa' : 'Esconder header do mapa'}
        title={collapsed ? 'Expandir header' : 'Esconder header'}
      >
        <span className="filter-bar__toggle-icon">
          <IconChevron expanded={!collapsed} />
        </span>
        <span>{collapsed ? 'Exibir' : 'Ocultar'}</span>
      </button>

      <div className="filter-bar__intro">
        <span className="filter-label">Mapa operacional</span>
        <strong className="filter-summary">Filtre a camada principal por status de validacao</strong>
        <div className="filter-point-mode">
          <div className="filter-point-mode__actions" role="group" aria-label="Visualizacao global dos pontos">
            {POINT_DISPLAY_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`filter-point-mode__button ${pointDisplayMode === option.key ? 'is-active' : ''}`}
                onClick={() => setPointDisplayMode?.(option.key)}
                aria-pressed={pointDisplayMode === option.key}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="filter-pills" role="tablist" aria-label="Filtros de status">
        {FILTERS.map(({ key, label, icon: Icon, stat }) => (
          <button
            key={key}
            type="button"
            className={`filter-pill filter-pill--${key} ${activeFilter === key ? 'active' : ''}`}
            onClick={() => setActiveFilter(key)}
            role="tab"
            aria-selected={activeFilter === key}
          >
            <span className="pill-icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="pill-label">{label}</span>
            <span className="pill-badge">{stats[stat] ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
