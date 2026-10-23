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

/** Map markers stay bright for the last hour, plus the single newest item if the feed is quieter. */
export function isMapBright(iso: string, newestAt: string | null, now = Date.now()): boolean {
  if (newestAt && iso === newestAt) return true
  return freshnessOf(iso, now) === 'fresh'
}

/** Absolute stamp for lists and hover cards: "15 Sep 2026, 13:05". */
export function formatStamp(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy, HH:mm')
}

const easternClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
})

/** News-list clock in Eastern time, labeled EST or EDT for that date. */
export function formatNewsTime(iso: string): string {
  const parts = easternClock.formatToParts(parseISO(iso))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('day')} ${value('month')}, ${value('hour')}:${value('minute')} ${value('timeZoneName')}`
}

/** Pin-sized age label: "now", "12m", "5h", "3d". */
export function shortAge(iso: string, now = Date.now()): string {
  const age = Math.max(0, now - parseISO(iso).getTime())
  if (age < 2 * MINUTE) return 'now'
  if (age < HOUR) return `${Math.round(age / MINUTE)}m`
  if (age < DAY) return `${Math.round(age / HOUR)}h`
  return `${Math.round(age / DAY)}d`
}
