import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { useEffect } from 'react'
import { MIN_LINKED_REGIONS } from '../lib/news'
import { findLocationHits, findRegions } from '../lib/places'
import { formatUpdated, freshnessOf, latestItem, shortAge } from '../lib/time'
import type { LocationHit, RegionPin } from '../types'

type NewsPanelProps = {
  region: RegionPin
  seenIds: Set<string>
  linkColors: Map<string, string>
  focusedStoryId: string | null
  onClose: () => void
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

export function NewsPanel({
  region,
  seenIds,
  linkColors,
  focusedStoryId,
  onClose,
}: NewsPanelProps) {
  // Clicking a line on the map should bring its card into view, not just tint it.
  useEffect(() => {
    if (!focusedStoryId) return
    document
      .getElementById(`story-${focusedStoryId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusedStoryId])

  const latest = latestItem(region.items)
  const updated = latest ? formatUpdated(latest.publishedAt) : null
  const groups = new Map<string, typeof region.items>()
  for (const item of region.items) {
    const heading = headingFor(item.publishedAt)
    const list = groups.get(heading) ?? []
    list.push(item)
    groups.set(heading, list)
  }

  return (
    <aside className="news-panel" aria-label={`${region.region} news`}>
      <header className="news-panel__header">
        <div>
          <p className="news-panel__kicker">{region.country}</p>
          <h2>{region.region}</h2>
          <p className="news-panel__meta">
            {region.items.length} {region.items.length === 1 ? 'report' : 'reports'}
            {updated && latest ? (
              <>
                {' · last updated '}
                <time dateTime={latest.publishedAt} title={updated.clock}>
                  {updated.relative}
                </time>
                {' · '}
                {updated.clock}
              </>
            ) : null}
          </p>
          {latest ? <p className="news-panel__latest">{latest.text}</p> : null}
        </div>
        <button className="news-panel__close" type="button" onClick={onClose} aria-label="Close news panel">
          Close
        </button>
      </header>
      <div className="news-panel__scroll">
        {[...groups.entries()].map(([heading, items]) => (
          <section key={heading} className="news-group">
            <h3>{heading}</h3>
            <ul>
              {items.map((item) => {
                const unread = !seenIds.has(item.id)
                const linked = findRegions(item.text)
                const isLatest = latest?.id === item.id
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
                      isLatest ? 'is-latest' : '',
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
                      {isLatest ? <span className="news-card__badge">Latest</span> : null}
                      <span className="news-card__author">{item.author}</span>
                      <span className="news-card__handle">{item.handle}</span>
                      <span className="news-card__age">{shortAge(item.publishedAt)}</span>
                      <time dateTime={item.publishedAt}>{format(parseISO(item.publishedAt), 'HH:mm')}</time>
                    </div>
                    <p>
                      <HighlightedText text={item.text} />
                    </p>
                    {item.spots?.length ? (
                      <p className="news-card__spot">
                        {item.spots.map((spot) => spot.label).join(' · ')}
                      </p>
                    ) : null}
                    {linked.length > 0 ? (
                      <p className="news-card__route">
                        {routeColor ? <span className="news-card__swatch" /> : null}
                        {linked.map((place) => place.region).join(linked.length >= MIN_LINKED_REGIONS ? ' → ' : ' · ')}
                      </p>
                    ) : null}
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                      Open on X
                    </a>
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
