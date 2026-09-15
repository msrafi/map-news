import { useEffect, useMemo, useState } from 'react'
import { MarketDrawer } from './components/MarketDrawer'
import { NewsPanel } from './components/NewsPanel'
import { OptionsDrawer } from './components/OptionsDrawer'
import { StoryTooltip, type StoryTip } from './components/StoryTooltip'
import { TickerColumn, type SymbolTile } from './components/TickerColumn'
import { TopBar } from './components/TopBar'
import { WorldMap } from './components/WorldMap'
import { useSavedSymbols } from './hooks/useSavedSymbols'
import { useSeenNews } from './hooks/useSeenNews'
import { findMarketStories, storiesForTicker, tickersOf } from './lib/market'
import { buildLinks, filterByTime, groupByRegion, linkColor, loadNews } from './lib/news'
import { readMapStyle, writeMapStyle } from './lib/mapStyles'
import { findOptionStories, groupByTicker } from './lib/options'
import type { MapStyleId, MarketStory, NewsItem, TimeFilter } from './types'

/** Symbols with a tweet in range lead, newest first; quiet ones keep their saved order. */
function sortTiles(tiles: SymbolTile[]): SymbolTile[] {
  return [...tiles].sort((a, b) => {
    if (a.latestAt && b.latestAt) return b.latestAt.localeCompare(a.latestAt)
    if (a.latestAt) return -1
    if (b.latestAt) return 1
    return 0
  })
}

export default function App() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TimeFilter>('today')
  const [mapStyle, setMapStyle] = useState<MapStyleId>(() => readMapStyle())
  // Routes and location pointers belong to map clicks; the market drawer just opens the region.
  const [selection, setSelection] = useState<{ regionId: string; withRoutes: boolean } | null>(null)
  // The stock drawer covers the map, so it stays shut until it is asked for.
  const [marketOpen, setMarketOpen] = useState(false)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [focusedStoryId, setFocusedStoryId] = useState<string | null>(null)
  // Set only by the feed: the map frames this story and marks its point.
  const [pinnedStoryId, setPinnedStoryId] = useState<string | null>(null)
  const [tip, setTip] = useState<StoryTip | null>(null)
  const selectedId = selection?.regionId ?? null
  const withRoutes = selection?.withRoutes ?? false
  const { seenIds, markSeen } = useSeenNews()
  const { saved, remember } = useSavedSymbols()
  const [, setNow] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    function refresh(force = false) {
      // Overlapping fetches would fight over the cache validators.
      if (inFlight) return
      inFlight = true
      loadNews(force)
        .then((news) => {
          // null means the feed has not changed since the last fetch.
          if (!cancelled && news) setItems(news)
          if (!cancelled) setError(null)
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load news')
        })
        .finally(() => {
          inFlight = false
        })
    }

    refresh(true)
    const timer = window.setInterval(refresh, 5_000)

    // A backgrounded tab throttles timers, so catch up the moment it is looked at again.
    function onWake() {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [])

  const visibleItems = useMemo(() => filterByTime(items, filter), [filter, items])
  const marketStories = useMemo(() => findMarketStories(visibleItems), [visibleItems])
  const optionStories = useMemo(() => findOptionStories(visibleItems), [visibleItems])
  const tickerGroups = useMemo(() => groupByTicker(optionStories), [optionStories])
  const allOptionStories = useMemo(() => findOptionStories(items), [items])
  const allMarketStories = useMemo(() => findMarketStories(items), [items])
  const allTickerGroups = useMemo(() => groupByTicker(allOptionStories), [allOptionStories])

  useEffect(() => {
    remember(
      allTickerGroups.map((group) => group.ticker),
      allMarketStories.flatMap((story) => tickersOf(story)),
    )
  }, [allMarketStories, allTickerGroups, remember])
  // Stock and option posts belong in the left column and drawers, not on the map.
  const mapItems = useMemo(() => {
    const skip = new Set([
      ...marketStories.map((story) => story.item.id),
      ...optionStories.map((story) => story.item.id),
    ])
    return visibleItems.filter((item) => !skip.has(item.id))
  }, [marketStories, optionStories, visibleItems])
  const regions = useMemo(() => groupByRegion(mapItems), [mapItems])

  const unseenByRegion = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const region of regions) {
      counts[region.regionId] = region.items.filter((item) => !seenIds.has(item.id)).length
    }
    return counts
  }, [regions, seenIds])

  const liveCount = Object.values(unseenByRegion).reduce((sum, count) => sum + count, 0)
  const lastUpdatedAt = visibleItems.reduce<string | null>((latest, item) => {
    if (!latest || item.publishedAt > latest) return item.publishedAt
    return latest
  }, null)
  const allLinks = useMemo(() => buildLinks(mapItems, null), [mapItems])
  const selected = regions.find((region) => region.regionId === selectedId) ?? null
  const regionLinks = useMemo(
    () =>
      selectedId ? allLinks.filter((link) => link.regions.some((region) => region.id === selectedId)) : [],
    [allLinks, selectedId],
  )
  // Colour by position in the region's own list so the map line and its card agree.
  const linkColors = useMemo(() => {
    const colors = new Map<string, string>()
    regionLinks.forEach((link, index) => colors.set(link.id, linkColor(index)))
    return colors
  }, [regionLinks])
  const links = withRoutes ? regionLinks : []
  const spots = useMemo(
    () =>
      selected && withRoutes
        ? selected.items.flatMap((item) =>
            (item.spots ?? []).map((spot, index) => ({
              id: `${item.id}-${index}`,
              itemId: item.id,
              text: item.text,
              publishedAt: item.publishedAt,
              spot,
            })),
          )
        : [],
    [selected, withRoutes],
  )
  // The panel is always on screen: a pin narrows it, otherwise it shows the whole feed.
  const panelItems = useMemo(
    () =>
      selected
        ? selected.items
        : [...mapItems].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [mapItems, selected],
  )
  // A story points at its own dateline when it has one, otherwise at the region pin.
  const pinnedStory = useMemo(() => {
    if (!pinnedStoryId || !selected) return null
    const item = selected.items.find((entry) => entry.id === pinnedStoryId)
    if (!item) return null
    const spot = item.spots?.[0]
    return {
      id: item.id,
      text: item.text,
      label: spot?.label ?? selected.region,
      publishedAt: item.publishedAt,
      lng: spot?.lng ?? selected.lng,
      lat: spot?.lat ?? selected.lat,
    }
  }, [pinnedStoryId, selected])
  // Saved tiles stay on screen after the time filter drops their last tweet, newest first.
  const optionTiles = useMemo(() => {
    const byTicker = new Map(tickerGroups.map((group) => [group.ticker, group]))
    return sortTiles(
      saved.options.map((ticker) => {
        const group = byTicker.get(ticker)
        const facts: string[] = []
        if (group?.calls) facts.push(`${group.calls}C`)
        if (group?.puts) facts.push(`${group.puts}P`)
        return {
          ticker,
          latestAt: group?.latestAt,
          posts: new Set(group?.trades.map((trade) => trade.item.id) ?? []).size,
          facts,
          latestText: group?.trades[0]?.item.text,
        }
      }),
    )
  }, [saved.options, tickerGroups])
  const stockTiles = useMemo(() => {
    const byTicker = new Map<string, MarketStory[]>()
    for (const story of marketStories) {
      for (const ticker of tickersOf(story)) {
        const list = byTicker.get(ticker)
        if (list) list.push(story)
        else byTicker.set(ticker, [story])
      }
    }
    return sortTiles(
      saved.stocks.map((ticker) => {
        const stories = byTicker.get(ticker) ?? []
        const latest = stories[0]
        const detail = latest?.details.find((entry) => entry.label.toUpperCase() === ticker)
        const facts: string[] = []
        if (detail?.value) facts.push(detail.value)
        if (detail?.changePct !== undefined) {
          facts.push(`${detail.changePct > 0 ? '+' : ''}${detail.changePct}%`)
        }
        return {
          ticker,
          latestAt: latest?.item.publishedAt,
          posts: stories.length,
          facts,
          latestText: latest?.item.text,
        }
      }),
    )
  }, [marketStories, saved.stocks])
  // A refresh can retire the open ticker, so resolve it against everything we have stored.
  const openTicker = useMemo(() => {
    if (!selectedTicker) return null
    return (
      allTickerGroups.find((group) => group.ticker === selectedTicker) ?? {
        ticker: selectedTicker,
        trades: [],
        latestAt: '',
        calls: 0,
        puts: 0,
      }
    )
  }, [allTickerGroups, selectedTicker])
  const stockStories = useMemo(
    () => (selectedStock ? storiesForTicker(allMarketStories, selectedStock) : marketStories),
    [allMarketStories, marketStories, selectedStock],
  )
  const selectedSymbol = selectedTicker
    ? ({ kind: 'option' as const, ticker: selectedTicker })
    : selectedStock
      ? ({ kind: 'stock' as const, ticker: selectedStock })
      : null
  const linkedRegionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const link of allLinks) {
      for (const region of link.regions) ids.add(region.id)
    }
    return ids
  }, [allLinks])

  useEffect(() => {
    if (!selected) return
    markSeen(selected.items.map((item) => item.id))
  }, [markSeen, selected])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setFocusedStoryId(null)
      setPinnedStoryId(null)
      setSelection(null)
      setTip(null)
      setSelectedTicker(null)
      setSelectedStock(null)
      setMarketOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <TopBar
        filter={filter}
        onFilterChange={(next) => {
          setFilter(next)
          setSelection(null)
          setPinnedStoryId(null)
        }}
        liveCount={liveCount}
        regionCount={regions.length}
        linkCount={allLinks.length}
        lastUpdatedAt={lastUpdatedAt}
        mapStyle={mapStyle}
        onMapStyleChange={(next) => {
          setMapStyle(next)
          writeMapStyle(next)
        }}
      />
      <main className="stage">
        <TickerColumn
          options={optionTiles}
          stocks={stockTiles}
          selected={selectedSymbol}
          onSelect={(next) => {
            setTip(null)
            if (!next) {
              setSelectedTicker(null)
              setSelectedStock(null)
              setMarketOpen(false)
              return
            }
            if (next.kind === 'option') {
              setSelectedTicker(next.ticker)
              setSelectedStock(null)
              setMarketOpen(false)
              return
            }
            setSelectedStock(next.ticker)
            setSelectedTicker(null)
            setMarketOpen(true)
          }}
        />
        <section className="map-area">
          {error ? <p className="banner">{error}</p> : null}
          <div className="map-drawers">
            {openTicker ? (
              <OptionsDrawer group={openTicker} onClose={() => setSelectedTicker(null)} />
            ) : null}
            <MarketDrawer
              stories={stockStories}
              ticker={selectedStock}
              open={marketOpen}
              onToggle={() => {
                setMarketOpen((value) => !value)
                if (marketOpen) setSelectedStock(null)
              }}
              onOpenStory={(story, anchor) =>
                setTip({ item: story.item, details: story.details, contracts: [], anchor })
              }
              activeId={tip?.item.id ?? null}
            />
          </div>
          <WorldMap
            regions={regions}
            links={links}
            linkColors={linkColors}
            spots={spots}
            selectedId={selectedId}
            unseenByRegion={unseenByRegion}
            linkedRegionIds={linkedRegionIds}
            pinnedStory={pinnedStory}
            mapStyle={mapStyle}
            onSelect={(regionId) => {
              setFocusedStoryId(null)
              setPinnedStoryId(null)
              setSelection({ regionId, withRoutes: true })
            }}
            onFocusStory={(itemId) => {
              setFocusedStoryId(itemId)
              setPinnedStoryId(null)
            }}
            onClearPinned={() => setPinnedStoryId(null)}
          />
        </section>
        <NewsPanel
          title={selected ? selected.region : 'Latest news'}
          kicker={selected ? selected.country : `${regions.length} regions`}
          items={panelItems}
          seenIds={seenIds}
          linkColors={linkColors}
          focusedStoryId={focusedStoryId}
          onSelectStory={(itemId) => {
            // Opening the story's region is what draws its route and dateline on the map.
            const region = regions.find((entry) =>
              entry.items.some((item) => item.id === itemId),
            )
            if (!region) return
            setSelection({ regionId: region.regionId, withRoutes: true })
            setFocusedStoryId(itemId)
            setPinnedStoryId(itemId)
          }}
          onClearRegion={
            selected
              ? () => {
                  setSelection(null)
                  setPinnedStoryId(null)
                }
              : undefined
          }
        />
        {tip ? <StoryTooltip tip={tip} onClose={() => setTip(null)} /> : null}
      </main>
    </div>
  )
}
