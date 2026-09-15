const STORAGE_KEY = 'mapNewsItems'
const EXPORTED_KEY = 'mapNewsExported'
const AUTO_KEY = 'mapNewsAuto'
const LAST_EXPORT_KEY = 'mapNewsLastExport'

const countEl = document.getElementById('count')
const regionsEl = document.getElementById('regions')
const autoEl = document.getElementById('auto')
const statusEl = document.getElementById('status')

async function render() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, EXPORTED_KEY, AUTO_KEY, LAST_EXPORT_KEY])
  const items = stored[STORAGE_KEY] ?? []
  const exported = new Set(stored[EXPORTED_KEY] ?? [])
  const pending = items.filter((item) => !exported.has(item.id)).length

  countEl.textContent = String(items.length)
  regionsEl.textContent = `posts in ${new Set(items.map((item) => item.regionId)).size} regions`
  autoEl.checked = stored[AUTO_KEY] !== false

  const last = stored[LAST_EXPORT_KEY]
  const version = chrome.runtime.getManifest().version
  statusEl.textContent = last
    ? `${pending} not exported yet · last export ${new Date(last).toLocaleTimeString()} · v${version}`
    : `${pending} not exported yet · v${version}`
}

autoEl.addEventListener('change', () => {
  chrome.storage.local.set({ [AUTO_KEY]: autoEl.checked })
})

document.getElementById('export').addEventListener('click', async () => {
  statusEl.textContent = 'Exporting…'
  await chrome.runtime.sendMessage({ type: 'export-now' })
  render()
})

document.getElementById('download').addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const items = stored[STORAGE_KEY] ?? []
  const blob = new Blob([`${JSON.stringify(items, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'news.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

document.getElementById('clear').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'clear' })
    } catch {
      // Not an X tab.
    }
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: [], [EXPORTED_KEY]: [] })
  render()
})

render()
