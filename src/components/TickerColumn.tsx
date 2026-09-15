import { useState } from 'react'
import { formatStamp, formatUpdated, freshnessOf, shortAge } from '../lib/time'

export type SymbolKind = 'option' | 'stock'

export type SymbolTile = {
  ticker: string
  latestAt?: string
  /** How many posts named this symbol in the current range. */
  posts: number
  /** Short badges for the hover card, e.g. "3C · 1P" or "+1.4%". */
  facts: string[]
  latestText?: string
}

type Hovered = {
  kind: SymbolKind
  tile: SymbolTile
  top: number
  left: number
}

type TickerColumnProps = {
  options: SymbolTile[]
  stocks: SymbolTile[]
  selected: { kind: SymbolKind; ticker: string } | null
  onSelect: (next: { kind: SymbolKind; ticker: string } | null) => void
}

const CARD_MARGIN = 10
const CARD_HEIGHT = 150

function Pane({
  title,
  kind,
  tiles,
  selected,
  onSelect,
  onHover,
}: {
  title: string
  kind: SymbolKind
  tiles: SymbolTile[]
  selected: TickerColumnProps['selected']
  onSelect: TickerColumnProps['onSelect']
  onHover: (next: Hovered | null) => void
}) {
  return (
    <section className="tickers__pane" aria-label={title}>
      <header className="tickers__header">
        <h2>{title}</h2>
        <span className="tickers__count">{tiles.length}</span>
      </header>
      <ul className="tickers__grid">
        {tiles.map((tile) => {
          const active = selected?.kind === kind && selected.ticker === tile.ticker
          const freshness = tile.latestAt ? freshnessOf(tile.latestAt) : 'old'
          return (
            <li key={`${kind}-${tile.ticker}`}>
              <button
                type="button"
                className={['symbol', `is-${freshness}`, active ? 'is-selected' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={active}
                aria-label={`Show tweets for $${tile.ticker}`}
                onClick={() => onSelect(active ? null : { kind, ticker: tile.ticker })}
                onMouseEnter={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  onHover({
                    kind,
                    tile,
                    top: Math.max(
                      CARD_MARGIN,
                      Math.min(rect.top, window.innerHeight - CARD_HEIGHT - CARD_MARGIN),
                    ),
                    left: rect.right + CARD_MARGIN,
                  })
                }}
                onMouseLeave={() => onHover(null)}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  onHover({ kind, tile, top: rect.top, left: rect.right + CARD_MARGIN })
                }}
                onBlur={() => onHover(null)}
              >
                <span className="symbol__name">{tile.ticker}</span>
                {tile.latestAt ? (
                  <span className="symbol__age">{shortAge(tile.latestAt)}</span>
                ) : null}
              </button>
            </li>
          )
        })}
        {tiles.length === 0 ? <li className="tickers__empty">None saved yet.</li> : null}
      </ul>
    </section>
  )
}

function HoverCard({ hovered }: { hovered: Hovered }) {
  const { tile } = hovered

  return (
    <div className="symbol-card" style={{ top: hovered.top, left: hovered.left }} role="tooltip">
      <header>
        <span className="symbol-card__name">${tile.ticker}</span>
        <span className="symbol-card__kind">
          {hovered.kind === 'option' ? 'Options' : 'Stock'}
        </span>
      </header>

      {tile.latestAt ? (
        <time className="symbol-card__when" dateTime={tile.latestAt}>
          {formatStamp(tile.latestAt)} · {formatUpdated(tile.latestAt).relative}
        </time>
      ) : (
        <p className="symbol-card__when">No tweets in this range</p>
      )}

      <p className="symbol-card__stat">
        {tile.posts} {tile.posts === 1 ? 'tweet' : 'tweets'}
        {tile.facts.length > 0 ? ` · ${tile.facts.join(' · ')}` : ''}
      </p>

      {tile.latestText ? <p className="symbol-card__text">{tile.latestText}</p> : null}
    </div>
  )
}

export function TickerColumn({ options, stocks, selected, onSelect }: TickerColumnProps) {
  const [hovered, setHovered] = useState<Hovered | null>(null)

  return (
    <aside className="tickers" aria-label="Saved symbols">
      <Pane
        title="Options"
        kind="option"
        tiles={options}
        selected={selected}
        onSelect={onSelect}
        onHover={setHovered}
      />
      <Pane
        title="Stocks"
        kind="stock"
        tiles={stocks}
        selected={selected}
        onSelect={onSelect}
        onHover={setHovered}
      />
      {hovered ? <HoverCard hovered={hovered} /> : null}
    </aside>
  )
}
