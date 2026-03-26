'use client'

import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import { MapContainer, useMap, Marker, Popup, Polygon } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, DrawnArea } from '@/lib/types'

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = defaultIcon

export const TILE_LAYERS = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, DigitalGlobe, GeoEye, USDA FSA, USGS',
    maxZoom: 19,
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  },
} as const

export type MapStyleKey = keyof typeof TILE_LAYERS

function MapController({ searchResult }: { searchResult?: { lat: number; lon: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (searchResult) map.flyTo([searchResult.lat, searchResult.lon], 14, { duration: 1.2 })
  }, [searchResult, map])
  return null
}

function TileLayerSwitcher({ mapStyle }: { mapStyle: MapStyleKey }) {
  const map = useMap()
  const layerRef = useRef<L.TileLayer | null>(null)

  useEffect(() => {
    if (layerRef.current) map.removeLayer(layerRef.current)
    const cfg = TILE_LAYERS[mapStyle]
    const layer = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom })
    layer.addTo(map)
    layerRef.current = layer
    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null } }
  }, [map, mapStyle])

  return null
}

function DrawController({
  drawMode, onAreaDrawn, onDrawStart, onDrawEnd,
}: {
  drawMode: 'lasso' | 'rect' | 'polygon' | null
  onAreaDrawn?: (area: DrawnArea) => void
  onDrawStart?: () => void
  onDrawEnd?: () => void
}) {
  const map = useMap()
  const featureGroupRef = useRef<L.FeatureGroup | null>(null)
  const drawLayerRef = useRef<L.Layer | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    featureGroupRef.current = new L.FeatureGroup()
    featureGroupRef.current.addTo(map)
    return () => { featureGroupRef.current?.remove() }
  }, [map])

  const clearDraw = useCallback(() => {
    featureGroupRef.current?.clearLayers()
    drawLayerRef.current = null
  }, [])

  const calcPolygonArea = (points: L.LatLng[]) => {
    if (points.length < 3) return 0
    let area = 0
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length
      area += points[i].lng * points[j].lat
      area -= points[j].lng * points[i].lat
    }
    return Math.abs(area / 2) * 111 * 111
  }

  const finalizeArea = useCallback((area: DrawnArea) => {
    onDrawEnd?.()
    onAreaDrawn?.(area)
  }, [onAreaDrawn, onDrawEnd])

  useEffect(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    clearDraw()
    map.getContainer().style.cursor = drawMode ? 'crosshair' : ''
    map.dragging.enable()
    if (!drawMode) return

    onDrawStart?.()
    const fg = featureGroupRef.current!
    const container = map.getContainer()

    if (drawMode === 'lasso') {
      let painting = false
      const points: L.LatLng[] = []

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return
        painting = true; points.length = 0; fg.clearLayers(); map.dragging.disable()
      }
      const onMouseMove = (e: MouseEvent) => {
        if (!painting) return
        const r = container.getBoundingClientRect()
        points.push(map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top)))
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        if (points.length > 2) {
          drawLayerRef.current = L.polygon(points, { color: '#10b981', weight: 2, fillOpacity: 0.15, fillColor: '#10b981', dashArray: '4 4' })
          fg.addLayer(drawLayerRef.current)
        }
      }
      const onMouseUp = () => {
        if (!painting) return
        painting = false; map.dragging.enable()
        if (points.length < 3) { clearDraw(); return }
        fg.clearLayers()
        drawLayerRef.current = L.polygon(points, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
        fg.addLayer(drawLayerRef.current)
        finalizeArea({ type: 'polygon', coordinates: points.map(p => [p.lat, p.lng]), area: Math.round(calcPolygonArea(points) * 100) / 100 })
      }
      container.addEventListener('mousedown', onMouseDown)
      container.addEventListener('mousemove', onMouseMove)
      container.addEventListener('mouseup', onMouseUp)
      cleanupRef.current = () => {
        container.removeEventListener('mousedown', onMouseDown)
        container.removeEventListener('mousemove', onMouseMove)
        container.removeEventListener('mouseup', onMouseUp)
        map.dragging.enable()
      }
    }

    if (drawMode === 'rect') {
      let startLatLng: L.LatLng | null = null; let dragging = false
      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return
        const r = container.getBoundingClientRect()
        startLatLng = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))
        dragging = true; fg.clearLayers(); map.dragging.disable()
      }
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging || !startLatLng) return
        const r = container.getBoundingClientRect()
        const end = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        drawLayerRef.current = L.rectangle([startLatLng, end], { color: '#10b981', weight: 2.5, fillOpacity: 0.15, fillColor: '#10b981' })
        fg.addLayer(drawLayerRef.current)
      }
      const onMouseUp = (e: MouseEvent) => {
        if (!dragging || !startLatLng) return
        dragging = false; map.dragging.enable()
        const r = container.getBoundingClientRect()
        const end = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))
        const bounds = L.latLngBounds(startLatLng, end)
        const w = Math.abs(bounds.getEast() - bounds.getWest())
        const h = Math.abs(bounds.getNorth() - bounds.getSouth())
        if (w < 0.001 || h < 0.001) { clearDraw(); return }
        finalizeArea({ type: 'rectangle', coordinates: [[bounds.getSouth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()]], area: Math.round(w * 111 * h * 111 * 100) / 100 })
      }
      container.addEventListener('mousedown', onMouseDown)
      container.addEventListener('mousemove', onMouseMove)
      container.addEventListener('mouseup', onMouseUp)
      cleanupRef.current = () => {
        container.removeEventListener('mousedown', onMouseDown)
        container.removeEventListener('mousemove', onMouseMove)
        container.removeEventListener('mouseup', onMouseUp)
        map.dragging.enable()
      }
    }

    if (drawMode === 'polygon') {
      const points: L.LatLng[] = []
      const onClick = (e: L.LeafletMouseEvent) => {
        points.push(e.latlng)
        L.circleMarker(e.latlng, { radius: 5, color: '#10b981', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(fg)
        if (points.length >= 3) {
          if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
          drawLayerRef.current = L.polygon(points, { color: '#10b981', weight: 2.5, fillOpacity: 0.15, fillColor: '#10b981' })
          fg.addLayer(drawLayerRef.current)
        }
      }
      const onDblClick = () => {
        map.off('click', onClick); map.off('dblclick', onDblClick)
        if (points.length < 3) { clearDraw(); return }
        fg.clearLayers()
        drawLayerRef.current = L.polygon(points, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
        fg.addLayer(drawLayerRef.current)
        finalizeArea({ type: 'polygon', coordinates: points.map(p => [p.lat, p.lng]), area: Math.round(calcPolygonArea(points) * 100) / 100 })
      }
      map.on('click', onClick)
      map.on('dblclick', onDblClick)
      cleanupRef.current = () => { map.off('click', onClick); map.off('dblclick', onDblClick) }
    }

    return () => { cleanupRef.current?.(); cleanupRef.current = null; map.getContainer().style.cursor = '' }
  }, [drawMode, map, clearDraw, finalizeArea, onDrawStart, onDrawEnd])

  return null
}

interface MapComponentProps {
  mapStyle?: MapStyleKey
  drawMode?: 'lasso' | 'rect' | 'polygon' | null
  onAreaDrawn?: (area: DrawnArea) => void
  onDrawStart?: () => void
  onDrawEnd?: () => void
  searchResult?: { lat: number; lon: number; address: string } | null
  savedAreas?: Search[]
}

export function MapComponent({
  mapStyle = 'street', drawMode = null,
  onAreaDrawn, onDrawStart, onDrawEnd, searchResult, savedAreas = [],
}: MapComponentProps) {
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false)

  if (!isClient) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Caricamento mappa...</div>
      </div>
    )
  }

  return (
    <MapContainer center={[41.9028, 12.4964]} zoom={6} className="w-full h-full z-0" zoomControl={false}>
      <TileLayerSwitcher mapStyle={mapStyle} />
      <MapController searchResult={searchResult} />
      <DrawController drawMode={drawMode} onAreaDrawn={onAreaDrawn} onDrawStart={onDrawStart} onDrawEnd={onDrawEnd} />
      {searchResult && (
        <Marker position={[searchResult.lat, searchResult.lon]}>
          <Popup><div className="text-sm"><strong>{searchResult.address.split(',').slice(0, 2).join(', ')}</strong></div></Popup>
        </Marker>
      )}
      {savedAreas.map((area, idx) => {
        if (!area.area_geojson) return null
        try {
          const geo = JSON.parse(area.area_geojson)
          return (
            <Polygon key={area.id || idx} positions={geo.coordinates} pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.3 }}>
              <Popup>{area.title}</Popup>
            </Polygon>
          )
        } catch { return null }
      })}
    </MapContainer>
  )
}
