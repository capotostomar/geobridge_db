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
 * ARCHITETTURA DUE LAYER SEPARATI:
 *
 * previewFgRef  — feature group di LAVORO (vertici temporanei, guide, preview drag)
 *                 viene pulito ad ogni cambio di drawMode / nuova selezione
 *
 * confirmedFgRef — feature group CONFERMATO (il poligono/rettangolo finale)
 *                  persiste indipendentemente da drawMode; viene pulito SOLO
 *                  da clearDrawing() o quando l'utente avvia una nuova selezione
 *
 * Questo risolve il bug per cui il poligono spariva non appena drawMode → null.
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

  /* Layer temporaneo (preview mentre si disegna) */
  const previewFgRef = useRef<L.FeatureGroup | null>(null)
  /* Layer confermato (shape finale — persiste dopo drawMode→null) */
  const confirmedFgRef = useRef<L.FeatureGroup | null>(null)

  const modeCleanupRef = useRef<(() => void) | null>(null)

  /* Inizializza entrambi i feature group una volta sola */
  useEffect(() => {
    confirmedFgRef.current = L.featureGroup().addTo(map)
    previewFgRef.current   = L.featureGroup().addTo(map)
    return () => {
      confirmedFgRef.current?.remove()
      previewFgRef.current?.remove()
    }
  }, [map])

  /**
   * clearDrawing: cancella ENTRAMBI i layer.
   * Chiamato dall'utente tramite il cestino, o prima di iniziare una nuova area.
   */
  const clearDrawing = useCallback(() => {
    previewFgRef.current?.clearLayers()
    confirmedFgRef.current?.clearLayers()
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

  /**
   * finalizeArea: deposita la shape nel layer CONFERMATO e pulisce il preview.
   * Chiama onAreaDrawn per notificare il parent — ma NON tocca confirmedFg.
   */
  const finalizeArea = useCallback((area: DrawnArea, confirmedLayer: L.Layer) => {
    /* Pulisce il preview (vertici, linee guida, ecc.) */
    previewFgRef.current?.clearLayers()
    /* Aggiunge la shape finale al layer permanente */
    confirmedFgRef.current?.clearLayers()        // rimuove eventuale area precedente
    confirmedFgRef.current?.addLayer(confirmedLayer)
    onDrawEnd?.()
    onAreaDrawn?.(area)
  }, [onAreaDrawn, onDrawEnd])

  const eventToLatLng = (container: HTMLElement, clientX: number, clientY: number): L.LatLng => {
    const r = container.getBoundingClientRect()
    return map.containerPointToLatLng(L.point(clientX - r.left, clientY - r.top))
  }

  useEffect(() => {
    const container = map.getContainer()
    container.style.cursor = drawMode ? 'crosshair' : 'grab'
  }, [map, drawMode])

  useEffect(() => {
    /* Cleanup del mode precedente (listener, ecc.) ma NON tocca confirmedFg */
    modeCleanupRef.current?.()
    modeCleanupRef.current = null
    /* Pulisce solo il preview, non il confermato */
    previewFgRef.current?.clearLayers()
    map.dragging.enable()
    if ((map as any).tap) (map as any).tap.enable()

    if (!drawMode) return

    onDrawStart?.()
    const prevFg  = previewFgRef.current!
    const container = map.getContainer()

    /* ── LASSO ──────────────────────────────────────────────────────────── */
    if (drawMode === 'lasso') {
      let painting = false
      const pts: L.LatLng[] = []
      let previewLayer: L.Polygon | null = null

      const start = (cx: number, cy: number) => {
        painting = true; pts.length = 0
        prevFg.clearLayers(); previewLayer = null
        map.dragging.disable()
        if ((map as any).tap) (map as any).tap.disable()
      }
      const move = (cx: number, cy: number) => {
        if (!painting) return
        pts.push(eventToLatLng(container, cx, cy))
        if (previewLayer) prevFg.removeLayer(previewLayer)
        if (pts.length > 2) {
          previewLayer = L.polygon(pts, { color: '#10b981', weight: 2, fillOpacity: 0.12, fillColor: '#10b981', dashArray: '4 4' })
          prevFg.addLayer(previewLayer)
        }
      }
      const finish = () => {
        if (!painting) return
        painting = false
        map.dragging.enable()
        if ((map as any).tap) (map as any).tap.enable()
        if (pts.length < 3) { prevFg.clearLayers(); return }
        const confirmed = L.polygon(pts, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
        finalizeArea(
          { type: 'lasso', coordinates: pts.map(p => [p.lat, p.lng]), area: Math.round(calcPolyArea(pts) * 100) / 100 },
          confirmed
        )
      }

      const onMD = (e: MouseEvent) => { if (e.button === 0) start(e.clientX, e.clientY) }
      const onMM = (e: MouseEvent) => move(e.clientX, e.clientY)
      const onMU = () => finish()
      const onTS = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; start(t.clientX, t.clientY) }
      const onTM = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; move(t.clientX, t.clientY) }
      const onTE = (e: TouchEvent) => { e.preventDefault(); finish() }

      container.addEventListener('mousedown', onMD)
      container.addEventListener('mousemove', onMM)
      container.addEventListener('mouseup', onMU)
      container.addEventListener('touchstart', onTS, { passive: false })
      container.addEventListener('touchmove', onTM, { passive: false })
      container.addEventListener('touchend', onTE, { passive: false })

      modeCleanupRef.current = () => {
        container.removeEventListener('mousedown', onMD)
        container.removeEventListener('mousemove', onMM)
        container.removeEventListener('mouseup', onMU)
        container.removeEventListener('touchstart', onTS)
        container.removeEventListener('touchmove', onTM)
        container.removeEventListener('touchend', onTE)
        map.dragging.enable()
        if ((map as any).tap) (map as any).tap.enable()
      }
    }

    /* ── RETTANGOLO DRAG ────────────────────────────────────────────────── */
    if (drawMode === 'rect') {
      let startPt: L.LatLng | null = null
      let active = false
      let previewRect: L.Rectangle | null = null

      const startR = (cx: number, cy: number) => {
        startPt = eventToLatLng(container, cx, cy); active = true
        prevFg.clearLayers(); previewRect = null
        map.dragging.disable()
        if ((map as any).tap) (map as any).tap.disable()
      }
      const moveR = (cx: number, cy: number) => {
        if (!active || !startPt) return
        const end = eventToLatLng(container, cx, cy)
        if (previewRect) prevFg.removeLayer(previewRect)
        previewRect = L.rectangle([[startPt.lat, startPt.lng], [end.lat, end.lng]] as L.LatLngBoundsLiteral, { color: '#10b981', weight: 2.5, fillOpacity: 0.12, fillColor: '#10b981' })
        prevFg.addLayer(previewRect)
      }
      const finishR = (cx: number, cy: number) => {
        if (!active || !startPt) return
        active = false
        map.dragging.enable()
        if ((map as any).tap) (map as any).tap.enable()
        const end = eventToLatLng(container, cx, cy)
        const bounds = L.latLngBounds(startPt, end)
        const w = Math.abs(bounds.getEast() - bounds.getWest())
        const h = Math.abs(bounds.getNorth() - bounds.getSouth())
        if (w < 0.001 || h < 0.001) { prevFg.clearLayers(); return }
        const confirmed = L.rectangle([[startPt.lat, startPt.lng], [end.lat, end.lng]] as L.LatLngBoundsLiteral, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
        const coords: [number, number][] = [
          [bounds.getNorth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()],
          [bounds.getSouth(), bounds.getEast()], [bounds.getSouth(), bounds.getWest()],
        ]
        finalizeArea({ type: 'rectangle', coordinates: coords, area: Math.round(w * 111 * h * 111 * 100) / 100 }, confirmed)
      }

      const onMD = (e: MouseEvent) => { if (e.button === 0) startR(e.clientX, e.clientY) }
      const onMM = (e: MouseEvent) => moveR(e.clientX, e.clientY)
      const onMU = (e: MouseEvent) => finishR(e.clientX, e.clientY)
      const onTS = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; startR(t.clientX, t.clientY) }
      const onTM = (e: TouchEvent) => { e.preventDefault(); const t = e.touches[0]; moveR(t.clientX, t.clientY) }
      const onTE = (e: TouchEvent) => { e.preventDefault(); const t = e.changedTouches[0]; finishR(t.clientX, t.clientY) }

      container.addEventListener('mousedown', onMD)
      container.addEventListener('mousemove', onMM)
      container.addEventListener('mouseup', onMU)
      container.addEventListener('touchstart', onTS, { passive: false })
      container.addEventListener('touchmove', onTM, { passive: false })
      container.addEventListener('touchend', onTE, { passive: false })

      modeCleanupRef.current = () => {
        container.removeEventListener('mousedown', onMD)
        container.removeEventListener('mousemove', onMM)
        container.removeEventListener('mouseup', onMU)
        container.removeEventListener('touchstart', onTS)
        container.removeEventListener('touchmove', onTM)
        container.removeEventListener('touchend', onTE)
        map.dragging.enable()
        if ((map as any).tap) (map as any).tap.enable()
      }
    }

    /* ── POLIGONO (tap + doppio tap) ────────────────────────────────────── */
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
          closing = true
          map.off('click', onMapClick)
          map.off('mousemove', onMapMove)
          if (previewLine) { prevFg.removeLayer(previewLine); previewLine = null }
          prevFg.clearLayers()
          const confirmed = L.polygon(pts, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
          finalizeArea(
            { type: 'polygon', coordinates: pts.map(p => [p.lat, p.lng]), area: Math.round(calcPolyArea(pts) * 100) / 100 },
            confirmed
          )
          return
        }
        lastClickTime = now
        pts.push(latlng)
        L.circleMarker(latlng, { radius: 6, color: '#10b981', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(prevFg)
        if (previewLine) { prevFg.removeLayer(previewLine); previewLine = null }
        if (pts.length >= 3) {
          const poly = L.polygon(pts, { color: '#10b981', weight: 2, fillOpacity: 0.08, fillColor: '#10b981', dashArray: '4 2' })
          prevFg.addLayer(poly)
        } else if (pts.length === 2) {
          previewLine = L.polyline(pts, { color: '#10b981', weight: 2, dashArray: '4 4' })
          prevFg.addLayer(previewLine)
        }
      }

      const onMapClick = (e: L.LeafletMouseEvent) => addVertex(e.latlng)
      const onMapMove  = (e: L.LeafletMouseEvent) => {
        if (!pts.length) return
        if (previewLine) { prevFg.removeLayer(previewLine); previewLine = null }
        previewLine = L.polyline([pts[pts.length - 1], e.latlng], { color: '#10b981', weight: 1.5, dashArray: '4 4', opacity: 0.6 })
        prevFg.addLayer(previewLine)
      }

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
        if (elapsed < 250 && touchStartPos && map.distance(touchStartPos, endPos) < 20) {
          e.preventDefault()
          addVertex(endPos)
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
        if (previewLine) prevFg.removeLayer(previewLine)
      }
    }

    /* ── TOUCH RECT (2 tap) ─────────────────────────────────────────────── */
    if (drawMode === 'touch_rect') {
      let corner1: L.LatLng | null = null
      let marker1: L.CircleMarker | null = null
      let previewRect: L.Rectangle | null = null

      const onTap = (e: L.LeafletMouseEvent) => {
        if (!corner1) {
          corner1 = e.latlng
          marker1 = L.circleMarker(corner1, { radius: 9, color: '#10b981', weight: 3, fillColor: '#10b981', fillOpacity: 0.8 })
          prevFg.addLayer(marker1)
          /* Pulse animation hint */
          const hint = L.circleMarker(corner1, { radius: 18, color: '#10b981', weight: 1.5, fillColor: 'transparent', opacity: 0.4 })
          prevFg.addLayer(hint)
          setTimeout(() => { try { prevFg.removeLayer(hint) } catch {} }, 800)
        } else {
          const corner2 = e.latlng
          if (previewRect) { prevFg.removeLayer(previewRect); previewRect = null }
          const bounds = L.latLngBounds(corner1, corner2)
          const w = Math.abs(bounds.getEast() - bounds.getWest())
          const h = Math.abs(bounds.getNorth() - bounds.getSouth())
          if (w < 0.0005 || h < 0.0005) { prevFg.clearLayers(); corner1 = null; return }
          const confirmed = L.rectangle([[corner1.lat, corner1.lng], [corner2.lat, corner2.lng]] as L.LatLngBoundsLiteral, { color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981' })
          const coords: [number, number][] = [
            [bounds.getNorth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()],
            [bounds.getSouth(), bounds.getEast()], [bounds.getSouth(), bounds.getWest()],
          ]
          finalizeArea({ type: 'rectangle', coordinates: coords, area: Math.round(w * 111 * h * 111 * 100) / 100 }, confirmed)
          corner1 = null
        }
      }

      const onMove = (e: L.LeafletMouseEvent) => {
        if (!corner1) return
        if (previewRect) prevFg.removeLayer(previewRect)
        previewRect = L.rectangle([[corner1.lat, corner1.lng], [e.latlng.lat, e.latlng.lng]] as L.LatLngBoundsLiteral, { color: '#10b981', weight: 1.5, fillOpacity: 0.06, fillColor: '#10b981', dashArray: '4 4' })
        prevFg.addLayer(previewRect)
      }

      let tStart = 0; let tPos: L.LatLng | null = null
      const onTouchStart = (e: TouchEvent) => { tStart = Date.now(); const t = e.touches[0]; tPos = eventToLatLng(container, t.clientX, t.clientY) }
      const onTouchEnd = (e: TouchEvent) => {
        const elapsed = Date.now() - tStart
        if (elapsed < 300 && tPos) {
          const t = e.changedTouches[0]; const endPos = eventToLatLng(container, t.clientX, t.clientY)
          if (map.distance(tPos, endPos) < 15) { e.preventDefault(); onTap({ latlng: endPos } as L.LeafletMouseEvent) }
        }
      }

      map.on('click', onTap)
      map.on('mousemove', onMove)
      container.addEventListener('touchstart', onTouchStart, { passive: true })
      container.addEventListener('touchend', onTouchEnd, { passive: false })

      modeCleanupRef.current = () => {
        map.off('click', onTap)
        map.off('mousemove', onMove)
        container.removeEventListener('touchstart', onTouchStart)
        container.removeEventListener('touchend', onTouchEnd)
        if (previewRect) try { prevFg.removeLayer(previewRect) } catch {}
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
    <MapContainer center={[41.9028, 12.4964]} zoom={6} className="w-full h-full z-0" zoomControl={false}>
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
