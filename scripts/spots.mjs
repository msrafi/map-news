// Resolves the exact places a headline names into coordinates, so the map can
// point at them instead of only at the region pin. Three sources:
//   1. USGS-style datelines  - "78 KM NORTH-NORTHEAST OF TOBELO, INDONESIA"
//   2. Named sub-locations   - "urgent alert for Abha and Jazan" (mixed-case)
//   3. Named facilities      - "RUSSIA'S SYZRAN OIL REFINERY" (all-caps wire copy)
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

/**
 * Possessive country/owner + place. Catches all-caps "RUSSIA'S SYZRAN OIL REFINERY"
 * ('S) and mixed-case "Saudi Arabia's Abha airport" ('s).
 */
const POSSESSIVE_PLACE_RE =
  /\b([A-Z][A-Za-zÀ-ÿ-]{2,})(?:'[Ss]|’[Ss])\s+([A-Z][A-Za-zÀ-ÿ0-9'-]{2,}(?:\s+[A-Z][A-Za-zÀ-ÿ0-9'-]{2,}){0,6})/g

/**
 * Attack / strike verbs that introduce a target place in wire copy:
 * "HIT SYZRAN OIL REFINERY", "STRUCK THE KERCH BRIDGE".
 */
const ATTACK_PLACE_RE =
  /\b(?:[Hh]it|[Hh]its|[Ss]truck|[Ss]trikes|[Ss]trike|[Aa]ttacked|[Aa]ttacks|[Bb]ombed|[Bb]ombs|[Tt]argeted|[Tt]argets|[Dd]estroyed|[Dd]estroys)\s+(?:(?:[Tt]he)\s+)?([A-Z][A-Za-zÀ-ÿ0-9'-]{2,}(?:\s+[A-Z][A-Za-zÀ-ÿ0-9'-]{2,}){0,6})/g

/** Landmark endings that mark a capitalised run as a real place, even in all-caps. */
const FACILITY_SUFFIX_RE =
  /\b((?:[A-Z][A-Za-zÀ-ÿ0-9'-]{2,}(?:\s+[A-Z][A-Za-zÀ-ÿ0-9'-]{2,}){0,2}\s+)?(?:[Oo]il\s+[Rr]efinery|[Gg]as\s+[Rr]efinery|[Rr]efinery|[Oo]il\s+[Tt]erminal|[Gg]as\s+[Tt]erminal|[Ll][Nn][Gg]\s+[Tt]erminal|[Aa]irport|[Aa]irfield|[Aa]ir\s*[Bb]ase|[Nn]aval\s+[Bb]ase|[Mm]ilitary\s+[Bb]ase|[Aa]rmy\s+[Bb]ase|[Pp]ower\s+[Pp]lant|[Nn]uclear\s+(?:[Pp]ower\s+)?[Pp]lant|[Nn]uclear\s+[Ss]ite|[Bb]ridge|[Pp]ort|[Hh]arbour|[Hh]arbor|[Ss]eaport|[Dd]am|[Ff]actory|[Dd]epot|[Pp]ipeline|[Gg]as\s+[Ff]ield|[Oo]il\s+[Ff]ield|[Cc]oal\s+[Mm]ine|[Mm]ine|[Pp]rison|[Pp]alace|[Ee]mbassy|[Ss]tadium|[Uu]niversity|[Hh]ospital|[Mm]osque|[Cc]athedral))\b/g

const FACILITY_WORD_RE =
  /\b(refinery|airport|airfield|bridge|port|harbour|harbor|base|plant|field|mine|dam|terminal|depot|factory|pipeline|stadium|university|hospital|embassy|palace|prison|mosque|cathedral)\b/i

const TOWN_FALLBACK_RE =
  /\s+(oil\s+refinery|gas\s+refinery|refinery|airport|airfield|air\s*base|naval\s+base|military\s+base|power\s+plant|nuclear\s+(?:power\s+)?plant|bridge|port|harbour|harbor|factory|depot|terminal|gas\s+field|oil\s+field)$/i

const FACILITY_CLASSES = new Set([
  'place',
  'boundary',
  'industrial',
  'man_made',
  'amenity',
  'aeroway',
  'military',
  'landuse',
  'building',
])

/** Verb / country crumbs left on attack or facility matches. */
const LEADING_NOISE = new Set([
  'hit',
  'hits',
  'struck',
  'strikes',
  'strike',
  'attacked',
  'attacks',
  'bombed',
  'bombs',
  'targeted',
  'targets',
  'destroyed',
  'destroys',
  'announces',
  'announce',
  'says',
  'said',
  'ukraine',
  'russia',
  'china',
  'america',
])

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
  'partners',
  'deal',
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

function tidy(name) {
  return name
    .replace(/[^A-Za-zÀ-ÿ0-9' -]/g, '')
    .replace(/[-\s]+$/g, '')
    .replace(/^\s*the\s+/i, '')
    .trim()
}

/** Wire copy is often ALL CAPS; show "Syzran Oil Refinery" on the map. */
function titleCase(name) {
  return name
    .toLowerCase()
    .replace(/\b([a-zÀ-ÿ])/g, (letter) => letter.toUpperCase())
    .replace(/\b(Lng|Usa|Uk)\b/g, (token) => token.toUpperCase())
    .replace(/'S\b/g, "'s")
}

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

let knownKeys = null
let countryByKey = null

async function loadGazetteer() {
  if (knownKeys && countryByKey) return { knownKeys, countryByKey }
  const places = JSON.parse(await readFile(PLACES_FILE, 'utf8'))
  knownKeys = new Set()
  countryByKey = new Map()
  for (const place of places) {
    for (const key of place.keys) {
      const lower = key.toLowerCase()
      knownKeys.add(lower)
      if (place.country) countryByKey.set(lower, place.country)
    }
    if (place.country) countryByKey.set(place.country.toLowerCase(), place.country)
  }
  return { knownKeys, countryByKey }
}

let lastCall = 0

/**
 * Looks a place up once; `null` is cached too so junk is never queried twice.
 * `mode`: 'place' keeps towns/districts only; 'facility' also keeps industrial sites;
 * 'any' accepts the first Nominatim hit.
 */
async function geocode(query, cache, mode) {
  const key = query.toLowerCase()
  if (key in cache) return cache[key]

  const wait = RATE_LIMIT_MS - (Date.now() - lastCall)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastCall = Date.now()

  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`geocode failed (${response.status})`)

  const hit = (await response.json())[0]
  let usable = false
  if (hit) {
    if (mode === 'any') usable = true
    else if (mode === 'facility') usable = FACILITY_CLASSES.has(hit.class)
    else usable = hit.class === 'place' || hit.class === 'boundary'
  }

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

function pushCandidate(list, candidate) {
  let name = tidy(candidate.name)
  // "HIT RUSSIA'S SYZRAN ..." / "UKRAINE HIT SYZRAN ..." leave verb/country crumbs.
  const parts = name.split(/\s+/)
  while (parts.length > 1 && LEADING_NOISE.has(parts[0].toLowerCase().replace(/'s$/i, ''))) {
    parts.shift()
  }
  name = parts.join(' ')
  if (name.length < 3) return
  const lower = name.toLowerCase()
  if (NOT_PLACES.has(lower)) return
  if (list.some((entry) => entry.name.toLowerCase() === lower)) return
  list.push({
    name: titleCase(name),
    country: candidate.country,
    facility: Boolean(candidate.facility),
  })
}

/**
 * Pulls sub-locations out of a headline.
 * Mixed-case text uses locative prepositions; all-caps wire copy is limited to
 * possessive / facility / attack patterns so every capitalised word is not treated
 * as a place.
 */
export async function parseNamedPlaces(rawText) {
  const text = rawText.replace(/[’‘`]/g, "'")
  const letters = text.replace(/[^A-Za-z]/g, '')
  if (!letters) return []

  const { knownKeys, countryByKey } = await loadGazetteer()
  const allCaps = text === text.toUpperCase()
  const names = []

  if (!allCaps) {
    for (const match of text.matchAll(NAMED_PLACE_RE)) {
      for (const part of match[1].split(/\s+and\s+|\s*,\s*|\s+&\s+/)) {
        const tail = part.includes("'s ") ? part.slice(part.indexOf("'s ") + 3) : part
        const name = tidy(tail)
        if (knownKeys.has(name.toLowerCase())) continue
        pushCandidate(names, { name, facility: false })
      }
    }
  }

  for (const match of text.matchAll(POSSESSIVE_PLACE_RE)) {
    const owner = match[1]
    const place = tidy(match[2])
    const country = countryByKey.get(owner.toLowerCase())
    // Skip bare country possessives with no real place ("Russia's partners").
    if (knownKeys.has(place.toLowerCase()) && !FACILITY_WORD_RE.test(place)) continue
    pushCandidate(names, { name: place, country, facility: true })
  }

  for (const match of text.matchAll(FACILITY_SUFFIX_RE)) {
    pushCandidate(names, { name: match[1], facility: true })
  }

  for (const match of text.matchAll(ATTACK_PLACE_RE)) {
    const place = tidy(match[1])
    // Attack verbs only keep targets that look like facilities or multi-word places.
    if (!FACILITY_WORD_RE.test(place) && !place.includes(' ')) continue
    if (knownKeys.has(place.toLowerCase())) continue
    pushCandidate(names, { name: place, facility: true })
  }

  return names.slice(0, MAX_PLACES_PER_ITEM)
}

async function resolvePlace(candidate, itemCountry, cache, spend) {
  const country = candidate.country || itemCountry
  const queries = []
  if (country) queries.push(`${candidate.name}, ${country}`)
  queries.push(candidate.name)

  const town = candidate.name.replace(TOWN_FALLBACK_RE, '')
  if (town && town.toLowerCase() !== candidate.name.toLowerCase()) {
    if (country) queries.push(`${town}, ${country}`)
    queries.push(town)
  }

  const mode = candidate.facility ? 'facility' : 'place'

  for (const query of queries) {
    const cached = query.toLowerCase() in cache
    if (!cached && !spend()) return null
    try {
      const hit = await geocode(query, cache, mode)
      if (hit) return hit
      // Town fallback may only resolve as a place, not an industrial site.
      if (mode === 'facility' && town && query.toLowerCase().includes(town.toLowerCase())) {
        const townHit = await geocode(query, cache, 'place')
        if (townHit) return townHit
      }
    } catch {
      return null
    }
  }
  return null
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
          const anchor = await geocode(dateline.query, cache, 'any')
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

    for (const candidate of await parseNamedPlaces(item.text)) {
      const hit = await resolvePlace(candidate, item.country, cache, spend)
      if (hit) {
        spots.push({
          kind: 'place',
          label: candidate.name,
          lat: hit.lat,
          lng: hit.lng,
        })
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

export const _test = { destinationPoint, parseDateline, parseNamedPlaces, titleCase }
