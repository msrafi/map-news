import { useCallback, useState } from 'react'

const STORAGE_KEY = 'map-news:saved-symbols'
const MAX_SAVED = 200

type SavedSymbols = {
  options: string[]
  stocks: string[]
}

function readSaved(): SavedSymbols {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { options: [], stocks: [] }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { options: [], stocks: [] }
    const record = parsed as Record<string, unknown>
    return {
      options: cleanList(record.options),
      stocks: cleanList(record.stocks),
    }
  } catch {
    return { options: [], stocks: [] }
  }
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const list: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const ticker = entry.trim().toUpperCase()
    if (!ticker || seen.has(ticker)) continue
    seen.add(ticker)
    list.push(ticker)
    if (list.length >= MAX_SAVED) break
  }
  return list
}

/** Newest first, without dropping symbols the current time filter no longer shows. */
function mergeNewestFirst(current: string[], incoming: string[]): string[] {
  const have = new Set(current)
  const novel: string[] = []
  for (const ticker of incoming) {
    if (have.has(ticker)) continue
    have.add(ticker)
    novel.push(ticker)
  }
  if (novel.length === 0) return current
  return [...novel, ...current].slice(0, MAX_SAVED)
}

export function useSavedSymbols() {
  const [saved, setSaved] = useState<SavedSymbols>(() => readSaved())

  const remember = useCallback((options: string[], stocks: string[]) => {
    setSaved((current) => {
      const next = {
        options: mergeNewestFirst(current.options, options),
        stocks: mergeNewestFirst(current.stocks, stocks),
      }
      if (
        next.options.length === current.options.length &&
        next.stocks.length === current.stocks.length &&
        next.options.every((ticker, index) => ticker === current.options[index]) &&
        next.stocks.every((ticker, index) => ticker === current.stocks[index])
      ) {
        return current
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { saved, remember }
}
