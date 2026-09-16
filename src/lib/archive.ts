import type { NewsItem } from '../types'

const STORAGE_KEY = 'map-news:archive'
export const LIVE_HOURS = 24
const LIVE_MS = LIVE_HOURS * 60 * 60 * 1000

function isNewsItem(value: unknown): value is NewsItem {
  if (!value || typeof value !== 'object') return false
  const item = value as NewsItem
  return (
    typeof item.id === 'string' &&
    typeof item.regionId === 'string' &&
    typeof item.publishedAt === 'string' &&
    Number.isFinite(item.lat) &&
    Number.isFinite(item.lng)
  )
}

export function isLiveItem(item: NewsItem, now = Date.now()): boolean {
  const published = Date.parse(item.publishedAt)
  return Number.isFinite(published) && now - published <= LIVE_MS
}

export function splitLiveItems(items: NewsItem[], now = Date.now()): {
  live: NewsItem[]
  archived: NewsItem[]
} {
  const live: NewsItem[] = []
  const archived: NewsItem[] = []
  for (const item of items) {
    if (isLiveItem(item, now)) live.push(item)
    else archived.push(item)
  }
  return { live, archived }
}

export function readArchive(): NewsItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isNewsItem) : []
  } catch {
    return []
  }
}

function sortNewest(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

/** Drops the oldest posts until the browser will store the list. */
function writeArchive(items: NewsItem[]): NewsItem[] {
  let next = sortNewest(items)
  while (next.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    } catch {
      next = next.slice(0, Math.max(0, Math.floor(next.length * 0.8)))
    }
  }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode can refuse both writes and deletes.
  }
  return []
}

/** Keeps only posts older than 24 hours, newest first, keyed by id. */
export function mergeIntoArchive(incoming: NewsItem[], now = Date.now()): NewsItem[] {
  const byId = new Map<string, NewsItem>()
  for (const item of readArchive()) {
    if (!isLiveItem(item, now)) byId.set(item.id, item)
  }
  for (const item of incoming) {
    if (!isLiveItem(item, now)) byId.set(item.id, item)
  }
  return writeArchive([...byId.values()])
}

/** Older posts kept next to the live feed; fetched only when a longer range is asked for. */
export async function loadServerArchive(): Promise<NewsItem[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}news-archive.json`, { cache: 'no-store' })
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`Could not load news archive (${response.status})`)
  const data: unknown = await response.json()
  return Array.isArray(data) ? data.filter(isNewsItem) : []
}

export function combineNews(live: NewsItem[], archived: NewsItem[]): NewsItem[] {
  const byId = new Map<string, NewsItem>()
  for (const item of archived) byId.set(item.id, item)
  for (const item of live) byId.set(item.id, item)
  return sortNewest([...byId.values()])
}

export function filterNeedsArchive(filter: 'all' | 'live' | 'today' | 'week'): boolean {
  return filter === 'all' || filter === 'week'
}
