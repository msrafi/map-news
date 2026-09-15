/** An exact place a headline points at, resolved during merge. */
export type NewsSpot = {
  /** `dateline` is an offset epicentre; `place` is a named town or district. */
  kind: 'dateline' | 'place'
  label: string
  lat: number
  lng: number
}

export type NewsItem = {
  id: string
  regionId: string
  region: string
  city: string
  country: string
  lat: number
  lng: number
  author: string
  handle: string
  text: string
  publishedAt: string
  sourceUrl: string
  spots?: NewsSpot[]
}

export type RegionRef = {
  id: string
  region: string
  city: string
  country: string
  lat: number
  lng: number
}

export type LocationHit = {
  start: number
  end: number
  label: string
  ref: RegionRef
}

/** A story that names several places, so it can be drawn as a route on the map. */
export type NewsLink = {
  id: string
  regions: RegionRef[]
  publishedAt: string
  text: string
}

/** One parsed figure from a market headline: a quote, a move, or an economic print. */
export type MarketDetail = {
  label: string
  value?: string
  previous?: string
  changePct?: number
  /** Position in the headline, used to keep several instruments in reading order. */
  at?: number
}

export type MarketStory = {
  item: NewsItem
  details: MarketDetail[]
}

export type OptionContract = {
  ticker: string
  strike: number
  side: 'call' | 'put'
  expiry?: string
  premium?: string
  contracts?: number
  notional?: string
}

export type OptionStory = {
  item: NewsItem
  contracts: OptionContract[]
}

/** A single contract paired with the post it came from. */
export type TickerTrade = {
  item: NewsItem
  contract: OptionContract
}

export type TickerGroup = {
  ticker: string
  trades: TickerTrade[]
  latestAt: string
  calls: number
  puts: number
}

export type RegionPin = {
  regionId: string
  region: string
  city: string
  country: string
  lat: number
  lng: number
  items: NewsItem[]
  latestAt: string
}

export type TimeFilter = 'all' | 'live' | 'today' | 'week'
