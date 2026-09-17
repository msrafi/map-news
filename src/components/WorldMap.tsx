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
import { styleUrl, themeOf } from '../lib/mapStyles'
import { formatStamp, formatUpdated, freshnessOf, isMapBright, latestItem, shortAge } from '../lib/time'
import type { MapStyleId, NewsLink, NewsSpot, RegionPin } from '../types'

type SpotRef = { id: string; itemId: string; text: string; publishedAt: string; spot: NewsSpot }

/** Layers a click can land on, and the headline a hit should surface. */
const STORY_LAYERS = ['news-link-line', 'news-spot-line']

type StoryPopup = { itemId: string; text: string; lat: number; lng: number }

/** A story picked in the feed, resolved to the point the map should call out. */
type PinnedStory = {
  id: string
  text: string
  label: string
  publishedAt: string
  lng: number
  lat: number
}

type WorldMapProps = {
  regions: RegionPin[]
  links: NewsLink[]
  linkColors: Map<string, string>
  spots: SpotRef[]
  selectedId: string | null
  unseenByRegion: Record<string, number>
  linkedRegionIds: Set<string>
  pinnedStory: PinnedStory | null
  mapStyle: MapStyleId
  onSelect: (regionId: string) => void
  onFocusStory: (itemId: string | null) => void
  onClearPinned: () => void
  /** Empty map clicked: drop the region and everything opened over it. */
  onClearSelection: () => void
}

export function WorldMap({
  regions,
  links,
  linkColors,
  spots,
  selectedId,
  unseenByRegion,
  linkedRegionIds,
  pinnedStory,
  mapStyle,
  onSelect,
  onFocusStory,
  onClearPinned,
  onClearSelection,
}: WorldMapProps) {
  const mapRef = useRef<MapRef>(null)
  const selected = regions.find((region) => region.regionId === selectedId)
  const [popup, setPopup] = useState<StoryPopup | null>(null)
  const newestAt = useMemo(
    () => regions.reduce((latest, region) => (region.latestAt > latest ? region.latestAt : latest), ''),
    [regions],
  )

  const linkData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: links.map((link) => ({
        type: 'Feature' as const,
        properties: {
          itemId: link.id,
          text: link.text,
          color: linkColors.get(link.id) ?? LINK_COLORS[0],
          opacity: isMapBright(link.publishedAt, newestAt) ? 0.9 : 0.22,
        },
        geometry: { type: 'LineString' as const, coordinates: linkCoordinates(link.regions) },
      })),
    }),
    [linkColors, links, newestAt],
  )

  // Tethers the region pin to the exact place a headline datelines, e.g. an epicentre.
  const spotData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: selected
        ? spots.map(({ id, itemId, text, publishedAt, spot }) => ({
            type: 'Feature' as const,
            properties: {
              id,
              itemId,
              text,
              opacity: isMapBright(publishedAt, newestAt) ? 0.85 : 0.22,
            },
            geometry: {
              type: 'LineString' as const,
              coordinates: pathCoordinates([selected, spot]),
            },
          }))
        : [],
    }),
    [newestAt, selected, spots],
  )

  const handleMapClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const hit = event.features?.[0]
      // Pins stop their own clicks, so bare canvas means "never mind".
      if (!hit?.properties) {
        setPopup(null)
        onClearSelection()
        return
      }
      const { itemId, text } = hit.properties as { itemId?: string; text?: string }
      if (!itemId) return
      setPopup({ itemId, text: text ?? '', lat: event.lngLat.lat, lng: event.lngLat.lng })
      onFocusStory(itemId)
    },
    [onClearSelection, onFocusStory],
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
  const visiblePopup =
    popup && !pinnedStory && drawnStoryIds.has(popup.itemId) ? popup : null

  useEffect(() => {
    // A story picked in the feed frames itself, so leave the camera to that effect.
    if (!selected || pinnedStory) return
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
  }, [pinnedStory, selected, spots])

  // A story opened from the feed gets the camera and drops its own popup.
  useEffect(() => {
    if (!pinnedStory) return
    mapRef.current?.flyTo({
      center: [pinnedStory.lng, pinnedStory.lat],
      zoom: Math.max(mapRef.current.getZoom(), 5),
      duration: 800,
    })
  }, [pinnedStory])

  return (
    <div
      className={[
        'world-map',
        `is-${themeOf(mapStyle)}`,
        visiblePopup || pinnedStory ? 'has-popup' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 12, latitude: 18, zoom: 2.15 }}
        minZoom={1.4}
        maxZoom={12}
        mapStyle={styleUrl(mapStyle)}
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
              'line-opacity': ['get', 'opacity'],
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
              'text-opacity': ['get', 'opacity'],
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
              'line-opacity': ['get', 'opacity'],
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
        {pinnedStory ? (
          <>
            <Marker
              longitude={pinnedStory.lng}
              latitude={pinnedStory.lat}
              anchor="center"
              style={{ zIndex: 7 }}
            >
              <span className="story-pin" aria-hidden="true" />
            </Marker>
            <Popup
              longitude={pinnedStory.lng}
              latitude={pinnedStory.lat}
              anchor="bottom"
              offset={34}
              closeButton
              closeOnClick={false}
              onClose={() => {
                setPopup(null)
                onClearPinned()
              }}
              className="story-popup is-pinned"
              maxWidth="280px"
            >
              <p className="story-popup__where">
                {pinnedStory.label}
                <time dateTime={pinnedStory.publishedAt}>
                  {formatStamp(pinnedStory.publishedAt)}
                </time>
              </p>
              <p>{pinnedStory.text}</p>
            </Popup>
          </>
        ) : null}
        {spots.map(({ id, publishedAt, spot }) => (
          <Marker
            key={id}
            longitude={spot.lng}
            latitude={spot.lat}
            anchor="center"
            style={{ zIndex: 3 }}
            // A dot belongs to the open region, so clicking it must not clear that region.
            onClick={(event) => event.originalEvent.stopPropagation()}
          >
            <span
              className={['spot-pin', isMapBright(publishedAt, newestAt) ? 'is-bright' : 'is-dim']
                .filter(Boolean)
                .join(' ')}
              title={spot.label}
            >
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
          const bright = isMapBright(region.latestAt, newestAt)
          // Fresh pins sit above older ones so a crowded map still reads newest-first.
          const layer = open ? 6 : bright ? 5 : freshness === 'recent' ? 4 : 3
          return (
            <Marker
              key={region.regionId}
              longitude={region.lng}
              latitude={region.lat}
              anchor="center"
              style={{ zIndex: !bright && !open && !live && !linked ? 1 : layer }}
              onClick={(event) => {
                event.originalEvent.stopPropagation()
                onSelect(region.regionId)
              }}
            >
              <div
                className={[
                  'region-pin',
                  `is-${freshness}`,
                  bright ? 'is-bright' : 'is-dim',
                  open ? 'is-open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
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
