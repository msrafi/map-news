const STORAGE_KEY = 'mapNewsItems'
const PLACES = self.MAP_NEWS_PLACES

const collected = new Map()
let saveTimer = null
let scanTimer = null

const MATCHERS = PLACES.flatMap((place) =>
  place.keys.map((key) => {
    const word = key.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return { place, weight: word.length, pattern: new RegExp(`\\b${word}\\b`, 'i') }
  }),
)

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
  const place = findPlace(text)
  if (!place) return null

  const nameEl = article.querySelector('[data-testid="User-Name"]')
  const author = nameEl ? nameEl.innerText.split('\n')[0].trim() : statusMatch[1]

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
  }
}

function save() {
  const items = [...collected.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  chrome.storage.local.set({ [STORAGE_KEY]: items })
}

function scan() {
  let added = 0
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const item = parseArticle(article)
    if (item && !collected.has(item.id)) {
      collected.set(item.id, item)
      added += 1
    }
  }
  if (added === 0) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 500)
}

function scheduleScan() {
  clearTimeout(scanTimer)
  scanTimer = setTimeout(scan, 300)
}

chrome.storage.local.get(STORAGE_KEY).then((stored) => {
  for (const item of stored[STORAGE_KEY] ?? []) collected.set(item.id, item)
  scan()
  new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'scan-now') {
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
