import placeTable from '../data/places.json'
import type { LocationHit, RegionRef } from '../types'

type PlaceEntry = RegionRef & { keys: string[] }

const PLACES = placeTable as PlaceEntry[]

const MATCHERS = PLACES.flatMap((place) =>
  place.keys.map((key) => {
    const word = key.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return { place, pattern: new RegExp(`\\b${word}\\b`, 'gi') }
  }),
)

function toRef(place: PlaceEntry): RegionRef {
  return {
    id: place.id,
    region: place.region,
    city: place.city,
    country: place.country,
    lat: place.lat,
    lng: place.lng,
  }
}

/** Named places in a headline, left-to-right, overlapping shorter matches dropped. */
export function findLocationHits(text: string): LocationHit[] {
  const raw: LocationHit[] = []

  for (const matcher of MATCHERS) {
    matcher.pattern.lastIndex = 0
    let found = matcher.pattern.exec(text)
    while (found) {
      raw.push({
        start: found.index,
        end: found.index + found[0].length,
        label: found[0],
        ref: toRef(matcher.place),
      })
      found = matcher.pattern.exec(text)
    }
  }

  raw.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))

  const hits: LocationHit[] = []
  let cursor = 0
  for (const hit of raw) {
    if (hit.start < cursor) continue
    hits.push(hit)
    cursor = hit.end
  }
  return hits
}

/** Unique places named in a headline, ordered by first mention. */
export function findRegions(text: string): RegionRef[] {
  const seen = new Set<string>()
  const regions: RegionRef[] = []
  for (const hit of findLocationHits(text)) {
    if (seen.has(hit.ref.id)) continue
    seen.add(hit.ref.id)
    regions.push(hit.ref)
  }
  return regions
}
