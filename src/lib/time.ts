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
