import { freshnessOf, shortAge } from '../lib/time'
import type { TickerGroup } from '../types'

type TickerColumnProps = {
  groups: TickerGroup[]
  selected: string | null
  onSelect: (ticker: string | null) => void
}

export function TickerColumn({ groups, selected, onSelect }: TickerColumnProps) {
  return (
    <aside className="tickers" aria-label="Option tickers">
      <header className="tickers__header">
        <h2>Options</h2>
        <span className="tickers__count">{groups.length} tickers</span>
      </header>

      <ul className="tickers__list">
        {groups.map((group) => (
          <li key={group.ticker}>
            <button
              type="button"
              className={[
                'ticker',
                `is-${freshnessOf(group.latestAt)}`,
                selected === group.ticker ? 'is-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={selected === group.ticker}
              onClick={() => onSelect(selected === group.ticker ? null : group.ticker)}
            >
              <span className="ticker__name">${group.ticker}</span>
              {group.calls > 0 ? <span className="ticker__calls">{group.calls}C</span> : null}
              {group.puts > 0 ? <span className="ticker__puts">{group.puts}P</span> : null}
              <span className="ticker__age">{shortAge(group.latestAt)}</span>
            </button>
          </li>
        ))}

        {groups.length === 0 ? (
          <li className="tickers__empty">No option trades in this range.</li>
        ) : null}
      </ul>
    </aside>
  )
}
