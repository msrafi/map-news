const STORAGE_KEY = 'mapNewsItems'
const EXPORTED_KEY = 'mapNewsExported'
const AUTO_KEY = 'mapNewsAuto'
const LAST_EXPORT_KEY = 'mapNewsLastExport'
const EXPORT_ALARM = 'map-news-export'
const REFRESH_ALARM = 'map-news-refresh'
const CYCLE_MINUTES = 2

async function startAlarms() {
  // Recreate so an update actually changes the period; leftover 1-minute alarms would stick.
  await chrome.alarms.clear(EXPORT_ALARM)
  await chrome.alarms.clear(REFRESH_ALARM)
  chrome.alarms.create(EXPORT_ALARM, { delayInMinutes: CYCLE_MINUTES, periodInMinutes: CYCLE_MINUTES })
  chrome.alarms.create(REFRESH_ALARM, { delayInMinutes: CYCLE_MINUTES, periodInMinutes: CYCLE_MINUTES })
}

startAlarms()
chrome.runtime.onInstalled.addListener(() => {
  startAlarms()
  // Reloading the extension orphans content scripts in open tabs; refresh to re-inject.
  refreshTimelineTabs()
})
chrome.runtime.onStartup.addListener(startAlarms)

async function autoOn() {
  const { [AUTO_KEY]: auto } = await chrome.storage.local.get(AUTO_KEY)
  return auto !== false
}

async function refreshTimelineTabs() {
  for (const tab of await timelineTabs()) {
    if (tab.id) chrome.tabs.reload(tab.id)
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!(await autoOn())) return
  if (alarm.name === EXPORT_ALARM) {
    await scanOpenTabs()
    await exportIfIdle()
    return
  }
  if (alarm.name === REFRESH_ALARM) await refreshTimelineTabs()
})

function timelineTabs() {
  return chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] })
}

let exporting = false

async function exportIfIdle() {
  if (exporting) return 0
  exporting = true
  try {
    return await exportNewItems()
  } finally {
    exporting = false
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'export-now') {
    scanOpenTabs()
      .then(exportIfIdle)
      .then((count) => sendResponse({ count }))
    return true
  }
  if (message.type === 'export-tick') {
    chrome.storage.local
      .get(AUTO_KEY)
      .then(async (stored) => {
        if (stored[AUTO_KEY] === false) return 0
        return exportIfIdle()
      })
      .then((count) => sendResponse({ count }))
      .catch(() => sendResponse({ count: 0 }))
    return true
  }
  if (message.type === 'auto-changed') {
    if (message.on) {
      startAlarms().then(() => refreshTimelineTabs())
    } else {
      chrome.alarms.clear(EXPORT_ALARM)
      chrome.alarms.clear(REFRESH_ALARM)
    }
    sendResponse({ ok: true })
    return true
  }
  return false
})

async function scanOpenTabs() {
  const tabs = await timelineTabs()
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id) return
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'scan-now' })
      } catch {
        // Tab has no content script (still loading, or a page we don't match).
      }
    }),
  )
  // Give the content script a moment to persist what it just found.
  await new Promise((resolve) => setTimeout(resolve, 600))
}

/** What has been shipped for a post, so a later change can be spotted. */
function signatureOf(item) {
  return item.media?.length ? `m${item.media.length}` : ''
}

function readExported(raw) {
  // Older builds stored a plain list of ids, with no signature.
  if (Array.isArray(raw)) return new Map(raw.map((id) => [id, '']))
  return new Map(Object.entries(raw ?? {}))
}

async function exportNewItems() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, EXPORTED_KEY])
  const items = stored[STORAGE_KEY] ?? []
  const exported = readExported(stored[EXPORTED_KEY])
  // X loads photos after the text, so a post already sent is sent again once it
  // gains pictures. Without this the first, picture-less copy would be final.
  const fresh = items.filter((item) => exported.get(item.id) !== signatureOf(item))
  if (fresh.length === 0) return 0

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await chrome.downloads.download({
    url: `data:application/json;base64,${toBase64(JSON.stringify(fresh, null, 2))}`,
    filename: `map-news/news-${stamp}.json`,
    conflictAction: 'uniquify',
    saveAs: false,
  })

  for (const item of fresh) exported.set(item.id, signatureOf(item))
  await chrome.storage.local.set({
    [EXPORTED_KEY]: Object.fromEntries([...exported].slice(-5000)),
    [LAST_EXPORT_KEY]: new Date().toISOString(),
  })
  return fresh.length
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
