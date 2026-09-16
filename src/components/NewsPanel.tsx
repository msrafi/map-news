import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { useEffect, useState } from 'react'
import { MIN_LINKED_REGIONS } from '../lib/news'
import { findLocationHits, findRegions } from '../lib/places'
import { formatStamp, formatUpdated, freshnessOf, latestItem, shortAge } from '../lib/time'
import type { LocationHit, NewsMedia, RegionPin } from '../types'

type NewsPanelProps = {
  title: string
  kicker: string
  items: RegionPin['items']
  seenIds: Set<string>
  linkColors: Map<string, string>
  focusedStoryId: string | null
  /** Points the map at the story behind a card. */
  onSelectStory: (itemId: string) => void
  /** Absent when the panel is already showing the whole feed. */
  onClearRegion?: () => void
}

function headingFor(iso: string): string {
  const date = parseISO(iso)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, d MMM yyyy')
}

function HighlightedText({ text }: { text: string }) {
  const hits = findLocationHits(text)
  if (hits.length === 0) return <>{text}</>

  const parts: Array<{ key: string; text: string; hit: LocationHit | null }> = []
  let cursor = 0
  hits.forEach((hit, index) => {
    if (hit.start > cursor) {
      parts.push({ key: `t-${index}`, text: text.slice(cursor, hit.start), hit: null })
    }
    parts.push({ key: `h-${index}`, text: text.slice(hit.start, hit.end), hit })
    cursor = hit.end
  })
  if (cursor < text.length) parts.push({ key: 'tail', text: text.slice(cursor), hit: null })

  return (
    <>
      {parts.map((part) =>
        part.hit ? (
          <mark key={part.key} className="news-card__place" title={part.hit.ref.region}>
            {part.text}
          </mark>
        ) : (
          <span key={part.key}>{part.text}</span>
        ),
      )}
    </>
  )
}

/** X can retire a render, so a picture that fails to load leaves no gap behind. */
function Thumbnail({ media }: { media: NewsMedia }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null

  return (
    <a className="news-card__shot" href={media.full} target="_blank" rel="noreferrer">
      <img src={media.thumb} alt={media.alt ?? ''} loading="lazy" onError={() => setBroken(true)} />
    </a>
  )
}

export function NewsPanel({
  title,
  kicker,
  items,
  seenIds,
  linkColors,
  focusedStoryId,
  onSelectStory,
  onClearRegion,
}: NewsPanelProps) {
  // Clicking a line on the map should bring its card into view, not just tint it.
  useEffect(() => {
    if (!focusedStoryId) return
    document
      .getElementById(`story-${focusedStoryId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusedStoryId])

  const latest = latestItem(items)
  const updated = latest ? formatUpdated(latest.publishedAt) : null
  const groups = new Map<string, typeof items>()
  for (const item of items) {
    const heading = headingFor(item.publishedAt)
    const list = groups.get(heading) ?? []
    list.push(item)
    groups.set(heading, list)
  }

  return (
    <aside className="news-panel" aria-label={`${title} news`}>
      <header className="news-panel__header">
        <div className="news-panel__title">
          <h2>{title}</h2>
          <p className="news-panel__meta">
            {items.length}
            {updated && latest ? (
              <>
                {' · '}
                <time dateTime={latest.publishedAt} title={`${kicker} · ${updated.clock}`}>
                  {updated.relative}
                </time>
              </>
            ) : null}
          </p>
        </div>
        {onClearRegion ? (
          <button
            className="news-panel__close"
            type="button"
            onClick={onClearRegion}
            aria-label="Show news from every region"
          >
            All news
          </button>
        ) : null}
      </header>
      <div className="news-panel__scroll">
        {items.length === 0 ? (
          <p className="news-panel__empty">No reports in this range.</p>
        ) : null}
        {[...groups.entries()].map(([heading, group]) => (
          <section key={heading} className="news-group">
            <h3>{heading}</h3>
            <ul>
              {group.map((item) => {
                const unread = !seenIds.has(item.id)
                const linked = findRegions(item.text)
                const freshness = freshnessOf(item.publishedAt)
                const routeColor = linkColors.get(item.id)
                return (
                  <li
                    key={item.id}
                    id={`story-${item.id}`}
                    className={[
                      'news-card',
                      `is-${freshness}`,
                      linked.length >= MIN_LINKED_REGIONS ? 'is-linked' : '',
                      unread && linked.length < MIN_LINKED_REGIONS ? 'is-unread' : '',
                      focusedStoryId === item.id ? 'is-focused' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={
                      routeColor
                        ? ({ '--route': routeColor } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <div className="news-card__top">
                      <time
                        dateTime={item.publishedAt}
                        title={`${formatStamp(item.publishedAt)} · ${item.handle}`}
                      >
                        {format(parseISO(item.publishedAt), 'd MMM, HH:mm')}
                      </time>
                      <span className="news-card__age">{shortAge(item.publishedAt)}</span>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open on X"
                      >
                        ↗
                      </a>
                    </div>
                    <button
                      type="button"
                      className="news-card__hit"
                      aria-label={`Show this story on the map: ${item.text}`}
                      onClick={() => onSelectStory(item.id)}
                    >
                      <span className="news-card__text">
                        <HighlightedText text={item.text} />
                      </span>
                      {linked.length > 0 || item.spots?.length ? (
                        <span className="news-card__route">
                          {routeColor ? <span className="news-card__swatch" /> : null}
                          {[
                            ...linked.map((place) => place.region),
                            ...(item.spots?.map((spot) => spot.label) ?? []),
                          ].join(linked.length >= MIN_LINKED_REGIONS ? ' → ' : ' · ')}
                        </span>
                      ) : null}
                    </button>
                    {item.media?.length ? (
                      <div className="news-card__media">
                        {item.media.map((media) => (
                          <Thumbnail key={media.thumb} media={media} />
                        ))}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}
