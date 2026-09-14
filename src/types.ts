/** An exact place named in a headline, resolved during merge from a dateline. */
export type NewsSpot = {
  label: string
  lat: number
  lng: number
  anchorName: string
  anchorLat: number
  anchorLng: number
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
  spot?: NewsSpot
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
