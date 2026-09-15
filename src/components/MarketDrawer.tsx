import { format, parseISO } from 'date-fns'
import { freshnessOf, shortAge } from '../lib/time'
import type { MarketDetail, MarketStory } from '../types'

type MarketDrawerProps = {
  stories: MarketStory[]
  open: boolean
  onToggle: () => void
  onOpenStory: (story: MarketStory, anchor: DOMRect) => void
  activeId: string | null
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
    </span>
  )
}

export function MarketDrawer({ stories, open, onToggle, onOpenStory, activeId }: MarketDrawerProps) {
  if (!open) {
    return (
      <button className="drawer-tab" type="button" onClick={onToggle}>
        US stocks <span>{stories.length}</span>
      </button>
    )
  }

  return (
    <section className="drawer" aria-label="US stock news">
      <header className="drawer__header">
        <h2>US stocks</h2>
        <span className="drawer__count">{stories.length}</span>
        <button type="button" onClick={onToggle} aria-label="Hide US stocks">
          Hide
        </button>
      </header>
      <ul className="drawer__list">
        {stories.map((story) => (
          <li key={story.item.id}>
            <button
              type="button"
              className={[
                'drawer__row',
                `is-${freshnessOf(story.item.publishedAt)}`,
                activeId === story.item.id ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={(event) => onOpenStory(story, event.currentTarget.getBoundingClientRect())}
            >
              {story.details.length > 0 ? (
                <span className="drawer__ticks">
                  {story.details.map((detail) => (
                    <DetailRow key={`${story.item.id}-${detail.label}`} detail={detail} />
                  ))}
                </span>
              ) : null}
              <span className="drawer__meta">
                <time dateTime={story.item.publishedAt}>
                  {format(parseISO(story.item.publishedAt), 'HH:mm')}
                </time>
                <span className="drawer__age">{shortAge(story.item.publishedAt)}</span>
              </span>
              <span className="drawer__text">{story.item.text}</span>
            </button>
          </li>
        ))}
        {stories.length === 0 ? (
          <li className="drawer__empty">No US stock stories in this range.</li>
        ) : null}
      </ul>
    </section>
  )
}
