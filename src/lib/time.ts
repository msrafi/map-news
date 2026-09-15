import { format, formatDistanceToNow, isToday, parseISO } from 'date-fns'
import type { NewsItem } from '../types'

export function latestItem(items: NewsItem[]): NewsItem | undefined {
  return items[0]
}

export function formatUpdated(iso: string): { relative: string; clock: string } {
  const date = parseISO(iso)
  return {
    relative: formatDistanceToNow(date, { addSuffix: true }),
    clock: isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM, HH:mm'),
  }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** How recent a region is, used to make fresh pins stand out on a crowded map. */
export type Freshness = 'fresh' | 'recent' | 'today' | 'old'

export function freshnessOf(iso: string, now = Date.now()): Freshness {
  const age = now - parseISO(iso).getTime()
  if (age < HOUR) return 'fresh'
  if (age < 6 * HOUR) return 'recent'
  if (age < DAY) return 'today'
  return 'old'
}

/** Pin-sized age label: "now", "12m", "5h", "3d". */
export function shortAge(iso: string, now = Date.now()): string {
  const age = Math.max(0, now - parseISO(iso).getTime())
  if (age < 2 * MINUTE) return 'now'
  if (age < HOUR) return `${Math.round(age / MINUTE)}m`
  if (age < DAY) return `${Math.round(age / HOUR)}h`
  return `${Math.round(age / DAY)}d`
}
