import { useCallback, useState } from 'react'

const STORAGE_KEY = 'map-news:seen-ids'

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export function useSeenNews() {
  const [seenIds, setSeenIds] = useState<Set<string>>(() => readSeen())

  const markSeen = useCallback((ids: string[]) => {
    setSeenIds((current) => {
      const next = new Set(current)
      let changed = false
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      if (!changed) return current
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  return { seenIds, markSeen }
}
