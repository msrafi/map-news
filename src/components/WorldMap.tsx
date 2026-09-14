import { LngLatBounds } from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl/maplibre'
import { linkCoordinates, pathCoordinates } from '../lib/news'
import { formatUpdated, latestItem } from '../lib/time'
import type { NewsLink, NewsSpot, RegionPin } from '../types'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'

type SpotRef = { id: string; spot: NewsSpot }

type WorldMapProps = {
  regions: RegionPin[]
  links: NewsLink[]
  spots: SpotRef[]
  selectedId: string | null
  unseenByRegion: Record<string, number>
  linkedRegionIds: Set<string>
  onSelect: (regionId: string) => void
}

export function WorldMap({
  regions,
  links,
  spots,
  selectedId,
  unseenByRegion,
  linkedRegionIds,
  onSelect,
}: WorldMapProps) {
  const mapRef = useRef<MapRef>(null)
  const selected = regions.find((region) => region.regionId === selectedId)

  const linkData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: links.map((link) => ({
        type: 'Feature' as const,
        properties: { id: link.id },
        geometry: { type: 'LineString' as const, coordinates: linkCoordinates(link.regions) },
      })),
    }),
    [links],
  )

  // Tethers the region pin to the exact place a headline datelines, e.g. an epicentre.
  const spotData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: selected
        ? spots.map(({ id, spot }) => ({
            type: 'Feature' as const,
            properties: { id },
            geometry: {
              type: 'LineString' as const,
              coordinates: pathCoordinates([selected, spot]),
            },
          }))
        : [],
    }),
    [selected, spots],
  )

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
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <Source id="news-links" type="geojson" data={linkData}>
          <Layer
            id="news-link-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#5ec8c5',
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
              'text-color': '#5ec8c5',
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
              'line-width': 1.4,
              'line-opacity': 0.75,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>
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
          return (
            <Marker
              key={region.regionId}
              longitude={region.lng}
              latitude={region.lat}
              anchor="center"
              style={{ zIndex: open ? 4 : live || linked ? 1 : 0 }}
              onClick={(event) => {
                event.originalEvent.stopPropagation()
                onSelect(region.regionId)
              }}
            >
              <div className={open ? 'region-pin is-open' : 'region-pin'}>
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
