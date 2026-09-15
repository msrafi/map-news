import type { MapStyleId } from '../types'

/** `theme` is the basemap's own brightness, which the markers contrast against. */
export const MAP_STYLES: {
  id: MapStyleId
  label: string
  url: string
  theme: 'dark' | 'light'
}[] = [
  { id: 'dark', label: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark', theme: 'dark' },
  {
    id: 'fiord',
    label: 'Dark streets',
    url: 'https://tiles.openfreemap.org/styles/fiord',
    theme: 'dark',
  },
  {
    id: 'liberty',
    label: 'Streets',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    theme: 'light',
  },
  {
    id: 'positron',
    label: 'Light',
    url: 'https://tiles.openfreemap.org/styles/positron',
    theme: 'light',
  },
  {
    id: 'bright',
    label: 'Bright',
    url: 'https://tiles.openfreemap.org/styles/bright',
    theme: 'light',
  },
]

const STORAGE_KEY = 'map-news:map-style'

export function styleUrl(id: MapStyleId): string {
  return MAP_STYLES.find((style) => style.id === id)?.url ?? MAP_STYLES[0].url
}

export function themeOf(id: MapStyleId): 'dark' | 'light' {
  return MAP_STYLES.find((style) => style.id === id)?.theme ?? 'dark'
}

export function readMapStyle(): MapStyleId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (MAP_STYLES.some((style) => style.id === raw)) return raw as MapStyleId
  } catch {
    // Private mode can throw; fall back to the default dark map.
  }
  return 'dark'
}

export function writeMapStyle(id: MapStyleId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Ignore quota / private-mode failures.
  }
}
