// Merges news JSON exported by the Chrome extension into public/news.json.
// Usage: node scripts/merge-downloads.mjs [--watch] [--reset]
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { addSpots } from './spots.mjs'

const PROJECT = fileURLToPath(new URL('..', import.meta.url))
const TARGET = path.join(PROJECT, 'public', 'news.json')
const DOWNLOADS = path.join(homedir(), 'Downloads')
const INBOX = path.join(DOWNLOADS, 'map-news')
const ARCHIVE = path.join(INBOX, 'merged')
const MAX_ITEMS = 500
const POLL_MS = 2_000

const watch = process.argv.includes('--watch')
const reset = process.argv.includes('--reset')

function isNewsItem(value) {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.regionId === 'string' &&
    typeof value.publishedAt === 'string' &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng)
  )
}

async function readJsonArray(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter(isNewsItem) : []
  } catch {
    return []
  }
}

async function findDrops() {
  const drops = []

  try {
    for (const entry of await readdir(INBOX, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json')) drops.push(path.join(INBOX, entry.name))
    }
  } catch {
    // Inbox does not exist until the extension downloads something.
  }

  try {
    for (const entry of await readdir(DOWNLOADS, { withFileTypes: true })) {
      if (entry.isFile() && /^news.*\.json$/.test(entry.name)) drops.push(path.join(DOWNLOADS, entry.name))
    }
  } catch {
    // No Downloads folder.
  }

  return drops.sort()
}

async function mergeOnce() {
  const drops = await findDrops()
  if (drops.length === 0) return { added: 0, files: 0, total: null }

  const merged = new Map()
  if (!reset) {
    for (const item of await readJsonArray(TARGET)) merged.set(item.id, item)
  }
  const before = merged.size

  for (const drop of drops) {
    for (const item of await readJsonArray(drop)) merged.set(item.id, item)
  }

  const items = [...merged.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, MAX_ITEMS)

  const spots = await addSpots(items)
  await writeFile(TARGET, `${JSON.stringify(items, null, 2)}\n`)

  await mkdir(ARCHIVE, { recursive: true })
  for (const drop of drops) {
    await rename(drop, path.join(ARCHIVE, path.basename(drop))).catch(() => {})
  }

  return { added: merged.size - before, files: drops.length, total: items.length, spots }
}

async function run() {
  const { added, files, total, spots } = await mergeOnce()
  if (files === 0) return
  const stamp = new Date().toLocaleTimeString()
  const located = spots > 0 ? `, ${spots} precise location(s)` : ''
  console.log(
    `[${stamp}] merged ${files} file(s), ${added} new post(s)${located}, ${total} total in public/news.json`,
  )
}

await run()

if (watch) {
  console.log(`Watching ${INBOX} and ${DOWNLOADS} every ${POLL_MS / 1000}s. Ctrl+C to stop.`)
  // Geocoding can outlast one tick; overlapping runs would fight over the same files.
  let running = false
  setInterval(() => {
    if (running) return
    running = true
    run()
      .catch((error) => console.error('merge failed:', error.message))
      .finally(() => {
        running = false
      })
  }, POLL_MS)
}
