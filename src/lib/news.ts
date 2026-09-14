import { isThisWeek, isToday, parseISO, subHours } from 'date-fns'
import type { NewsItem, NewsLink, RegionPin, TimeFilter } from '../types'
import { findRegions } from './places'

/** A story needs at least this many places before it is drawn as a route. */
export const MIN_LINKED_REGIONS = 2

/** Keeps the map readable when a wide filter matches hundreds of stories. */
const MAX_LINKS = 200

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

export async function loadNews(): Promise<NewsItem[]> {
  const url = `${import.meta.env.BASE_URL}news.json?t=${Date.now()}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Could not load news feed (${response.status})`)
  }
  const data: unknown = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('News feed is not a list')
  }
  return shiftSampleTimestamps(data as NewsItem[])
}
