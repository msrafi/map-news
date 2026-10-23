import { MAP_STYLES } from '../lib/mapStyles'
import { formatUpdated } from '../lib/time'
import type { MapStyleId } from '../types'

type TopBarProps = {
  mapStyle: MapStyleId
  onMapStyleChange: (style: MapStyleId) => void
  liveCount: number
  regionCount: number
  lastUpdatedAt: string | null
  mapOnly: boolean
  onToggleMapOnly: () => void
}

export function TopBar({
  mapStyle,
  onMapStyleChange,
  liveCount,
  regionCount,
  lastUpdatedAt,
  mapOnly,
  onToggleMapOnly,
}: TopBarProps) {
  const updated = lastUpdatedAt ? formatUpdated(lastUpdatedAt) : null
  const status = [
    `${regionCount} ${regionCount === 1 ? 'region' : 'regions'}`,
    liveCount > 0 ? `${liveCount} unread` : '',
    updated?.relative ?? '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <p className="topbar__title">Map News</p>
        <p className="topbar__status">{status}</p>
      </div>
      <div className="topbar__tools">
        <button
          type="button"
          className={mapOnly ? 'topbar__text is-on' : 'topbar__text'}
          aria-pressed={mapOnly}
          onClick={onToggleMapOnly}
        >
          {mapOnly ? 'Panels' : 'Map only'}
        </button>
        <label className="topbar__map">
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
      </div>
    </header>
  )
}
