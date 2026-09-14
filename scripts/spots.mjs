// Resolves precise datelines like "78 KM NORTH-NORTHEAST OF TOBELO, INDONESIA"
// into coordinates, using Nominatim for the anchor town and a great-circle offset
// for the distance and bearing. Results are cached so repeat runs stay offline.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const CACHE_FILE = fileURLToPath(new URL('./geocache.json', import.meta.url))
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'map-news/1.0 (personal hobby project)'
const RATE_LIMIT_MS = 1100

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

let lastCall = 0

async function geocode(query, cache) {
  const key = query.toLowerCase()
  if (key in cache) return cache[key]

  const wait = RATE_LIMIT_MS - (Date.now() - lastCall)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastCall = Date.now()

  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`geocode failed (${response.status})`)

  const results = await response.json()
  const hit = results[0]
  cache[key] = hit ? { lat: Number(hit.lat), lng: Number(hit.lon), name: hit.display_name } : null
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

/** Adds a `spot` to any item whose headline carries a precise dateline. */
export async function addSpots(items) {
  const cache = await readCache()
  const before = Object.keys(cache).length
  let added = 0

  for (const item of items) {
    if (item.spot) continue
    const dateline = parseDateline(item.text)
    if (!dateline) continue

    let anchor
    try {
      anchor = await geocode(dateline.query, cache)
    } catch {
      continue
    }
    if (!anchor) continue

    const point = destinationPoint(anchor.lat, anchor.lng, dateline.km, dateline.bearing)
    item.spot = {
      label: `${dateline.km} km ${dateline.bearingLabel.toLowerCase()} of ${dateline.anchorName}`,
      lat: point.lat,
      lng: point.lng,
      anchorName: dateline.anchorName,
      anchorLat: anchor.lat,
      anchorLng: anchor.lng,
    }
    added += 1
  }

  if (Object.keys(cache).length !== before) {
    await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`)
  }
  return added
}

export const _test = { destinationPoint, parseDateline }
