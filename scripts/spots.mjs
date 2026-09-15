// Resolves the exact places a headline names into coordinates, so the map can point
// at them instead of only at the region pin. Two sources:
//   1. USGS-style datelines - "78 KM NORTH-NORTHEAST OF TOBELO, INDONESIA"
//   2. Named sub-locations  - "urgent alert for Abha and Jazan"
// Anchors are geocoded through Nominatim and cached, so repeat runs stay offline.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const CACHE_FILE = fileURLToPath(new URL('./geocache.json', import.meta.url))
const PLACES_FILE = fileURLToPath(new URL('../src/data/places.json', import.meta.url))
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'map-news/1.0 (personal hobby project)'
const RATE_LIMIT_MS = 1100

/** Caps network work per run so the merge watcher stays responsive. */
const LOOKUP_BUDGET = 25

/** Most headlines name one or two places; more than this is a sign of a bad parse. */
const MAX_PLACES_PER_ITEM = 4

const BEARINGS = {
  N: 0,
  NORTH: 0,
  NNE: 22.5,
  'NORTH-NORTHEAST': 22.5,
  NE: 45,
  NORTHEAST: 45,
  ENE: 67.5,
  'EAST-NORTHEAST': 67.5,
  E: 90,
  EAST: 90,
  ESE: 112.5,
  'EAST-SOUTHEAST': 112.5,
  SE: 135,
  SOUTHEAST: 135,
  SSE: 157.5,
  'SOUTH-SOUTHEAST': 157.5,
  S: 180,
  SOUTH: 180,
  SSW: 202.5,
  'SOUTH-SOUTHWEST': 202.5,
  SW: 225,
  SOUTHWEST: 225,
  WSW: 247.5,
  'WEST-SOUTHWEST': 247.5,
  W: 270,
  WEST: 270,
  WNW: 292.5,
  'WEST-NORTHWEST': 292.5,
  NW: 315,
  NORTHWEST: 315,
  NNW: 337.5,
  'NORTH-NORTHWEST': 337.5,
}

const DATELINE_RE =
  /(\d+(?:\.\d+)?)\s*KM\s+([NSEW][A-Z-]*)\s+OF\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,30}?)(?:,\s*([A-Za-zÀ-ÿ ]{2,30}?))?(?=[,.;]|\s+ACCORDING|\s*$)/i

/** A capitalised run following a locative preposition; inner caps keep "Ras Al-Arah" whole. */
const NAMED_PLACE_RE =
  /\b(?:for|in|near|at|from|over|around|across)\s+([A-Z][A-Za-zÀ-ÿ'-]{2,}(?:\s+(?:and|&)\s+[A-Z][A-Za-zÀ-ÿ'-]{2,}|\s+[A-Z][A-Za-zÀ-ÿ'-]{2,}|,\s*[A-Z][A-Za-zÀ-ÿ'-]{2,}){0,3})/g

/** Capitalised words that follow a preposition but never name a place. */
const NOT_PLACES = new Set([
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'congress',
  'parliament',
  'senate',
  'state tv',
  'communist party',
  'migration',
  'christmas',
  'ramadan',
])

const EARTH_RADIUS_KM = 6371

function destinationPoint(lat, lng, km, bearingDeg) {
  const angular = km / EARTH_RADIUS_KM
  const bearing = (bearingDeg * Math.PI) / 180
  const lat1 = (lat * Math.PI) / 180
  const lng1 = (lng * Math.PI) / 180

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    )

  return {
    lat: Number(((lat2 * 180) / Math.PI).toFixed(4)),
    lng: Number(((((lng2 * 180) / Math.PI + 540) % 360) - 180).toFixed(4)),
  }
}

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

let knownKeys = null

async function gazetteerKeys() {
  if (knownKeys) return knownKeys
  const places = JSON.parse(await readFile(PLACES_FILE, 'utf8'))
  knownKeys = new Set()
  for (const place of places) {
    for (const key of place.keys) knownKeys.add(key.toLowerCase())
  }
  return knownKeys
}

let lastCall = 0

/** Looks a place up once; `null` is cached too so junk is never queried twice. */
async function geocode(query, cache, placesOnly) {
  const key = query.toLowerCase()
  if (key in cache) return cache[key]

  const wait = RATE_LIMIT_MS - (Date.now() - lastCall)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastCall = Date.now()

  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`geocode failed (${response.status})`)

  const hit = (await response.json())[0]
  // A town or district is a place; a shop or an office block is not.
  const usable = hit && (!placesOnly || hit.class === 'place' || hit.class === 'boundary')
  cache[key] = usable
    ? { lat: Number(hit.lat), lng: Number(hit.lon), name: hit.display_name }
    : null
  return cache[key]
}

export function parseDateline(text) {
  const found = DATELINE_RE.exec(text)
  if (!found) return null

  const [, distance, bearingRaw, place, country] = found
  const bearing = BEARINGS[bearingRaw.toUpperCase()]
  if (bearing === undefined) return null

  return {
    km: Number.parseFloat(distance),
    bearing,
    bearingLabel: bearingRaw.toUpperCase(),
    anchorName: place.trim(),
    query: country ? `${place.trim()}, ${country.trim()}` : place.trim(),
  }
}

function tidy(name) {
  return name
    .replace(/[^A-Za-zÀ-ÿ' -]/g, '')
    .replace(/[-\s]+$/, '')
    .trim()
}

/**
 * Pulls sub-locations out of a headline. Only mixed-case text is mined: in an
 * all-caps wire headline every word looks like a proper noun.
 */
export async function parseNamedPlaces(rawText) {
  const text = rawText.replace(/[’‘`]/g, "'")
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (!letters || text === text.toUpperCase()) return []

  const known = await gazetteerKeys()
  const names = []

  for (const match of text.matchAll(NAMED_PLACE_RE)) {
    for (const part of match[1].split(/\s+and\s+|\s*,\s*|\s+&\s+/)) {
      // "Saudi Arabia's Khamis Mushait" - the place is the part after the possessive.
      const tail = part.includes("'s ") ? part.slice(part.indexOf("'s ") + 3) : part
      const name = tidy(tail)
      const lower = name.toLowerCase()
      if (name.length < 3) continue
      if (NOT_PLACES.has(lower) || known.has(lower)) continue
      if (!names.includes(name)) names.push(name)
    }
  }

  return names.slice(0, MAX_PLACES_PER_ITEM)
}

/** Adds `spots`: the exact places a headline points at, beyond its region pin. */
export async function addSpots(items) {
  const cache = await readCache()
  const before = Object.keys(cache).length
  let budget = LOOKUP_BUDGET
  let added = 0

  const spend = () => budget > 0 && budget--

  for (const item of items) {
    // Migrate the single-spot shape this script used to write.
    if (item.spot && !item.spots) {
      item.spots = [{ ...item.spot, kind: 'dateline' }]
      delete item.spot
    }
    if (item.spots) continue

    const spots = []

    const dateline = parseDateline(item.text)
    if (dateline) {
      const cached = dateline.query.toLowerCase() in cache
      if (cached || spend()) {
        try {
          const anchor = await geocode(dateline.query, cache, false)
          if (anchor) {
            const point = destinationPoint(anchor.lat, anchor.lng, dateline.km, dateline.bearing)
            spots.push({
              kind: 'dateline',
              label: `${dateline.km} km ${dateline.bearingLabel.toLowerCase()} of ${dateline.anchorName}`,
              lat: point.lat,
              lng: point.lng,
            })
          }
        } catch {
          continue
        }
      }
    }

    for (const name of await parseNamedPlaces(item.text)) {
      const query = item.country ? `${name}, ${item.country}` : name
      if (!(query.toLowerCase() in cache) && !spend()) break
      try {
        const hit = await geocode(query, cache, true)
        if (hit) spots.push({ kind: 'place', label: name, lat: hit.lat, lng: hit.lng })
      } catch {
        break
      }
    }

    if (spots.length > 0) {
      item.spots = spots
      added += spots.length
    }
  }

  if (Object.keys(cache).length !== before) {
    await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`)
  }
  return added
}

export const _test = { destinationPoint, parseDateline }
