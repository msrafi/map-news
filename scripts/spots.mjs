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
 * All-caps copy gives no capitalisation signal, so a locative preposition plus the
 * list that follows it is the only handle: "... DANGER IN JAZAN, ABHA AND KHAMIS
 * MUSHAIT." Each item is filtered and then has to geocode as a real place.
 */
const ALLCAPS_PLACE_RE =
  /\b(?:IN|FOR|NEAR|AT|FROM|OVER|AROUND|ACROSS)\s+([A-ZÀ-Ý][A-ZÀ-Ý' -]{2,}(?:,\s*[A-ZÀ-Ý][A-ZÀ-Ý' -]{2,})*)/g

/** Locative and linking words that prefix the place inside a captured run. */
const RUN_PREFIX_RE = /\b(?:IN|FOR|NEAR|AT|FROM|OVER|AROUND|ACROSS|OF|TO|BY|ON|WITH)\b/

/** "ABHA AREAS" is still Abha; the collective noun is not part of the name. */
const COLLECTIVE_TAIL_RE =
  /\s+(AREAS?|REGIONS?|CITIES|TOWNS|PROVINCES|GOVERNORATES|DISTRICTS|SUBURBS|OUTSKIRTS)$/

/** Wire copy ends a line with " - STATE TV" or " – REUTERS"; that is the source. */
const SOURCE_TAIL_RE = /\s+[-–—]\s+.*$/

/** "LVIV OVERNIGHT" is Lviv; the trailing adverb is timing, not the name. */
const TIMING_TAIL_RE =
  /\s+(OVERNIGHT|TONIGHT|TODAY|TOMORROW|YESTERDAY|EARLIER|AGAIN|RECENTLY|SOON|NOW|THIS\s+\w+|LAST\s+\w+|NEXT\s+\w+|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)$/

/**
 * Everyday English. All-caps copy capitalises everything, so a run built only of
 * these words is a phrase, not a name: "POTENTIAL DANGER", "CAUGHT FIRE".
 */
const COMMON_WORDS = new Set(
  `a an the and or but of to in on for with by from as at into onto over under about after before
   this that these those it its his her their our your my we they he she you us them him me who whom
   is are was were be been being am has have had do does did will would can could should may might must
   shall says say said tells told adds added asks asked makes make made take takes taken took goes go
   went gone gets get got give gives given comes come came sees see seen saw knows know known thinks
   think wants want needs need uses use used finds find found works work calls call called tries try
   seems seem feels feel leaves leave left puts put keeps keep kept lets let begins begin began shows
   show shown hears hear heard plays play runs run ran moves move moved lives live believes believe
   holds hold held brings bring brought happens happen writes write sits sit stands stand loses lose
   lost pays pay paid meets meet met includes include continues continue sets learns learn changes
   change leads lead led understands understand watches watch follows follow stops stop stopped
   creates create speaks speak spoke reads read allows allow adds spends spend grows grow opens open
   walks walk wins win won offers offer remembers consider considers appears appear buys buy bought
   waits wait serves serve dies die sends send sent builds build built stays stay falls fall fell cuts
   cut reaches reach kills kill killed remains remain suggests raises raise passes passed sells sell
   sold requires require reports report decides decide pulls pull caught catch damaged damage rises
   rise rose expects expect issued issues issue announced announce
   good new news old first last long great little own other others right big high low different small
   large next early late young important few public private bad same able major minor key strong weak
   full total final global national local federal general potential current former future several
   many most more less all both each every some any no not only just also very well back there here
   now then when where how what which why still yet again soon such own
   time times year years month months week weeks day days hour hours minute minutes today tomorrow
   yesterday morning evening night people person man woman men women child children thing things way
   ways world life hand part parts place places point points case cases fact facts number numbers
   home homes house fire water power energy land level levels side sides end ends line lines order
   effect force amount amounts rest top bottom kingdom history humanity success failure bankruptcy
   danger dangers warning warnings alert alerts risk risks safety emergency evacuation casualties
   damages threat threats attack attacks strike strikes war conflict crisis response support help aid
   business market markets trade growth sale sales tax taxes investment investments strategy plan
   plans policy policies deal deals talks meeting conference report reports data media press statement
   decision agreement project projects program programme system network service services industry
   sector economy rate rates share shares stock stocks bond bonds fund funds debt profit
   profits loss losses earnings revenue demand supply output production capacity resources security
   defense defence regulation regulations rule rules law laws terms documents evidence review
   tensions relations partnership partnerships concessions trends shipping soldiers troops forces
   officials leaders members workers employees customers consumers corporates borrowers jobs countries
   nations percent billion million trillion bln mln cash value values price prices cost costs budget
   fuel cars car building development economic pure nominal mineral minerals untapped implemented
   implement strongly absolutely detention confiscation custody bankruptcy destroying beyond until
   while though although according amid despite versus if higher lower
   one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred
   thousand fourth fifth sixth seventh eighth ninth tenth half quarter
   january february march april june july august september october november december
   monday tuesday wednesday thursday friday saturday sunday`
    .toLowerCase()
    .split(/\s+/),
)

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

/** Generic geographic nouns: enough on their own to mark a run as a place. */
const PLACE_WORD_RE =
  /\b(region|oblast|province|district|governorate|prefecture|county|city|town|village|island|peninsula|strait|valley|border|coast|canal|desert|sea|gulf|bay|river|lake|delta|basin|mountains?)\b/i

/**
 * Wire attribution: "BESSENT: ...", "POWELL SAYS ...". A surname after an
 * organisation's possessive is a spokesperson, never a place.
 */
const SPEAKER_AFTER_RE =
  /^\s*(?::|[,-]?\s*(?:SAYS|SAID|TELLS|TOLD|ADDS|WARNS|NOTES|COMMENTS|says|said|tells|told|adds|warns)\b)/

/** An organisation or a job title, never somewhere to drop a pin. */
/** Abstract nouns that read like proper names in all-caps copy but map nowhere. */
const ABSTRACT_RE =
  /\b(sector|complex|economy|economies|market|markets|industry|policy|policies|budget|sanctions|tariffs?|inflation|output|revenue|exports?|imports?|defence|defense|security|intelligence|media|press|statement|decision|agreement|deal|talks|summit|meeting|war|conflict|crisis|response|plan|programme?|projects?|system|network|grid|fund|funds|reserves?|currency|debt|bonds?|shares?|stocks?|trade|growth|jobs|rates?|prices?|supply|demand|production|capacity|assets?|sales|profits?|earnings)\b/i

const ORG_OR_TITLE_RE =
  /\b(ministry|ministries|government|parliament|senate|congress|cabinet|court|agency|bureau|authority|commission|committee|council|department|administration|forces|army|navy|guards|police|party|central\s+bank|bank|treasury|federation|union|team|board|office|academy|institute|corp|inc|ltd|plc|group|holdings|president|prime\s+minister|minister|min|secretary|speaker|adviser|advisor|chief|envoy|spokesman|spokeswoman|spokesperson|ambassador|governor|chairman|ceo|official|officials|leader|general|admiral|colonel|judge|senator|lawmaker)\b/i

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
  // Continent-scale names are too broad to drop a pin on.
  'middle east',
  'europe',
  'asia',
  'africa',
  'americas',
  'north america',
  'south america',
  'latin america',
])

/**
 * A possessive run keeps going past the place ("Abha Airport Suspends Flights"),
 * so cut it at the first facility or geographic noun.
 */
function trimToPlaceNoun(name) {
  const stop = new RegExp(`${FACILITY_WORD_RE.source}|${PLACE_WORD_RE.source}`, 'i')
  const found = stop.exec(name)
  if (!found) return name
  const trimmed = name.slice(0, found.index + found[0].length).trim()
  // "City" on its own is a noun, not a place; it needs the name in front of it.
  return trimmed.toLowerCase() === found[0].toLowerCase() ? null : trimmed
}

/**
 * Cleans one item of an all-caps list into a place name, or `null` when the item
 * is really the rest of the sentence. `lead` is the item the preposition sits in.
 */
function allCapsPlaceName(raw, lead) {
  // A comma before "AND" leaves the conjunction on the next item.
  const part = raw.replace(/^AND\s+/, '').replace(SOURCE_TAIL_RE, '')
  // "POTENTIAL DANGER IN JAZAN" keeps its place last; a later item carrying its
  // own preposition is prose ("... ABHA, ACCORDING TO TRADERS"), so drop it.
  const prefixed = RUN_PREFIX_RE.test(part)
  if (prefixed && !lead) return null
  // "SAUDI ARABIA'S KHAMIS MUSHAIT" names the place after the owner.
  const owned = part.includes("'S ") ? part.slice(part.lastIndexOf("'S ") + 3) : part
  const name = tidy(
    (prefixed ? owned.split(RUN_PREFIX_RE).pop() : owned)
      .replace(COLLECTIVE_TAIL_RE, '')
      .replace(TIMING_TAIL_RE, '')
      .replace(/'/g, ' '),
  )
  const words = name ? name.split(/\s+/) : []
  if (words.length === 0 || words.length > 3) return null
  if (words.some((word) => word.length < 2)) return null
  if (ORG_OR_TITLE_RE.test(name) || ABSTRACT_RE.test(name)) return null
  // A place name is carried by its head word: "Khamis Mushait", "Barents Sea".
  // When that word is everyday English the run is a phrase ("HIGHER FUEL").
  if (COMMON_WORDS.has(words[words.length - 1].toLowerCase())) return null
  // "THE REGION" is a bare noun; "JAZAN PROVINCE" carries a name with it.
  if (words.length === 1 && PLACE_WORD_RE.test(name)) return null
  return name
}

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
    // "Washington's" is the owner, not the place.
    .replace(/['’][Ss]$/, '')
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
  // A bare compass word is the tail of a split name ("... , South Carolina").
  if (/^(north|south|east|west|central|northern|southern|eastern|western)$/i.test(name)) return
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
  } else {
    for (const match of text.matchAll(ALLCAPS_PLACE_RE)) {
      const parts = match[1].split(/\s*,\s*|\s+AND\s+|\s+&\s+/)
      // One all-caps run after a preposition could be anything; a list is the
      // shape that reliably names places ("IN JAZAN, ABHA AND KHAMIS MUSHAIT").
      if (parts.length < 2) continue
      for (const [index, part] of parts.entries()) {
        const name = allCapsPlaceName(part, index === 0)
        if (!name || knownKeys.has(name.toLowerCase())) continue
        pushCandidate(names, { name, facility: false })
      }
    }
  }

  for (const match of text.matchAll(POSSESSIVE_PLACE_RE)) {
    const owner = match[1]
    const place = tidy(match[2])
    const country = countryByKey.get(owner.toLowerCase())
    // "U.S. TREASURY'S BESSENT: ..." names an official, not a refinery.
    if (SPEAKER_AFTER_RE.test(text.slice(match.index + match[0].length))) continue
    if (ORG_OR_TITLE_RE.test(place) || ABSTRACT_RE.test(place)) continue

    const named = trimToPlaceNoun(place)
    if (!named) continue
    const hasPlaceNoun = FACILITY_WORD_RE.test(named) || PLACE_WORD_RE.test(named)
    // Otherwise only a compact multi-word name survives: "Khamis Mushait" is a town,
    // a lone surname like "Bessent" or "Altman" is not.
    const wordCount = named.split(/\s+/).length
    if (!hasPlaceNoun && (wordCount < 2 || wordCount > 3)) continue
    if (knownKeys.has(named.toLowerCase()) && !FACILITY_WORD_RE.test(named)) continue
    pushCandidate(names, { name: named, country, facility: true })
  }

  for (const match of text.matchAll(FACILITY_SUFFIX_RE)) {
    const named = trimToPlaceNoun(tidy(match[1]))
    if (!named || ORG_OR_TITLE_RE.test(named) || ABSTRACT_RE.test(named)) continue
    if (named.split(/\s+/).length < 2) continue
    pushCandidate(names, { name: named, facility: true })
  }

  for (const match of text.matchAll(ATTACK_PLACE_RE)) {
    const place = tidy(match[1])
    if (SPEAKER_AFTER_RE.test(text.slice(match.index + match[0].length))) continue
    if (ORG_OR_TITLE_RE.test(place) || ABSTRACT_RE.test(place)) continue
    // Attack verbs only keep targets that look like facilities or multi-word places.
    if (!FACILITY_WORD_RE.test(place) && !place.includes(' ')) continue
    const named = FACILITY_WORD_RE.test(place) ? trimToPlaceNoun(place) : place
    if (!named) continue
    if (knownKeys.has(named.toLowerCase())) continue
    pushCandidate(names, { name: named, facility: true })
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
