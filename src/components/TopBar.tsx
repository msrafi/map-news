import { LINK_COLORS } from '../lib/news'
import { MAP_STYLES } from '../lib/mapStyles'
import { formatUpdated } from '../lib/time'
import type { MapStyleId, TimeFilter } from '../types'

const FILTERS: { id: TimeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Last 6h' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
]

type TopBarProps = {
  filter: TimeFilter
  onFilterChange: (filter: TimeFilter) => void
  mapStyle: MapStyleId
  onMapStyleChange: (style: MapStyleId) => void
  liveCount: number
  regionCount: number
  linkCount: number
  lastUpdatedAt: string | null
}

export function TopBar({
  filter,
  onFilterChange,
  mapStyle,
  onMapStyleChange,
  liveCount,
  regionCount,
  linkCount,
  lastUpdatedAt,
}: TopBarProps) {
  const updated = lastUpdatedAt ? formatUpdated(lastUpdatedAt) : null
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <div>
          <p className="topbar__title">Map News</p>
          <p className="topbar__sub">Location reports from public posts</p>
        </div>
      </div>
      <p className="topbar__status">
        {regionCount} {regionCount === 1 ? 'region' : 'regions'}
        {liveCount > 0 ? ` · ${liveCount} unread` : ''}
        {linkCount > 0 ? ` · ${linkCount} connected` : ''}
        {updated ? (
          <>
            {' · '}
            last news{' '}
            <time dateTime={lastUpdatedAt ?? undefined} title={updated.clock}>
              {updated.relative}
            </time>
          </>
        ) : null}
      </p>
      <p className="topbar__legend" aria-hidden="true">
        <span className="topbar__swatch is-local" /> local
        <span className="topbar__routes">
          {LINK_COLORS.slice(0, 4).map((color) => (
            <span key={color} className="topbar__swatch" style={{ background: color }} />
          ))}
        </span>
        connected
        <span className="topbar__age">now</span> under 1h · pins fade as they age
      </p>
      <div className="topbar__tools">
        <label className="topbar__map">
          Map
          <select
            value={mapStyle}
            aria-label="Map type"
            onChange={(event) => onMapStyleChange(event.target.value as MapStyleId)}
          >
            {MAP_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
        </label>
        <div className="topbar__filters" role="tablist" aria-label="Time range">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? 'chip is-on' : 'chip'}
              onClick={() => onFilterChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
