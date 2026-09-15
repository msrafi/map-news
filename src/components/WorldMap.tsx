import { LngLatBounds } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import { LINK_COLORS, linkCoordinates, pathCoordinates } from '../lib/news'
import { formatUpdated, freshnessOf, latestItem, shortAge } from '../lib/time'
import type { NewsLink, NewsSpot, RegionPin } from '../types'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'

type SpotRef = { id: string; itemId: string; text: string; spot: NewsSpot }

/** Layers a click can land on, and the headline a hit should surface. */
const STORY_LAYERS = ['news-link-line', 'news-spot-line']

type StoryPopup = { itemId: string; text: string; lat: number; lng: number }

type WorldMapProps = {
  regions: RegionPin[]
  links: NewsLink[]
  linkColors: Map<string, string>
  spots: SpotRef[]
  selectedId: string | null
  unseenByRegion: Record<string, number>
  linkedRegionIds: Set<string>
  onSelect: (regionId: string) => void
  onFocusStory: (itemId: string | null) => void
}

export function WorldMap({
  regions,
  links,
  linkColors,
  spots,
  selectedId,
  unseenByRegion,
  linkedRegionIds,
  onSelect,
  onFocusStory,
}: WorldMapProps) {
  const mapRef = useRef<MapRef>(null)
  const selected = regions.find((region) => region.regionId === selectedId)
  const [popup, setPopup] = useState<StoryPopup | null>(null)

  const linkData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: links.map((link) => ({
        type: 'Feature' as const,
        properties: {
          itemId: link.id,
          text: link.text,
          color: linkColors.get(link.id) ?? LINK_COLORS[0],
        },
        geometry: { type: 'LineString' as const, coordinates: linkCoordinates(link.regions) },
      })),
    }),
    [linkColors, links],
  )

  // Tethers the region pin to the exact place a headline datelines, e.g. an epicentre.
  const spotData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: selected
        ? spots.map(({ id, itemId, text, spot }) => ({
            type: 'Feature' as const,
            properties: { id, itemId, text },
            geometry: {
              type: 'LineString' as const,
              coordinates: pathCoordinates([selected, spot]),
            },
          }))
        : [],
    }),
    [selected, spots],
  )

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const hit = event.features?.[0]
      if (!hit?.properties) {
        setPopup(null)
        onFocusStory(null)
        return
      }
      const { itemId, text } = hit.properties as { itemId?: string; text?: string }
      if (!itemId) return
      setPopup({ itemId, text: text ?? '', lat: event.lngLat.lat, lng: event.lngLat.lng })
      onFocusStory(itemId)
    },
    [onFocusStory],
  )

  // Lines are thin, so tell people they are clickable before they try.
  const handleMapMove = useCallback((event: MapLayerMouseEvent) => {
    const map = event.target
    map.getCanvas().style.cursor = event.features?.length ? 'pointer' : ''
  }, [])

  // Changing region or filter can retire a line; its popup should go with it.
  const drawnStoryIds = useMemo(
    () => new Set([...links.map((link) => link.id), ...spots.map(({ itemId }) => itemId)]),
    [links, spots],
  )
  const visiblePopup = popup && drawnStoryIds.has(popup.itemId) ? popup : null

  useEffect(() => {
    if (!selected) return
    const map = mapRef.current
    if (!map) return

    // A dateline can sit far from its region pin, so frame both rather than zooming in blind.
    if (spots.length > 0) {
      const points = pathCoordinates([selected, ...spots.map(({ spot }) => spot)])
      const bounds = points.reduce(
        (box, point) => box.extend(point),
        new LngLatBounds(points[0], points[0]),
      )
      map.fitBounds(bounds, {
        padding: { top: 90, bottom: 70, left: 340, right: 410 },
        maxZoom: 7,
        duration: 800,
      })
      return
    }

    map.flyTo({
      center: [selected.lng, selected.lat],
      zoom: Math.max(map.getZoom(), 5),
      duration: 800,
    })
  }, [selected, spots])

  return (
    <div className="world-map">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 12, latitude: 18, zoom: 2.15 }}
        minZoom={1.4}
        maxZoom={12}
        mapStyle={MAP_STYLE}
        reuseMaps
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={STORY_LAYERS}
        onClick={handleMapClick}
        onMouseMove={handleMapMove}
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <Source id="news-links" type="geojson" data={linkData}>
          <Layer
            id="news-link-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['get', 'color'],
              'line-width': selectedId ? 1.8 : 1.2,
              'line-opacity': selectedId ? 0.85 : 0.5,
            }}
          />
          <Layer
            id="news-link-arrow"
            type="symbol"
            layout={{
              'symbol-placement': 'line',
              'symbol-spacing': 90,
              'text-field': '>',
              'text-size': 14,
              'text-font': ['Noto Sans Bold'],
              'text-rotation-alignment': 'map',
              'text-keep-upright': false,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{
              'text-color': ['get', 'color'],
              'text-opacity': selectedId ? 0.98 : 0.7,
            }}
          />
        </Source>
        <Source id="news-spots" type="geojson" data={spotData}>
          <Layer
            id="news-spot-line"
            type="line"
            layout={{ 'line-cap': 'round' }}
            paint={{
              'line-color': '#e8c45f',
              'line-width': 2,
              'line-opacity': 0.8,
              // Round caps on a near-zero dash give a dotted trail.
              'line-dasharray': [0.1, 2.2],
            }}
          />
        </Source>
        {visiblePopup ? (
          <Popup
            longitude={visiblePopup.lng}
            latitude={visiblePopup.lat}
            anchor="bottom"
            offset={12}
            closeButton
            closeOnClick={false}
            onClose={() => {
              setPopup(null)
              onFocusStory(null)
            }}
            className="story-popup"
            maxWidth="260px"
          >
            <p>{visiblePopup.text}</p>
          </Popup>
        ) : null}
        {spots.map(({ id, spot }) => (
          <Marker key={id} longitude={spot.lng} latitude={spot.lat} anchor="center" style={{ zIndex: 3 }}>
            <span className="spot-pin" title={spot.label}>
              <span className="spot-pin__dot" />
              <span className="spot-pin__label">{spot.label}</span>
            </span>
          </Marker>
        ))}
        {regions.map((region) => {
          const unseen = unseenByRegion[region.regionId] ?? 0
          const count = unseen > 0 ? unseen : region.items.length
          const live = unseen > 0 || region.regionId === selectedId
          const linked = linkedRegionIds.has(region.regionId)
          const pinClass = ['region-pin__btn', live ? 'is-live' : '', linked ? 'is-linked' : '']
            .filter(Boolean)
            .join(' ')
          const latest = latestItem(region.items)
          const updated = latest ? formatUpdated(latest.publishedAt) : null
          const open = region.regionId === selectedId
          const freshness = freshnessOf(region.latestAt)
          // Fresh pins sit above older ones so a crowded map still reads newest-first.
          const layer = open ? 6 : freshness === 'fresh' ? 5 : freshness === 'recent' ? 4 : 3
          return (
            <Marker
              key={region.regionId}
              longitude={region.lng}
              latitude={region.lat}
              anchor="center"
              style={{ zIndex: freshness === 'old' && !open && !live && !linked ? 1 : layer }}
              onClick={(event) => {
                event.originalEvent.stopPropagation()
                onSelect(region.regionId)
              }}
            >
              <div className={['region-pin', `is-${freshness}`, open ? 'is-open' : ''].filter(Boolean).join(' ')}>
                <button
                  className={pinClass}
                  type="button"
                  aria-label={
                    updated && latest
                      ? `${region.region}: last news ${updated.relative}. ${latest.text}`
                      : `${region.region}: ${count} news items`
                  }
                >
                  <span className="region-pin__pulse" />
                  <span className="region-pin__count">{count}</span>
                </button>
                <span className="region-pin__age">{shortAge(region.latestAt)}</span>
                {latest && updated ? (
                  <div className="region-pin__card">
                    <p className="region-pin__place">{region.region}</p>
                    <time dateTime={latest.publishedAt}>
                      {updated.relative} · {updated.clock}
                    </time>
                    <p className="region-pin__news">{latest.text}</p>
                  </div>
                ) : null}
              </div>
            </Marker>
          )
        })}
      </Map>
    </div>
  )
}
