import { useEffect, useMemo, useState } from 'react'
import { MarketDrawer } from './components/MarketDrawer'
import { NewsPanel } from './components/NewsPanel'
import { TopBar } from './components/TopBar'
import { WorldMap } from './components/WorldMap'
import { useSeenNews } from './hooks/useSeenNews'
import { findMarketStories } from './lib/market'
import { buildLinks, filterByTime, groupByRegion, loadNews } from './lib/news'
import type { NewsItem, TimeFilter } from './types'

export default function App() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TimeFilter>('all')
  // Routes and location pointers belong to map clicks; the market drawer just opens the region.
  const [selection, setSelection] = useState<{ regionId: string; withRoutes: boolean } | null>(null)
  const [marketOpen, setMarketOpen] = useState(true)
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
  const links = useMemo(
    () =>
      selectedId && withRoutes
        ? allLinks.filter((link) => link.regions.some((region) => region.id === selectedId))
        : [],
    [allLinks, selectedId, withRoutes],
  )
  const spots = useMemo(
    () =>
      selected && withRoutes
        ? selected.items.flatMap((item) => (item.spot ? [{ id: item.id, spot: item.spot }] : []))
        : [],
    [selected, withRoutes],
  )
  const marketStories = useMemo(() => findMarketStories(visibleItems), [visibleItems])
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
      if (event.key === 'Escape') setSelection(null)
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
        {error ? <p className="banner">{error}</p> : null}
        <WorldMap
          regions={regions}
          links={links}
          spots={spots}
          selectedId={selectedId}
          unseenByRegion={unseenByRegion}
          linkedRegionIds={linkedRegionIds}
          onSelect={(regionId) => setSelection({ regionId, withRoutes: true })}
        />
        <MarketDrawer
          stories={marketStories}
          open={marketOpen}
          onToggle={() => setMarketOpen((value) => !value)}
          onSelectRegion={(regionId) => setSelection({ regionId, withRoutes: false })}
        />
        {selected ? (
          <NewsPanel region={selected} seenIds={seenIds} onClose={() => setSelection(null)} />
        ) : null}
      </main>
    </div>
  )
}
