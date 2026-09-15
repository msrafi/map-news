// Regenerates the extension's lookup tables from the canonical JSON in src/data.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PROJECT = fileURLToPath(new URL('..', import.meta.url))
const PLACES_SOURCE = path.join(PROJECT, 'src', 'data', 'places.json')
const PLACES_TARGET = path.join(PROJECT, 'extension', 'places.js')
const COMPANIES_SOURCE = path.join(PROJECT, 'src', 'data', 'companies.json')
const COMPANIES_TARGET = path.join(PROJECT, 'extension', 'companies.js')

async function sync(source, target, global, note) {
  const rows = JSON.parse(await readFile(source, 'utf8'))
  const body = rows.map((row) => `  ${JSON.stringify(row)},`).join('\n')

  await writeFile(
    target,
    [
      `// Generated from ${path.relative(PROJECT, source)} by \`npm run sync:places\`. Do not edit by hand.`,
      `// ${note}`,
      `${global} = [`,
      body,
      ']',
      '',
    ].join('\n'),
  )

  return rows.length
}

const places = await sync(
  PLACES_SOURCE,
  PLACES_TARGET,
  'self.MAP_NEWS_PLACES',
  'Keyword table used to put a headline somewhere on the map.',
)
const tickers = await sync(
  COMPANIES_SOURCE,
  COMPANIES_TARGET,
  'self.MAP_NEWS_COMPANIES',
  'US companies whose headlines are kept even when no place is named.',
)

console.log(`synced ${places} places and ${tickers} companies into extension/`)
