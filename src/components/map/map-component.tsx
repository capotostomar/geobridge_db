'use client'

import {
  useEffect, useRef, useCallback, useSyncExternalStore, useImperativeHandle, forwardRef
} from 'react'
import { MapContainer, useMap, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DrawnArea, AnalysisResult, RiskLevel } from '@/lib/types'

/* ─── Marker icon fix ───────────────────────────────────────────────────── */
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = defaultIcon

/* ─── Tile layers ───────────────────────────────────────────────────────── */
export const TILE_LAYERS = {
  street:    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap', maxZoom: 19 },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri', maxZoom: 19 },
  topo:      { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenTopoMap', maxZoom: 17 },
} as const
export type MapStyleKey = keyof typeof TILE_LAYERS

export interface MapHandle {
  clearDrawing: () => void
  zoomIn: () => void
  zoomOut: () => void
}

function riskColor(level?: RiskLevel | string) {
  const m: Record<string, string> = { basso: '#10b981', medio: '#f59e0b', alto: '#f97316', critico: '#ef4444' }
  return m[level ?? ''] ?? '#6366f1'
}

/* ─── TileLayerSwitcher ─────────────────────────────────────────────────── */
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

/* ─── MapController ─────────────────────────────────────────────────────── */
function MapControllerInner({ searchResult, onMapReady }: {
  searchResult?: { lat: number; lon: number } | null
  onMapReady: (m: L.Map) => void
}) {
  const map = useMap()
  useEffect(() => { onMapReady(map) }, [map, onMapReady])
  useEffect(() => {
    if (searchResult) map.flyTo([searchResult.lat, searchResult.lon], 14, { duration: 1.2 })
  }, [searchResult, map])
  return null
}

/* ─── Saved analyses overlay ────────────────────────────────────────────── */
function SavedAreasLayer({ analyses }: { analyses: AnalysisResult[] }) {
  const map = useMap()
  const groupRef = useRef<L.FeatureGroup | null>(null)
  useEffect(() => {
    if (groupRef.current) map.removeLayer(groupRef.current)
    const fg = L.featureGroup()
    analyses.forEach(a => {
      if (!a.coordinates?.length) return
      try {
        const latlngs = a.coordinates.map(c => L.latLng(c[0], c[1]))
        const color = riskColor(a.compositeLevel)
        L.polygon(latlngs, { color, weight: 2, fillColor: color, fillOpacity: 0.15, dashArray: '4 2' })
          .bindPopup(`<div style="font-size:13px"><strong>${a.title}</strong><br/>Rischio: ${a.compositeLevel?.toUpperCase() ?? '—'} (${a.compositeScore ?? '?'}/100)</div>`)
          .addTo(fg)
      } catch {}
    })
    fg.addTo(map)
    groupRef.current = fg
    return () => { if (groupRef.current) map.removeLayer(groupRef.current) }
  }, [map, analyses])
  return null
}

/* ─── DrawController ────────────────────────────────────────────────────── */
/**
 * Supporta sia mouse (desktop) che touch (mobile/tablet).
 * - lasso:   tieni premuto/touch e trascina
 * - rect:    click/tap e trascina
 * - polygon: tap per vertici, doppio tap (< 350ms) per chiudere
 * - touch_rect: tap su due angoli opposti (modalità touch-friendly)
 */
function DrawController({
  drawMode, onAreaDrawn, onDrawStart, onDrawEnd, clearDrawingRef,
}: {
  drawMode: 'lasso' | 'rect' | 'polygon' | 'touch_rect' | null
  onAreaDrawn?: (area: DrawnArea) => void
  onDrawStart?: () => void
  onDrawEnd?: () => void
  clearDrawingRef: React.MutableRefObject<(() => void) | null>
}) {
  const map = useMap()
  const fgRef = useRef<L.FeatureGroup | null>(null)
  const drawLayerRef = useRef<L.Layer | null>(null)
  const modeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    fgRef.current = L.featureGroup().addTo(map)
    return () => { fgRef.current?.remove() }
  }, [map])

  const clearDrawing = useCallback(() => {
    fgRef.current?.clearLayers()
    drawLayerRef.current = null
  }, [])

  useEffect(() => { clearDrawingRef.current = clearDrawing }, [clearDrawing, clearDrawingRef])

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

  /* Utility: converte evento touch/mouse a LatLng */
  const eventToLatLng = (container: HTMLElement, clientX: number, clientY: number): L.LatLng => {
    const r = container.getBoundingClientRect()
    return map.containerPointToLatLng(L.point(clientX - r.left, clientY - r.top))
  }

  useEffect(() => {
    const container = map.getContainer()
    if (drawMode) {
      container.style.cursor = 'crosshair'
    } else {
      container.style.cursor = 'grab'
    }
  }, [map, drawMode])

  useEffect(() => {
    modeCleanupRef.current?.()
    modeCleanupRef.current = null
    clearDrawing()
    map.dragging.enable()
    if ((map as any).tap) (map as any).tap?.enable()

    if (!drawMode) return
    onDrawStart?.()
    const fg = fgRef.current!
    const container = map.getContainer()

    /* ── LASSO (mouse + touch) ──────────────────────────────────────────── */
    if (drawMode === 'lasso') {
      let painting = false
      const pts: L.LatLng[] = []

      const startPainting = (clientX: number, clientY: number) => {
        painting = true
        pts.length = 0
        fg.clearLayers()
        drawLayerRef.current = null
        map.dragging.disable()
        if ((map as any).tap) (map as any).tap?.disable()
      }
      const addPoint = (clientX: number, clientY: number) => {
        if (!painting) return
        pts.push(eventToLatLng(container, clientX, clientY))
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        if (pts.length > 2) {
          drawLayerRef.current = L.polygon(pts, { color: '#10b981', weight: 2, fillOpacity: 0.12, fillColor: '#10b981', dashArray: '4 4' })
          fg.addLayer(drawLayerRef.current)
        }
      }
      const finishPainting = () => {
        if (!painting) return
        painting = false
        map.dragging.enable()
        if ((map as any).tap) (map as any).tap?.enable()
        if (pts.length < 3) { clearDrawing(); return }
        fg.clearLayers()
        drawLayerRef.current = L.polygon(pts, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
        fg.addLayer(drawLayerRef.current)
        finalizeArea({ type: 'lasso', coordinates: pts.map(p => [p.lat, p.lng]), area: Math.round(calcPolyArea(pts) * 100) / 100 })
      }

      /* Mouse */
      const onMouseDown = (e: MouseEvent) => { if (e.button !== 0) return; startPainting(e.clientX, e.clientY) }
      const onMouseMove = (e: MouseEvent) => { addPoint(e.clientX, e.clientY) }
      const onMouseUp = () => { finishPainting() }

      /* Touch */
      const onTouchStart = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; startPainting(t.clientX, t.clientY) }
      const onTouchMove = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; addPoint(t.clientX, t.clientY) }
      const onTouchEnd = (e: TouchEvent) => { e.preventDefault(); finishPainting() }

      container.addEventListener('mousedown', onMouseDown)
      container.addEventListener('mousemove', onMouseMove)
      container.addEventListener('mouseup', onMouseUp)
      container.addEventListener('touchstart', onTouchStart, { passive: false })
      container.addEventListener('touchmove', onTouchMove, { passive: false })
      container.addEventListener('touchend', onTouchEnd, { passive: false })

      modeCleanupRef.current = () => {
        container.removeEventListener('mousedown', onMouseDown)
        container.removeEventListener('mousemove', onMouseMove)
        container.removeEventListener('mouseup', onMouseUp)
        container.removeEventListener('touchstart', onTouchStart)
        container.removeEventListener('touchmove', onTouchMove)
        container.removeEventListener('touchend', onTouchEnd)
        map.dragging.enable()
        if ((map as any).tap) (map as any).tap?.enable()
      }
    }

    /* ── RETTANGOLO (mouse + touch drag) ────────────────────────────────── */
    if (drawMode === 'rect') {
      let start: L.LatLng | null = null
      let active = false

      const startRect = (clientX: number, clientY: number) => {
        start = eventToLatLng(container, clientX, clientY)
        active = true
        fg.clearLayers()
        drawLayerRef.current = null
        map.dragging.disable()
        if ((map as any).tap) (map as any).tap?.disable()
      }
      const moveRect = (clientX: number, clientY: number) => {
        if (!active || !start) return
        const end = eventToLatLng(container, clientX, clientY)
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        drawLayerRef.current = L.rectangle([[start.lat, start.lng], [end.lat, end.lng]] as L.LatLngBoundsLiteral, { color: '#10b981', weight: 2.5, fillOpacity: 0.12, fillColor: '#10b981' })
        fg.addLayer(drawLayerRef.current)
      }
      const finishRect = (clientX: number, clientY: number) => {
        if (!active || !start) return
        active = false
        map.dragging.enable()
        if ((map as any).tap) (map as any).tap?.enable()
        const end = eventToLatLng(container, clientX, clientY)
        const bounds = L.latLngBounds(start, end)
        const w = Math.abs(bounds.getEast() - bounds.getWest())
        const h = Math.abs(bounds.getNorth() - bounds.getSouth())
        if (w < 0.001 || h < 0.001) { clearDrawing(); return }
        const coords: [number, number][] = [
          [bounds.getNorth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()],
          [bounds.getSouth(), bounds.getEast()], [bounds.getSouth(), bounds.getWest()],
        ]
        finalizeArea({ type: 'rectangle', coordinates: coords, area: Math.round(w * 111 * h * 111 * 100) / 100 })
      }

      const onMouseDown = (e: MouseEvent) => { if (e.button !== 0) return; startRect(e.clientX, e.clientY) }
      const onMouseMove = (e: MouseEvent) => { moveRect(e.clientX, e.clientY) }
      const onMouseUp   = (e: MouseEvent) => { finishRect(e.clientX, e.clientY) }
      const onTouchStart = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; startRect(t.clientX, t.clientY) }
      const onTouchMove  = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; moveRect(t.clientX, t.clientY) }
      const onTouchEnd   = (e: TouchEvent) => { e.preventDefault(); const t = e.changedTouches[0]; finishRect(t.clientX, t.clientY) }

      container.addEventListener('mousedown', onMouseDown)
      container.addEventListener('mousemove', onMouseMove)
      container.addEventListener('mouseup', onMouseUp)
      container.addEventListener('touchstart', onTouchStart, { passive: false })
      container.addEventListener('touchmove', onTouchMove, { passive: false })
      container.addEventListener('touchend', onTouchEnd, { passive: false })

      modeCleanupRef.current = () => {
        container.removeEventListener('mousedown', onMouseDown)
        container.removeEventListener('mousemove', onMouseMove)
        container.removeEventListener('mouseup', onMouseUp)
        container.removeEventListener('touchstart', onTouchStart)
        container.removeEventListener('touchmove', onTouchMove)
        container.removeEventListener('touchend', onTouchEnd)
        map.dragging.enable()
        if ((map as any).tap) (map as any).tap?.enable()
      }
    }

    /* ── POLIGONO (tap per vertici, doppio tap per chiudere) ─────────────── */
    if (drawMode === 'polygon') {
      const pts: L.LatLng[] = []
      let previewLine: L.Polyline | null = null
      let lastClickTime = 0
      let closing = false

      map.doubleClickZoom.disable()

      const addVertex = (latlng: L.LatLng) => {
        if (closing) return
        const now = Date.now()
        if (now - lastClickTime < 350 && pts.length >= 3) {
          // Doppio tap → chiudi poligono
          closing = true
          map.off('click', onMapClick)
          map.off('mousemove', onMapMove)
          if (previewLine) { fg.removeLayer(previewLine); previewLine = null }
          fg.clearLayers()
          drawLayerRef.current = L.polygon(pts, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
          fg.addLayer(drawLayerRef.current)
          finalizeArea({ type: 'polygon', coordinates: pts.map(p => [p.lat, p.lng]), area: Math.round(calcPolyArea(pts) * 100) / 100 })
          return
        }
        lastClickTime = now
        pts.push(latlng)
        L.circleMarker(latlng, { radius: 6, color: '#10b981', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(fg)
        if (previewLine) { fg.removeLayer(previewLine); previewLine = null }
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        if (pts.length >= 3) {
          drawLayerRef.current = L.polygon(pts, { color: '#10b981', weight: 2.5, fillOpacity: 0.12, fillColor: '#10b981' })
          fg.addLayer(drawLayerRef.current)
        } else if (pts.length === 2) {
          previewLine = L.polyline(pts, { color: '#10b981', weight: 2, dashArray: '4 4' })
          fg.addLayer(previewLine)
        }
      }

      const onMapClick = (e: L.LeafletMouseEvent) => { addVertex(e.latlng) }
      const onMapMove  = (e: L.LeafletMouseEvent) => {
        if (!pts.length) return
        if (previewLine) { fg.removeLayer(previewLine); previewLine = null }
        previewLine = L.polyline([pts[pts.length - 1], e.latlng], { color: '#10b981', weight: 1.5, dashArray: '4 4', opacity: 0.6 })
        fg.addLayer(previewLine)
      }

      /* Touch tap — intercettiamo touchend brevi come "tap" */
      let touchStartTime = 0
      let touchStartPos: L.LatLng | null = null
      const onTouchStart = (e: TouchEvent) => {
        touchStartTime = Date.now()
        const t = e.touches[0]
        touchStartPos = eventToLatLng(container, t.clientX, t.clientY)
      }
      const onTouchEnd = (e: TouchEvent) => {
        const elapsed = Date.now() - touchStartTime
        const t = e.changedTouches[0]
        const endPos = eventToLatLng(container, t.clientX, t.clientY)
        // Tap breve (< 250ms) e non spostato troppo → vertice
        if (elapsed < 250 && touchStartPos) {
          const dist = map.distance(touchStartPos, endPos)
          if (dist < 20) {
            e.preventDefault()
            addVertex(endPos)
          }
        }
      }

      map.on('click', onMapClick)
      map.on('mousemove', onMapMove)
      container.addEventListener('touchstart', onTouchStart, { passive: true })
      container.addEventListener('touchend', onTouchEnd, { passive: false })

      modeCleanupRef.current = () => {
        map.off('click', onMapClick)
        map.off('mousemove', onMapMove)
        map.doubleClickZoom.enable()
        container.removeEventListener('touchstart', onTouchStart)
        container.removeEventListener('touchend', onTouchEnd)
        if (previewLine) { fg.removeLayer(previewLine); previewLine = null }
      }
    }

    /* ── TOUCH RECT: tap angolo 1 → tap angolo 2 → rettangolo ─────────── */
    if (drawMode === 'touch_rect') {
      let corner1: L.LatLng | null = null
      let marker1: L.CircleMarker | null = null
      let previewRect: L.Rectangle | null = null

      const onTap = (e: L.LeafletMouseEvent) => {
        if (!corner1) {
          // Primo tap → imposta angolo 1
          corner1 = e.latlng
          marker1 = L.circleMarker(corner1, { radius: 8, color: '#10b981', weight: 3, fillColor: '#10b981', fillOpacity: 0.8 })
          fg.addLayer(marker1)
        } else {
          // Secondo tap → completa rettangolo
          const corner2 = e.latlng
          if (previewRect) { fg.removeLayer(previewRect); previewRect = null }
          const bounds = L.latLngBounds(corner1, corner2)
          const w = Math.abs(bounds.getEast() - bounds.getWest())
          const h = Math.abs(bounds.getNorth() - bounds.getSouth())
          if (w < 0.0005 || h < 0.0005) {
            fg.clearLayers(); corner1 = null; marker1 = null; return
          }
          fg.clearLayers()
          drawLayerRef.current = L.rectangle([[corner1.lat, corner1.lng], [corner2.lat, corner2.lng]] as L.LatLngBoundsLiteral, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
          fg.addLayer(drawLayerRef.current)
          const coords: [number, number][] = [
            [bounds.getNorth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()],
            [bounds.getSouth(), bounds.getEast()], [bounds.getSouth(), bounds.getWest()],
          ]
          finalizeArea({ type: 'rectangle', coordinates: coords, area: Math.round(w * 111 * h * 111 * 100) / 100 })
          corner1 = null; marker1 = null
        }
      }

      const onMove = (e: L.LeafletMouseEvent) => {
        if (!corner1) return
        if (previewRect) { fg.removeLayer(previewRect) }
        previewRect = L.rectangle([[corner1.lat, corner1.lng], [e.latlng.lat, e.latlng.lng]] as L.LatLngBoundsLiteral, { color: '#10b981', weight: 1.5, fillOpacity: 0.06, fillColor: '#10b981', dashArray: '4 4' })
        fg.addLayer(previewRect)
      }

      map.on('click', onTap)
      map.on('mousemove', onMove)

      /* Touch: intercetta touchend come tap su mappa */
      let tStart = 0
      let tPos: L.LatLng | null = null
      const onTouchStart = (e: TouchEvent) => {
        tStart = Date.now()
        const t = e.touches[0]
        tPos = eventToLatLng(container, t.clientX, t.clientY)
      }
      const onTouchEnd = (e: TouchEvent) => {
        const elapsed = Date.now() - tStart
        if (elapsed < 300 && tPos) {
          const t = e.changedTouches[0]
          const endPos = eventToLatLng(container, t.clientX, t.clientY)
          const dist = map.distance(tPos, endPos)
          if (dist < 15) {
            e.preventDefault()
            onTap({ latlng: endPos } as L.LeafletMouseEvent)
          }
        }
      }

      container.addEventListener('touchstart', onTouchStart, { passive: true })
      container.addEventListener('touchend', onTouchEnd, { passive: false })

      modeCleanupRef.current = () => {
        map.off('click', onTap)
        map.off('mousemove', onMove)
        container.removeEventListener('touchstart', onTouchStart)
        container.removeEventListener('touchend', onTouchEnd)
        if (previewRect) fg.removeLayer(previewRect)
        fg.clearLayers()
      }
    }

    return () => { modeCleanupRef.current?.(); modeCleanupRef.current = null }
  }, [drawMode, map, clearDrawing, finalizeArea, onDrawStart, onDrawEnd])

  return null
}

/* ─── Props ─────────────────────────────────────────────────────────────── */
interface MapComponentProps {
  mapStyle?: MapStyleKey
  drawMode?: 'lasso' | 'rect' | 'polygon' | 'touch_rect' | null
  onAreaDrawn?: (area: DrawnArea) => void
  onDrawStart?: () => void
  onDrawEnd?: () => void
  searchResult?: { lat: number; lon: number; address: string } | null
  savedAnalyses?: AnalysisResult[]
}

/* ─── Main export ───────────────────────────────────────────────────────── */
export const MapComponent = forwardRef<MapHandle, MapComponentProps>(function MapComponent(
  { mapStyle = 'street', drawMode = null, onAreaDrawn, onDrawStart, onDrawEnd, searchResult, savedAnalyses = [] },
  ref
) {
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const clearDrawingRef = useRef<(() => void) | null>(null)

  useImperativeHandle(ref, () => ({
    clearDrawing: () => clearDrawingRef.current?.(),
    zoomIn:  () => mapInstanceRef.current?.zoomIn(),
    zoomOut: () => mapInstanceRef.current?.zoomOut(),
  }))

  const onMapReady = useCallback((m: L.Map) => {
    mapInstanceRef.current = m
    m.getContainer().style.cursor = 'grab'
    m.on('mousedown', () => { if (m.dragging.enabled()) m.getContainer().style.cursor = 'grabbing' })
    m.on('mouseup',   () => { if (m.dragging.enabled()) m.getContainer().style.cursor = 'grab' })
  }, [])

  if (!isClient) return (
    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
      <div className="animate-pulse text-slate-400">Caricamento mappa...</div>
    </div>
  )

  return (
    <MapContainer
      center={[41.9028, 12.4964]}
      zoom={6}
      className="w-full h-full z-0"
      zoomControl={false}
    >
      <TileLayerSwitcher mapStyle={mapStyle} />
      <MapControllerInner searchResult={searchResult} onMapReady={onMapReady} />
      <DrawController
        drawMode={drawMode}
        onAreaDrawn={onAreaDrawn}
        onDrawStart={onDrawStart}
        onDrawEnd={onDrawEnd}
        clearDrawingRef={clearDrawingRef}
      />
      <SavedAreasLayer analyses={savedAnalyses} />
      {searchResult && (
        <Marker position={[searchResult.lat, searchResult.lon]}>
          <Popup>
            <div className="text-sm"><strong>{searchResult.address.split(',').slice(0, 2).join(', ')}</strong></div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  )
})
