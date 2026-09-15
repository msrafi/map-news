import { useEffect, useMemo, useState } from 'react'
import { MarketDrawer } from './components/MarketDrawer'
import { NewsPanel } from './components/NewsPanel'
import { OptionsDrawer } from './components/OptionsDrawer'
import { StoryTooltip, type StoryTip } from './components/StoryTooltip'
import { TickerColumn } from './components/TickerColumn'
import { TopBar } from './components/TopBar'
import { WorldMap } from './components/WorldMap'
import { useSeenNews } from './hooks/useSeenNews'
import { findMarketStories } from './lib/market'
import { buildLinks, filterByTime, groupByRegion, linkColor, loadNews } from './lib/news'
import { findOptionStories, groupByTicker } from './lib/options'
import type { NewsItem, TimeFilter } from './types'

export default function App() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TimeFilter>('today')
  // Routes and location pointers belong to map clicks; the market drawer just opens the region.
  const [selection, setSelection] = useState<{ regionId: string; withRoutes: boolean } | null>(null)
  // The stock drawer covers the map, so it stays shut until it is asked for.
  const [marketOpen, setMarketOpen] = useState(false)
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null)
  const [focusedStoryId, setFocusedStoryId] = useState<string | null>(null)
  const [tip, setTip] = useState<StoryTip | null>(null)
  const selectedId = selection?.regionId ?? null
  const withRoutes = selection?.withRoutes ?? false
  const { seenIds, markSeen } = useSeenNews()
  const [, setNow] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    function refresh() {
      loadNews()
        .then((news) => {
          if (!cancelled) setItems(news)
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load news')
        })
    }

    refresh()
    const timer = window.setInterval(refresh, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const visibleItems = useMemo(() => filterByTime(items, filter), [filter, items])
  const regions = useMemo(() => groupByRegion(visibleItems), [visibleItems])

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
  const allLinks = useMemo(() => buildLinks(visibleItems, null), [visibleItems])
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
              spot,
            })),
          )
        : [],
    [selected, withRoutes],
  )
  const marketStories = useMemo(() => findMarketStories(visibleItems), [visibleItems])
  const tickerGroups = useMemo(
    () => groupByTicker(findOptionStories(visibleItems)),
    [visibleItems],
  )
  // A refresh can retire the open ticker, so resolve it against the current groups.
  const openTicker = tickerGroups.find((group) => group.ticker === selectedTicker) ?? null
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
      setSelection(null)
      setTip(null)
      setSelectedTicker(null)
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
        }}
        liveCount={liveCount}
        regionCount={regions.length}
        linkCount={allLinks.length}
        lastUpdatedAt={lastUpdatedAt}
      />
      <main className="stage">
        <TickerColumn
          groups={tickerGroups}
          selected={selectedTicker}
          onSelect={(ticker) => {
            setSelectedTicker(ticker)
            setTip(null)
          }}
        />
        <section className="map-area">
          {error ? <p className="banner">{error}</p> : null}
          <div className="map-drawers">
            {openTicker ? (
              <OptionsDrawer group={openTicker} onClose={() => setSelectedTicker(null)} />
            ) : null}
            <MarketDrawer
              stories={marketStories}
              open={marketOpen}
              onToggle={() => setMarketOpen((value) => !value)}
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
            onSelect={(regionId) => {
              setFocusedStoryId(null)
              setSelection({ regionId, withRoutes: true })
            }}
            onFocusStory={setFocusedStoryId}
          />
          {selected ? (
            <NewsPanel
              region={selected}
              seenIds={seenIds}
              linkColors={linkColors}
              focusedStoryId={focusedStoryId}
              onClose={() => setSelection(null)}
            />
          ) : null}
        </section>
        {tip ? <StoryTooltip tip={tip} onClose={() => setTip(null)} /> : null}
      </main>
    </div>
  )
}
