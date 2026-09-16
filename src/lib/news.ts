import { isThisWeek, isToday, parseISO, subHours } from 'date-fns'
import type { NewsItem, NewsLink, RegionPin, TimeFilter } from '../types'
import { findRegions } from './places'

/** A story needs at least this many places before it is drawn as a route. */
export const MIN_LINKED_REGIONS = 2

/** Keeps the map readable when a wide filter matches hundreds of stories. */
const MAX_LINKS = 200

/** One hue per route, so a region with several stories does not draw one teal tangle. */
export const LINK_COLORS = [
  '#5ec8c5',
  '#f2a65a',
  '#9bb7ff',
  '#e88ab8',
  '#7fd18a',
  '#c79bff',
  '#ffd166',
  '#ff8f6b',
]

export function linkColor(index: number): string {
  return LINK_COLORS[index % LINK_COLORS.length]
}

export function filterByTime(items: NewsItem[], filter: TimeFilter): NewsItem[] {
  const now = new Date()
  return items.filter((item) => {
    const published = parseISO(item.publishedAt)
    if (filter === 'live') return published >= subHours(now, 6)
    if (filter === 'today') return isToday(published)
    if (filter === 'week') return isThisWeek(published, { weekStartsOn: 1 })
    return true
  })
}

export function groupByRegion(items: NewsItem[]): RegionPin[] {
  const regions = new Map<string, RegionPin>()

  for (const item of items) {
    const mentioned = findRegions(item.text)
    const pins =
      mentioned.length > 0
        ? mentioned
        : [
            {
              id: item.regionId,
              region: item.region,
              city: item.city,
              country: item.country,
              lat: item.lat,
              lng: item.lng,
            },
          ]

    for (const pin of pins) {
      const existing = regions.get(pin.id)
      if (!existing) {
        regions.set(pin.id, {
          regionId: pin.id,
          region: pin.region,
          city: pin.city,
          country: pin.country,
          lat: pin.lat,
          lng: pin.lng,
          items: [item],
          latestAt: item.publishedAt,
        })
        continue
      }

      if (!existing.items.some((entry) => entry.id === item.id)) existing.items.push(item)
      if (item.publishedAt > existing.latestAt) existing.latestAt = item.publishedAt
    }
  }

  return [...regions.values()].map((region) => ({
    ...region,
    items: [...region.items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
  }))
}

/**
 * Collects stories that name several places. Links are keyed off the headline text, so
 * items captured before multi-region support still resolve.
 */
export function buildLinks(items: NewsItem[], focusRegionId: string | null): NewsLink[] {
  const links: NewsLink[] = []

  for (const item of items) {
    const regions = findRegions(item.text)
    if (regions.length < MIN_LINKED_REGIONS) continue
    if (focusRegionId && !regions.some((region) => region.id === focusRegionId)) continue
    links.push({ id: item.id, regions, publishedAt: item.publishedAt, text: item.text })
  }

  return links.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_LINKS)
}

/** Mercator draws a Tokyo-to-Washington line the long way round unless longitudes are unwrapped. */
export function pathCoordinates(points: Array<{ lat: number; lng: number }>): [number, number][] {
  const path: [number, number][] = []
  let previousLng: number | null = null

  for (const point of points) {
    let lng = point.lng
    if (previousLng !== null) {
      while (lng - previousLng > 180) lng -= 360
      while (previousLng - lng > 180) lng += 360
    }
    path.push([lng, point.lat])
    previousLng = lng
  }

  return path
}

export function linkCoordinates(regions: NewsLink['regions']): [number, number][] {
  return pathCoordinates(regions)
}

function shiftSampleTimestamps(items: NewsItem[]): NewsItem[] {
  if (items.length === 0) return items
  const latest = items.reduce((max, item) => (item.publishedAt > max ? item.publishedAt : max), items[0].publishedAt)
  const driftMs = Date.now() - parseISO(latest).getTime()
  const twoDays = 2 * 24 * 60 * 60 * 1000
  if (Math.abs(driftMs) < twoDays) return items
  return items.map((item) => ({
    ...item,
    publishedAt: new Date(parseISO(item.publishedAt).getTime() + driftMs).toISOString(),
  }))
}

/**
 * Polling is cheap when the server can answer "unchanged": the validators let the
 * app ask often without re-parsing the live 24-hour feed. Resolves null when nothing moved.
 */
let feedTag: string | null = null
let feedModified: string | null = null

export async function loadNews(force = false): Promise<NewsItem[] | null> {
  const headers: HeadersInit = {}
  if (!force && feedTag) headers['If-None-Match'] = feedTag
  if (!force && feedModified) headers['If-Modified-Since'] = feedModified

  const response = await fetch(`${import.meta.env.BASE_URL}news.json`, {
    cache: 'no-store',
    headers,
  })
  if (response.status === 304) return null
  if (!response.ok) {
    throw new Error(`Could not load news feed (${response.status})`)
  }

  const tag = response.headers.get('ETag')
  const modified = response.headers.get('Last-Modified')
  // A server without validators still lands here, so fall back to comparing the body.
  const body = await response.text()
  if (!force && tag && tag === feedTag) return null
  feedTag = tag
  feedModified = modified

  const data: unknown = JSON.parse(body)
  if (!Array.isArray(data)) {
    throw new Error('News feed is not a list')
  }
  return shiftSampleTimestamps(data as NewsItem[])
}
