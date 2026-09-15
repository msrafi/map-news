const STORAGE_KEY = 'mapNewsItems'
const EXPORTED_KEY = 'mapNewsExported'
const AUTO_KEY = 'mapNewsAuto'
const LAST_EXPORT_KEY = 'mapNewsLastExport'
const EXPORT_ALARM = 'map-news-export'
const REFRESH_ALARM = 'map-news-refresh'

function startAlarms() {
  chrome.alarms.create(EXPORT_ALARM, { periodInMinutes: 1 })
  chrome.alarms.create(REFRESH_ALARM, { delayInMinutes: 2, periodInMinutes: 2 })
}

chrome.runtime.onInstalled.addListener(() => {
  startAlarms()
  // Reloading the extension orphans content scripts in open tabs; refresh to re-inject.
  refreshTimelineTabs()
})
chrome.runtime.onStartup.addListener(startAlarms)

async function refreshTimelineTabs() {
  for (const tab of await timelineTabs()) {
    if (tab.id) chrome.tabs.reload(tab.id)
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const { [AUTO_KEY]: auto } = await chrome.storage.local.get(AUTO_KEY)
  if (auto === false) return
  if (alarm.name === EXPORT_ALARM) {
    await scanOpenTabs()
    await exportNewItems()
    return
  }
  if (alarm.name === REFRESH_ALARM) await refreshTimelineTabs()
})

function timelineTabs() {
  return chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'export-now') {
    scanOpenTabs()
      .then(exportNewItems)
      .then((count) => sendResponse({ count }))
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

async function exportNewItems() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, EXPORTED_KEY])
  const items = stored[STORAGE_KEY] ?? []
  const exported = new Set(stored[EXPORTED_KEY] ?? [])
  const fresh = items.filter((item) => !exported.has(item.id))
  if (fresh.length === 0) return 0

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await chrome.downloads.download({
    url: `data:application/json;base64,${toBase64(JSON.stringify(fresh, null, 2))}`,
    filename: `map-news/news-${stamp}.json`,
    conflictAction: 'uniquify',
    saveAs: false,
  })

  for (const item of fresh) exported.add(item.id)
  await chrome.storage.local.set({
    [EXPORTED_KEY]: [...exported].slice(-5000),
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
