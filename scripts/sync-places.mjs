// Regenerates extension/places.js from the canonical table in src/data/places.json.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const PROJECT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE = path.join(PROJECT, 'src', 'data', 'places.json')
const TARGET = path.join(PROJECT, 'extension', 'places.js')

const places = JSON.parse(await readFile(SOURCE, 'utf8'))
const body = places.map((place) => `  ${JSON.stringify(place)},`).join('\n')

await writeFile(
  TARGET,
  [
    '// Generated from src/data/places.json by `npm run sync:places`. Do not edit by hand.',
    '// Keyword table used to put a headline somewhere on the map.',
    'self.MAP_NEWS_PLACES = [',
    body,
    ']',
    '',
  ].join('\n'),
)

console.log(`synced ${places.length} places into extension/places.js`)
