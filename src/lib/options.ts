import type { NewsItem, OptionContract, OptionStory, TickerGroup, TickerTrade } from '../types'

const CORE_RE = /\$([A-Z]{1,6})\s+(\d+(?:\.\d+)?)\s*(C|P|CALLS?|PUTS?)\b/gi
const DATE_RE = /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?=\s|exp\b|$)/i
const MONTH_RE =
  /\b(?:for\s+)?(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i
const PREMIUM_RE = /@\s*\$?(\d*\.?\d+)/
const CONTRACTS_RE = /\b([\d,]+)\s*contracts?\b/i
const NOTIONAL_RE = /\$(\d+(?:\.\d+)?)\s*([KMB])\b/i

function normalize(text: string): string {
  return text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
}

function sideOf(raw: string): OptionContract['side'] {
  return raw.toUpperCase().startsWith('C') ? 'call' : 'put'
}

export function parseOptionContracts(rawText: string): OptionContract[] {
  const text = normalize(rawText)
  const contracts: OptionContract[] = []
  const matches = [...text.matchAll(CORE_RE)]

  matches.forEach((match, index) => {
    const start = match.index ?? 0
    const end = start + match[0].length
    const previousEnd =
      index > 0 ? (matches[index - 1].index ?? 0) + matches[index - 1][0].length : 0
    const nextStart = matches[index + 1]?.index ?? text.length
    const prefix = text.slice(Math.max(previousEnd, start - 16), start)
    const suffix = text.slice(end, nextStart)

    const leadingExpiry = prefix.match(new RegExp(`${DATE_RE.source}\\s*$`))?.[1]
    const trailingExpiry = suffix.match(DATE_RE)?.[1]
    const monthExpiry = suffix.match(MONTH_RE)?.[1]
    const premium = suffix.match(PREMIUM_RE)?.[1]
    const quantity = suffix.match(CONTRACTS_RE)?.[1]
    const notional = suffix.match(NOTIONAL_RE)

    contracts.push({
      ticker: match[1].toUpperCase(),
      strike: Number.parseFloat(match[2]),
      side: sideOf(match[3]),
      expiry: leadingExpiry ?? trailingExpiry ?? monthExpiry,
      premium: premium ? `$${premium.startsWith('.') ? `0${premium}` : premium}` : undefined,
      contracts: quantity ? Number.parseInt(quantity.replaceAll(',', ''), 10) : undefined,
      notional: notional ? `$${notional[1]}${notional[2].toUpperCase()}` : undefined,
    })
  })

  return contracts
}

export function findOptionStories(items: NewsItem[]): OptionStory[] {
  return items
    .map((item) => ({ item, contracts: parseOptionContracts(item.text) }))
    .filter((story) => story.contracts.length > 0)
    .sort((a, b) => b.item.publishedAt.localeCompare(a.item.publishedAt))
}

/**
 * One post can name several tickers, so trades are regrouped under the ticker they
 * belong to. Both the groups and the trades inside them run newest first.
 */
export function groupByTicker(stories: OptionStory[]): TickerGroup[] {
  const groups = new Map<string, TickerTrade[]>()

  for (const story of stories) {
    for (const contract of story.contracts) {
      const trades = groups.get(contract.ticker)
      if (trades) trades.push({ item: story.item, contract })
      else groups.set(contract.ticker, [{ item: story.item, contract }])
    }
  }

  return [...groups]
    .map(([ticker, trades]) => {
      trades.sort((a, b) => b.item.publishedAt.localeCompare(a.item.publishedAt))
      return {
        ticker,
        trades,
        latestAt: trades[0].item.publishedAt,
        calls: trades.filter((trade) => trade.contract.side === 'call').length,
        puts: trades.filter((trade) => trade.contract.side === 'put').length,
      }
    })
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
}
