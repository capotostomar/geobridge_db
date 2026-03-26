'use client'

import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import { MapContainer, useMap, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DrawnArea, AnalysisResult } from '@/lib/types'

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = defaultIcon

export const TILE_LAYERS = {
  street:    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',           attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri, DigitalGlobe, GeoEye', maxZoom: 19 },
  topo:      { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',             attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>', maxZoom: 17 },
} as const
export type MapStyleKey = keyof typeof TILE_LAYERS

// ─── risk color ───────────────────────────────────────────────────────────
function riskColor(level?: string) {
  switch (level) {
    case 'critico': return '#ef4444'
    case 'alto':    return '#f97316'
    case 'medio':   return '#eab308'
    default:        return '#6366f1'
  }
}

// ─── TileLayerSwitcher ────────────────────────────────────────────────────
function TileLayerSwitcher({ mapStyle }: { mapStyle: MapStyleKey }) {
  const map = useMap()
  const ref = useRef<L.TileLayer | null>(null)
  useEffect(() => {
    if (ref.current) map.removeLayer(ref.current)
    const cfg = TILE_LAYERS[mapStyle]
    const layer = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom })
    layer.addTo(map)
    ref.current = layer
    return () => { if (ref.current) { map.removeLayer(ref.current); ref.current = null } }
  }, [map, mapStyle])
  return null
}

// ─── MapController: fly to search ────────────────────────────────────────
function MapController({ searchResult }: { searchResult?: { lat: number; lon: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (searchResult) map.flyTo([searchResult.lat, searchResult.lon], 14, { duration: 1.2 })
  }, [searchResult, map])
  return null
}

// ─── SavedAreasLayer: renderizza aree salvate ─────────────────────────────
function SavedAreasLayer({ analyses }: { analyses: AnalysisResult[] }) {
  const map = useMap()
  const groupRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
    if (groupRef.current) { map.removeLayer(groupRef.current) }
    const fg = L.featureGroup()
    
    analyses.forEach(a => {
      if (!a.coordinates?.length) return
      try {
        // Fix: le coordinate sono [lat, lng] — Leaflet le accetta direttamente
        const latlngs = a.coordinates.map(c => L.latLng(c[0], c[1]))
        const color = riskColor(a.compositeLevel)
        const poly = L.polygon(latlngs, {
          color, weight: 2, fillColor: color, fillOpacity: 0.15, dashArray: '4 2'
        })
        poly.bindPopup(`<div style="font-size:13px"><strong>${a.title}</strong><br/>Rischio: ${a.compositeLevel?.toUpperCase() ?? '—'} (${a.compositeScore ?? '?'}/100)</div>`)
        fg.addLayer(poly)
      } catch {}
    })
    
    fg.addTo(map)
    groupRef.current = fg
    return () => { map.removeLayer(fg) }
  }, [map, analyses])
  
  return null
}

// ─── DrawController ───────────────────────────────────────────────────────
function DrawController({ drawMode, onAreaDrawn, onDrawStart, onDrawEnd }: {
  drawMode: 'lasso' | 'rect' | 'polygon' | null
  onAreaDrawn?: (area: DrawnArea) => void
  onDrawStart?: () => void
  onDrawEnd?: () => void
}) {
  const map = useMap()
  const fgRef = useRef<L.FeatureGroup | null>(null)
  const drawLayerRef = useRef<L.Layer | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    fgRef.current = new L.FeatureGroup()
    fgRef.current.addTo(map)
    return () => { fgRef.current?.remove() }
  }, [map])

  const clearDraw = useCallback(() => {
    fgRef.current?.clearLayers()
    drawLayerRef.current = null
  }, [])

  const calcPolyArea = (pts: L.LatLng[]) => {
    if (pts.length < 3) return 0
    let a = 0
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length
      a += pts[i].lng * pts[j].lat - pts[j].lng * pts[i].lat
    }
    return Math.abs(a / 2) * 111 * 111
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
    const fg = fgRef.current!
    const container = map.getContainer()

    // ── LASSO ────────────────────────────────────────────────────
    if (drawMode === 'lasso') {
      let painting = false
      const pts: L.LatLng[] = []
      const onDown = (e: MouseEvent) => {
        if (e.button !== 0) return
        painting = true; pts.length = 0; fg.clearLayers(); map.dragging.disable()
      }
      const onMove = (e: MouseEvent) => {
        if (!painting) return
        const r = container.getBoundingClientRect()
        pts.push(map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top)))
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        if (pts.length > 2) {
          drawLayerRef.current = L.polygon(pts, { color: '#10b981', weight: 2, fillOpacity: 0.15, fillColor: '#10b981', dashArray: '4 4' })
          fg.addLayer(drawLayerRef.current)
        }
      }
      const onUp = () => {
        if (!painting) return
        painting = false; map.dragging.enable()
        if (pts.length < 3) { clearDraw(); return }
        fg.clearLayers()
        drawLayerRef.current = L.polygon(pts, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
        fg.addLayer(drawLayerRef.current)
        finalizeArea({ type: 'lasso', coordinates: pts.map(p => [p.lat, p.lng]), area: Math.round(calcPolyArea(pts) * 100) / 100 })
      }
      container.addEventListener('mousedown', onDown)
      container.addEventListener('mousemove', onMove)
      container.addEventListener('mouseup', onUp)
      cleanupRef.current = () => {
        container.removeEventListener('mousedown', onDown)
        container.removeEventListener('mousemove', onMove)
        container.removeEventListener('mouseup', onUp)
        map.dragging.enable()
      }
    }

    // ── RETTANGOLO ───────────────────────────────────────────────
    if (drawMode === 'rect') {
      let start: L.LatLng | null = null; let dragging = false
      const onDown = (e: MouseEvent) => {
        if (e.button !== 0) return
        const r = container.getBoundingClientRect()
        start = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))
        dragging = true; fg.clearLayers(); map.dragging.disable()
      }
      const onMove = (e: MouseEvent) => {
        if (!dragging || !start) return
        const r = container.getBoundingClientRect()
        const end = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        drawLayerRef.current = L.rectangle([start, end], { color: '#10b981', weight: 2.5, fillOpacity: 0.15, fillColor: '#10b981' })
        fg.addLayer(drawLayerRef.current)
      }
      const onUp = (e: MouseEvent) => {
        if (!dragging || !start) return
        dragging = false; map.dragging.enable()
        const r = container.getBoundingClientRect()
        const end = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))
        const bounds = L.latLngBounds(start, end)
        const w = Math.abs(bounds.getEast() - bounds.getWest())
        const h = Math.abs(bounds.getNorth() - bounds.getSouth())
        if (w < 0.001 || h < 0.001) { clearDraw(); return }
        // Fix rettangolo: generiamo i 4 vertici in ordine corretto
        const coords: [number, number][] = [
          [bounds.getNorth(), bounds.getWest()],
          [bounds.getNorth(), bounds.getEast()],
          [bounds.getSouth(), bounds.getEast()],
          [bounds.getSouth(), bounds.getWest()],
        ]
        finalizeArea({ type: 'rectangle', coordinates: coords, area: Math.round(w * 111 * h * 111 * 100) / 100 })
      }
      container.addEventListener('mousedown', onDown)
      container.addEventListener('mousemove', onMove)
      container.addEventListener('mouseup', onUp)
      cleanupRef.current = () => {
        container.removeEventListener('mousedown', onDown)
        container.removeEventListener('mousemove', onMove)
        container.removeEventListener('mouseup', onUp)
        map.dragging.enable()
      }
    }

    // ── POLIGONO ─────────────────────────────────────────────────
    if (drawMode === 'polygon') {
      const pts: L.LatLng[] = []
      const onClick = (e: L.LeafletMouseEvent) => {
        pts.push(e.latlng)
        L.circleMarker(e.latlng, { radius: 5, color: '#10b981', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(fg)
        if (pts.length >= 3) {
          if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
          drawLayerRef.current = L.polygon(pts, { color: '#10b981', weight: 2.5, fillOpacity: 0.15, fillColor: '#10b981' })
          fg.addLayer(drawLayerRef.current)
        }
      }
      const onDbl = () => {
        map.off('click', onClick); map.off('dblclick', onDbl)
        if (pts.length < 3) { clearDraw(); return }
        fg.clearLayers()
        drawLayerRef.current = L.polygon(pts, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
        fg.addLayer(drawLayerRef.current)
        finalizeArea({ type: 'polygon', coordinates: pts.map(p => [p.lat, p.lng]), area: Math.round(calcPolyArea(pts) * 100) / 100 })
      }
      map.on('click', onClick)
      map.on('dblclick', onDbl)
      cleanupRef.current = () => { map.off('click', onClick); map.off('dblclick', onDbl) }
    }

    return () => { cleanupRef.current?.(); cleanupRef.current = null; map.getContainer().style.cursor = '' }
  }, [drawMode, map, clearDraw, finalizeArea, onDrawStart, onDrawEnd])

  return null
}

// ─── Main component ───────────────────────────────────────────────────────
interface MapComponentProps {
  mapStyle?: MapStyleKey
  drawMode?: 'lasso' | 'rect' | 'polygon' | null
  onAreaDrawn?: (area: DrawnArea) => void
  onDrawStart?: () => void
  onDrawEnd?: () => void
  searchResult?: { lat: number; lon: number; address: string } | null
  savedAnalyses?: AnalysisResult[]
}

export function MapComponent({ mapStyle = 'street', drawMode = null, onAreaDrawn, onDrawStart, onDrawEnd, searchResult, savedAnalyses = [] }: MapComponentProps) {
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false)
  if (!isClient) return <div className="w-full h-full bg-slate-100 flex items-center justify-center"><div className="animate-pulse text-slate-400">Caricamento mappa...</div></div>

  return (
    <MapContainer center={[41.9028, 12.4964]} zoom={6} className="w-full h-full z-0" zoomControl={false}>
      <TileLayerSwitcher mapStyle={mapStyle} />
      <MapController searchResult={searchResult} />
      <DrawController drawMode={drawMode} onAreaDrawn={onAreaDrawn} onDrawStart={onDrawStart} onDrawEnd={onDrawEnd} />
      <SavedAreasLayer analyses={savedAnalyses} />
      {searchResult && (
        <Marker position={[searchResult.lat, searchResult.lon]}>
          <Popup><div className="text-sm"><strong>{searchResult.address.split(',').slice(0, 2).join(', ')}</strong></div></Popup>
        </Marker>
      )}
    </MapContainer>
  )
}
