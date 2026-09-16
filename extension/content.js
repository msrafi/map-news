const STORAGE_KEY = 'mapNewsItems'
const AUTO_KEY = 'mapNewsAuto'
/** Chrome throttles timers in a background tab, so this is a backup to the 2-minute alarm. */
const PULL_MS = 60_000
const REFRESH_MS = 120_000
/** A new post should leave the tab right away rather than waiting for the next pull. */
const EXPORT_DEBOUNCE_MS = 3_000
/** Scan and ship what is on screen before the reload wipes it. */
const PRE_RELOAD_MS = 4_000
const PLACES = self.MAP_NEWS_PLACES

const collected = new Map()
let saveTimer = null
let scanTimer = null
let pullTimer = null
let refreshTimer = null
let exportTimer = null
let observer = null

// Reloading the extension orphans this script: chrome.* still exists but every call
// throws "Extension context invalidated". Stop working rather than spam the console.
function connected() {
  try {
    return Boolean(chrome.runtime?.id)
  } catch {
    return false
  }
}

function teardown() {
  clearTimeout(saveTimer)
  clearTimeout(scanTimer)
  clearInterval(pullTimer)
  clearTimeout(refreshTimer)
  clearTimeout(exportTimer)
  observer?.disconnect()
  observer = null
}

const MATCHERS = PLACES.flatMap((place) =>
  place.keys.map((key) => {
    const word = key.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return { place, weight: word.length, pattern: new RegExp(`\\b${word}\\b`, 'i') }
  }),
)

const OPTIONS_PLACE = PLACES.find((place) => place.id === 'new-york')
const OPTION_TRADE_RE = /\$[A-Z]{1,6}\s+\d+(?:\.\d+)?\s*(?:C|P|CALLS?|PUTS?)\b/i

function isOptionTrade(text) {
  return OPTION_TRADE_RE.test(text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, ''))
}

const COMPANY_MATCHERS = (self.MAP_NEWS_COMPANIES ?? []).flatMap((company) =>
  company.names.map((name) => ({
    pattern: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  })),
)

// "ORACLE: PROJECTS SUPPLY ERCOT GRID..." names no place but is still US stock news.
function namesUsCompany(text) {
  return /\$[A-Z]{1,5}\b/.test(text) || COMPANY_MATCHERS.some((entry) => entry.pattern.test(text))
}

// Headlines name their subject first, so the earliest mention wins over the longest one.
function findPlace(text) {
  let best = null
  for (const matcher of MATCHERS) {
    const found = matcher.pattern.exec(text)
    if (!found) continue
    const earlier = !best || found.index < best.at
    const longerAtSameSpot = best && found.index === best.at && matcher.weight > best.weight
    if (earlier || longerAtSameSpot) {
      best = { place: matcher.place, at: found.index, weight: matcher.weight }
    }
  }
  return best && best.place
}

/** Enough to show a post is illustrated without turning the feed into a gallery. */
const MAX_MEDIA = 4

/** X serves every render off one URL; `name` picks the size. */
function sizedUrl(raw, size) {
  try {
    const url = new URL(raw, location.origin)
    if (url.hostname !== 'pbs.twimg.com') return raw
    url.searchParams.set('name', size)
    return url.toString()
  } catch {
    return raw
  }
}

// Photos on the post itself. A quoted post sits in its own role="link" box and is
// someone else's picture; avatars and emoji live outside tweetPhoto already.
function parseMedia(article) {
  const media = []
  const shots = article.querySelectorAll(
    '[data-testid="tweetPhoto"] img, [data-testid="tweetPhoto"] video[poster]',
  )

  for (const node of shots) {
    if (node.closest('[role="link"]')) continue
    const raw = node.tagName === 'VIDEO' ? node.getAttribute('poster') : node.getAttribute('src')
    if (!raw || !raw.includes('pbs.twimg.com')) continue

    const thumb = sizedUrl(raw, 'small')
    if (media.some((entry) => entry.thumb === thumb)) continue
    const alt = node.getAttribute('alt')
    media.push({ thumb, full: sizedUrl(raw, 'large'), ...(alt ? { alt } : null) })
    if (media.length >= MAX_MEDIA) break
  }

  return media
}

function parseArticle(article) {
  const textEl = article.querySelector('[data-testid="tweetText"]')
  const timeEl = article.querySelector('time[datetime]')
  if (!textEl || !timeEl) return null

  // The focused post on a status page has no link around its timestamp.
  const permalink = timeEl.closest('a[href*="/status/"]') ?? article.querySelector('a[href*="/status/"]')
  const href = permalink ? permalink.getAttribute('href') : location.pathname
  const statusMatch = href && href.match(/^\/([^/]+)\/status\/(\d+)/)
  if (!statusMatch) return null

  const text = textEl.innerText.trim()
  // Option alerts and corporate headlines often contain no location. Keep them for the
  // market drawers and use the US market hub only to satisfy the shared NewsItem shape.
  const place =
    findPlace(text) ?? (isOptionTrade(text) || namesUsCompany(text) ? OPTIONS_PLACE : null)
  if (!place) return null

  const nameEl = article.querySelector('[data-testid="User-Name"]')
  const author = nameEl ? nameEl.innerText.split('\n')[0].trim() : statusMatch[1]
  const media = parseMedia(article)

  return {
    id: `x-${statusMatch[2]}`,
    regionId: place.id,
    region: place.region,
    city: place.city,
    country: place.country,
    lat: place.lat,
    lng: place.lng,
    author,
    handle: `@${statusMatch[1]}`,
    text,
    publishedAt: new Date(timeEl.getAttribute('datetime')).toISOString(),
    sourceUrl: `https://x.com/${statusMatch[1]}/status/${statusMatch[2]}`,
    ...(media.length > 0 ? { media } : null),
  }
}

function save() {
  if (!connected()) return Promise.resolve()
  const items = [...collected.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  try {
    return chrome.storage.local.set({ [STORAGE_KEY]: items })
  } catch {
    teardown()
    return Promise.resolve()
  }
}

function exportTick() {
  if (!connected()) return teardown()
  chrome.storage.local
    .get(AUTO_KEY)
    .then((stored) => {
      if (stored[AUTO_KEY] === false) return
      return chrome.runtime.sendMessage({ type: 'export-tick' })
    })
    .catch(teardown)
}

/** Posts arrive in bursts, so a short wait batches them into one download. */
function queueExport() {
  clearTimeout(exportTimer)
  exportTimer = setTimeout(exportTick, EXPORT_DEBOUNCE_MS)
}

function scan() {
  if (!connected()) {
    teardown()
    return 0
  }
  let added = 0
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const item = parseArticle(article)
    if (!item) continue
    const known = collected.get(item.id)
    // X loads photos after the text, so a post is usually seen once without them.
    if (known && (known.media?.length || !item.media)) continue
    collected.set(item.id, item)
    added += 1
  }
  if (added === 0) return 0
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    save().then(queueExport).catch(teardown)
  }, 500)
  return added
}

function pull() {
  if (!connected()) return teardown()
  const queued = showQueuedPosts()
  const run = () => {
    if (!connected()) return teardown()
    // A scan that finds something queues its own export.
    if (scan() === 0) exportTick()
  }
  // X inserts the queued posts after the pill click; give the DOM a beat to catch up.
  if (queued) setTimeout(run, 800)
  else run()
}

function scheduleScan() {
  clearTimeout(scanTimer)
  scanTimer = setTimeout(scan, 300)
}

// X queues new posts behind a pill instead of inserting them, so the page can sit
// frozen for half an hour. Clicking the pill is what actually renders them.
function showQueuedPosts() {
  const labelled = document.querySelector('[aria-label*="New posts" i]')
  if (labelled) {
    labelled.click()
    return true
  }
  for (const button of document.querySelectorAll('button, [role="button"]')) {
    if (/^show \d+ posts?$/i.test(button.innerText.trim())) {
      button.click()
      return true
    }
  }
  return false
}

// A leftover script from a previous build can still be running here; if anything
// slips past the guards, shut down instead of throwing on every DOM mutation.
window.addEventListener('error', (event) => {
  if (String(event.message).includes('Extension context invalidated')) teardown()
})

function start() {
  if (!connected()) return
  chrome.storage.local
    .get(STORAGE_KEY)
    .then((stored) => {
      for (const item of stored[STORAGE_KEY] ?? []) collected.set(item.id, item)
      scan()
      observer = new MutationObserver(scheduleScan)
      observer.observe(document.body, { childList: true, subtree: true })
      // A reloaded timeline is usually still empty at document_idle.
      setTimeout(pull, 5_000)
      pullTimer = setInterval(pull, PULL_MS)
      // Background tabs throttle short intervals; a 2-minute reload still runs.
      refreshTimer = setTimeout(() => {
        if (!connected()) return teardown()
        chrome.storage.local
          .get(AUTO_KEY)
          .then((stored) => {
            if (stored[AUTO_KEY] === false) return
            // Ship what is on screen first: the reload throws this page away.
            showQueuedPosts()
            scan()
            save().then(exportTick).catch(teardown)
            setTimeout(() => {
              if (connected()) location.reload()
            }, PRE_RELOAD_MS)
          })
          .catch(teardown)
      }, REFRESH_MS - PRE_RELOAD_MS)
    })
    .catch(teardown)

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!connected()) {
      teardown()
      return false
    }
    if (message.type === 'scan-now') {
      showQueuedPosts()
      scan()
      sendResponse({ count: collected.size })
    }
    if (message.type === 'clear') {
      collected.clear()
      chrome.storage.local.set({ [STORAGE_KEY]: [] })
      sendResponse({ count: 0 })
    }
    return true
  })
}

try {
  start()
} catch {
  teardown()
}
