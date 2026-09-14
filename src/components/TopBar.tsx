import type { TimeFilter } from '../types'

const FILTERS: { id: TimeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Last 6h' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
]

type TopBarProps = {
  filter: TimeFilter
  onFilterChange: (filter: TimeFilter) => void
  liveCount: number
  regionCount: number
  linkCount: number
}

export function TopBar({ filter, onFilterChange, liveCount, regionCount, linkCount }: TopBarProps) {
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
      </p>
      <p className="topbar__legend" aria-hidden="true">
        <span className="topbar__swatch is-local" /> local
        <span className="topbar__swatch is-connected" /> connected
      </p>
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
    </header>
  )
}
