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

/** Location pins older than this are left off the map. The news list still has them. */
const MARKER_MAX_AGE_MS = 15 * 60 * 1000

function isMarkerCurrent(iso: string, now = Date.now()): boolean {
  const published = Date.parse(iso)
  return Number.isFinite(published) && now - published <= MARKER_MAX_AGE_MS
}

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
  /** The open story stays selected while its route is drawn heavier. */
  showConnections: boolean
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
  showConnections,
  mapStyle,
  onSelect,
  onFocusStory,
  onClearPinned,
  onClearSelection,
}: WorldMapProps) {
  const mapRef = useRef<MapRef>(null)
  const theme = themeOf(mapStyle)
  const selected = regions.find((region) => region.regionId === selectedId)
  // Dark maps get a light route; light maps get a dark route with a white edge.
  const routeCore = theme === 'dark' ? '#f4fbff' : '#142033'
  const routeHalo = theme === 'dark' ? '#4ad4ff' : '#ffffff'
  const spotColor = theme === 'dark' ? '#ffe7a3' : '#6b3e00'
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
    const map = mapRef.current
    if (!map) return

    const connected = [
      ...links.flatMap((link) => link.regions),
      ...spots.map(({ spot }) => spot),
    ]
    if (showConnections && selected && connected.length > 0) {
      const points = pathCoordinates([selected, ...connected])
      const center = points
        .reduce((box, point) => box.extend(point), new LngLatBounds(points[0], points[0]))
        .getCenter()
      map.easeTo({ center: [center.lng, center.lat], duration: 1200 })
      return
    }

    // The selected story stays pinned, so return the camera to it once the route step ends.
    if (pinnedStory) {
      map.easeTo({
        center: [pinnedStory.lng, pinnedStory.lat],
        duration: 1200,
      })
      return
    }

    if (!selected) return
    map.easeTo({
      center: [selected.lng, selected.lat],
      duration: 1200,
    })
  }, [links, pinnedStory, selected, showConnections, spots])

  return (
    <div
      className={[
        'world-map',
        `is-${theme}`,
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
            id="news-link-halo"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': routeHalo,
              'line-width': showConnections ? 9 : 0,
              'line-opacity': showConnections ? 1 : 0,
            }}
          />
          <Layer
            id="news-link-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': showConnections ? routeCore : ['get', 'color'],
              'line-width': showConnections ? 4.5 : selectedId ? 1.8 : 1.2,
              'line-opacity': showConnections ? 1 : ['get', 'opacity'],
            }}
          />
          <Layer
            id="news-link-arrow"
            type="symbol"
            layout={{
              'symbol-placement': 'line',
              'symbol-spacing': 90,
              'text-field': '>',
              'text-size': showConnections ? 20 : 14,
              'text-font': ['Noto Sans Bold'],
              'text-rotation-alignment': 'map',
              'text-keep-upright': false,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{
              'text-color': showConnections ? routeCore : ['get', 'color'],
              'text-halo-color': routeHalo,
              'text-halo-width': showConnections ? 1.5 : 0,
              'text-opacity': showConnections ? 1 : ['get', 'opacity'],
            }}
          />
        </Source>
        <Source id="news-spots" type="geojson" data={spotData}>
          <Layer
            id="news-spot-line"
            type="line"
            layout={{ 'line-cap': 'round' }}
            paint={{
              'line-color': showConnections ? spotColor : '#e8c45f',
              'line-width': showConnections ? 4.5 : 2,
              'line-opacity': showConnections ? 1 : ['get', 'opacity'],
              // Round caps on a near-zero dash give a dotted trail.
              'line-dasharray': showConnections ? [1.5, 1.1] : [0.1, 2.2],
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
        {spots
          .filter(
            ({ itemId, publishedAt }) =>
              isMarkerCurrent(publishedAt) ||
              publishedAt === newestAt ||
              itemId === pinnedStory?.id,
          )
          .map(({ id, publishedAt, spot }) => (
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
        {regions
          // The newest story and the open region stay on the map until newer news replaces them.
          .filter(
            (region) =>
              isMarkerCurrent(region.latestAt) ||
              region.latestAt === newestAt ||
              region.regionId === selectedId,
          )
          .map((region) => {
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
