import { format, parseISO } from 'date-fns'
import { freshnessOf, shortAge } from '../lib/time'
import type { MarketDetail, MarketStory } from '../types'

type MarketDrawerProps = {
  stories: MarketStory[]
  open: boolean
  onToggle: () => void
  onSelectRegion: (regionId: string) => void
}

function changeClass(change: number | undefined): string {
  if (change === undefined || change === 0) return 'tick'
  return change > 0 ? 'tick is-up' : 'tick is-down'
}

function formatChange(change: number): string {
  return `${change > 0 ? '+' : ''}${change}%`
}

function DetailRow({ detail }: { detail: MarketDetail }) {
  return (
    <span className={changeClass(detail.changePct)}>
      <span className="tick__label">{detail.label}</span>
      {detail.value ? <span className="tick__value">{detail.value}</span> : null}
      {detail.changePct !== undefined ? (
        <span className="tick__change">{formatChange(detail.changePct)}</span>
      ) : null}
      {detail.previous ? <span className="tick__prev">prev {detail.previous}</span> : null}
    </span>
  )
}

export function MarketDrawer({ stories, open, onToggle, onSelectRegion }: MarketDrawerProps) {
  if (!open) {
    return (
      <button className="market-tab" type="button" onClick={onToggle}>
        US stocks <span>{stories.length}</span>
      </button>
    )
  }

  return (
    <aside className="market" aria-label="Market news">
      <header className="market__header">
        <h2>US stocks</h2>
        <span className="market__count">{stories.length}</span>
        <button type="button" onClick={onToggle} aria-label="Hide market drawer">
          Hide
        </button>
      </header>
      <ul className="market__list">
        {stories.map((story) => (
          <li key={story.item.id}>
            <button
              type="button"
              className={`market__row is-${freshnessOf(story.item.publishedAt)}`}
              onClick={() => onSelectRegion(story.item.regionId)}
            >
              <span className="market__meta">
                <time dateTime={story.item.publishedAt}>
                  {format(parseISO(story.item.publishedAt), 'HH:mm')}
                </time>
                <span className="market__age">{shortAge(story.item.publishedAt)}</span>
                <span className="market__region">{story.item.region}</span>
              </span>
              {story.details.length > 0 ? (
                <span className="market__ticks">
                  {story.details.map((detail) => (
                    <DetailRow key={`${story.item.id}-${detail.label}`} detail={detail} />
                  ))}
                </span>
              ) : null}
              <span className="market__text">{story.item.text}</span>
            </button>
          </li>
        ))}
        {stories.length === 0 ? <li className="market__empty">No US stock stories in this range.</li> : null}
      </ul>
    </aside>
  )
}
