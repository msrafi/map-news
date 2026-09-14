import type { MarketDetail, MarketStory, NewsItem } from '../types'

/** US equity indices and common US ticker aliases in First Squawk copy. */
const US_INSTRUMENTS = [
  'dow jones',
  'dow',
  'nasdaq 100',
  'nasdaq',
  's&p 500',
  's&p',
  'russell 2000',
  'russell',
  'nyse',
  'wilshire',
]

const US_QUOTE_LABELS = new Set([
  'DOW',
  'DJIA',
  'NASDAQ',
  'NDX',
  'SPX',
  'SP500',
  'SPY',
  'QQQ',
  'IWM',
  'RUT',
  'NYSE',
  'US500',
  'US30',
  'US100',
])

const FOREIGN_LISTING_RE = /\b(hong kong|london|tokyo|frankfurt|shanghai|mumbai|toronto|sydney)\b/i

const UP_WORDS = ['jump', 'jumps', 'rise', 'rises', 'rose', 'gain', 'gains', 'surge', 'surges', 'climb', 'climbs', 'rally', 'rallies', 'soar', 'soars', 'advance', 'advances', 'higher']
const DOWN_WORDS = ['fall', 'falls', 'fell', 'drop', 'drops', 'plunge', 'plunges', 'slide', 'slides', 'slump', 'slumps', 'sink', 'sinks', 'tumble', 'tumbles', 'decline', 'declines', 'lower', 'lose', 'loses', 'loss', 'losses', 'off']

const wordRe = (word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')

const INSTRUMENT_RES = US_INSTRUMENTS.map((name) => ({ name, pattern: wordRe(name) }))

const QUOTE_RE = /#?\b([A-Z][A-Z0-9&.-]{1,12})\s+([\d,]+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*%/g
const PERCENT_RE = /([-+]?\d+(?:\.\d+)?)\s*%/
const COMPANY_RE = /\b([A-Z][\w.&'-]*(?:[ -][A-Z][\w.&'-]*){0,2})\s+(?:shares?|shs)\b/
const US_STOCK_PHRASE_RE =
  /\b(u\.?s\.?\s+stock(?:s| futures)?|nyse|nasdaq|dow(?:\s+jones)?|s&p 500|russell 2000|wall street(?!\s+journal))\b/i

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length > 3 ? word[0].toUpperCase() + word.slice(1) : word.toUpperCase()))
    .join(' ')
}

function directionSign(text: string): number {
  const lower = text.toLowerCase()
  const up = UP_WORDS.find((word) => wordRe(word).test(lower))
  const down = DOWN_WORDS.find((word) => wordRe(word).test(lower))
  if (up && !down) return 1
  if (down && !up) return -1
  if (up && down) return lower.indexOf(up) < lower.indexOf(down) ? 1 : -1
  return 0
}

function signedPercent(raw: string, context: string): number {
  const magnitude = Number.parseFloat(raw)
  if (raw.startsWith('-') || raw.startsWith('+')) return magnitude
  const sign = directionSign(context)
  return sign === 0 ? magnitude : Math.abs(magnitude) * sign
}

function labelFor(matched: string): string {
  return matched === matched.toLowerCase() ? titleCase(matched) : matched
}

function readUsQuotes(text: string): MarketDetail[] {
  const details: MarketDetail[] = []
  QUOTE_RE.lastIndex = 0
  let found = QUOTE_RE.exec(text)
  while (found) {
    if (US_QUOTE_LABELS.has(found[1].toUpperCase())) {
      details.push({
        label: found[1],
        value: found[2],
        changePct: Number.parseFloat(found[3]),
        at: found.index,
      })
    }
    found = QUOTE_RE.exec(text)
  }
  return details
}

function readUsMoves(text: string): MarketDetail[] {
  const spans: { start: number; end: number; matched: string }[] = []

  for (const entry of INSTRUMENT_RES) {
    const pattern = new RegExp(entry.pattern.source, 'gi')
    let found = pattern.exec(text)
    while (found) {
      spans.push({ start: found.index, end: found.index + found[0].length, matched: found[0] })
      found = pattern.exec(text)
    }
  }

  spans.sort((a, b) => b.end - b.start - (a.end - a.start))

  const claimed: { start: number; end: number }[] = []
  const moves: MarketDetail[] = []
  const seen = new Set<string>()

  for (const span of spans) {
    if (claimed.some((range) => span.start < range.end && span.end > range.start)) continue
    const window = text.slice(span.start, span.start + 60)
    const percent = PERCENT_RE.exec(window)
    if (!percent) continue

    const label = labelFor(span.matched)
    if (seen.has(label.toUpperCase())) continue
    seen.add(label.toUpperCase())
    claimed.push({ start: span.start, end: span.end })
    moves.push({ label, changePct: signedPercent(percent[1], window), at: span.start })
  }

  if (moves.length === 0) {
    const company = COMPANY_RE.exec(text)
    const percent = company ? PERCENT_RE.exec(text) : null
    const listedAbroad = FOREIGN_LISTING_RE.test(text)
    if (company && percent && !listedAbroad) {
      moves.push({ label: company[1], changePct: signedPercent(percent[1], text), at: company.index })
    }
  }

  return moves.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).slice(0, 4)
}

/** US equity stories only: indices, futures, and US-listed share moves. */
export function findMarketStories(items: NewsItem[]): MarketStory[] {
  const stories: MarketStory[] = []

  for (const item of items) {
    const quotes = readUsQuotes(item.text)
    const moves = quotes.length > 0 ? [] : readUsMoves(item.text)
    const details = [...quotes, ...moves]
    const lead = item.text.slice(0, 90)
    const namesUsTape = US_STOCK_PHRASE_RE.test(lead)

    if (details.length === 0 && !namesUsTape) continue

    stories.push({ item, details })
  }

  return stories.sort((a, b) => b.item.publishedAt.localeCompare(a.item.publishedAt))
}
