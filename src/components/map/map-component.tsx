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
  street:    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri, DigitalGlobe, GeoEye', maxZoom: 19 },
  topo:      { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',              attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>', maxZoom: 17 },
} as const
export type MapStyleKey = keyof typeof TILE_LAYERS

/* ─── Public handle (per clearDrawing da fuori) ─────────────────────────── */
export interface MapHandle {
  clearDrawing: () => void
  zoomIn: () => void
  zoomOut: () => void
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */
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

/* ─── MapController: fly to + expose handle ────────────────────────────── */
function MapControllerInner(
  { searchResult, onMapReady }: {
    searchResult?: { lat: number; lon: number } | null
    onMapReady: (m: L.Map) => void
  }
) {
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
 * Comportamenti corretti:
 * - drawMode null  → cursore grab/manina, mappa scrollabile normalmente
 * - drawMode rect  → al PRIMO click inizia il rettangolo, trascina per dimensionarlo,
 *                    al mouseup finalizza
 * - drawMode polygon → ogni click aggiunge un vertice, doppio click chiude
 * - drawMode lasso → tieni premuto e trascina
 * - clearDrawingRef → espone una funzione per cancellare il layer disegnato dall'esterno
 */
function DrawController({
  drawMode,
  onAreaDrawn,
  onDrawStart,
  onDrawEnd,
  clearDrawingRef,
}: {
  drawMode: 'lasso' | 'rect' | 'polygon' | null
  onAreaDrawn?: (area: DrawnArea) => void
  onDrawStart?: () => void
  onDrawEnd?: () => void
  clearDrawingRef: React.MutableRefObject<(() => void) | null>
}) {
  const map = useMap()
  const fgRef = useRef<L.FeatureGroup | null>(null)
  const drawLayerRef = useRef<L.Layer | null>(null)
  const modeCleanupRef = useRef<(() => void) | null>(null)

  /* Crea feature group una volta sola */
  useEffect(() => {
    fgRef.current = L.featureGroup().addTo(map)
    return () => { fgRef.current?.remove() }
  }, [map])

  /* clearDrawing: cancella solo il layer disegnato, NON cambia drawMode */
  const clearDrawing = useCallback(() => {
    fgRef.current?.clearLayers()
    drawLayerRef.current = null
  }, [])

  /* Esponi clearDrawing al componente padre via ref */
  useEffect(() => {
    clearDrawingRef.current = clearDrawing
  }, [clearDrawing, clearDrawingRef])

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

  /* Aggiorna cursore in base alla modalità */
  useEffect(() => {
    const container = map.getContainer()
    if (drawMode) {
      container.style.cursor = drawMode === 'lasso' ? 'crosshair' : 'crosshair'
    } else {
      container.style.cursor = 'grab'
    }
  }, [map, drawMode])

  /* Gestione draw modes */
  useEffect(() => {
    /* Pulizia setup precedente */
    modeCleanupRef.current?.()
    modeCleanupRef.current = null
    clearDrawing()
    map.dragging.enable()

    if (!drawMode) return

    onDrawStart?.()
    const fg = fgRef.current!
    const container = map.getContainer()

    /* ── LASSO ──────────────────────────────────────────────────────────── */
    if (drawMode === 'lasso') {
      let painting = false
      const pts: L.LatLng[] = []

      const onDown = (e: MouseEvent) => {
        if (e.button !== 0) return
        painting = true
        pts.length = 0
        fg.clearLayers()
        drawLayerRef.current = null
        map.dragging.disable()
        container.style.cursor = 'crosshair'
      }
      const onMove = (e: MouseEvent) => {
        if (!painting) return
        const r = container.getBoundingClientRect()
        pts.push(map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top)))
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        if (pts.length > 2) {
          drawLayerRef.current = L.polygon(pts, {
            color: '#10b981', weight: 2, fillOpacity: 0.12, fillColor: '#10b981', dashArray: '4 4'
          })
          fg.addLayer(drawLayerRef.current)
        }
      }
      const onUp = () => {
        if (!painting) return
        painting = false
        map.dragging.enable()
        container.style.cursor = 'crosshair'
        if (pts.length < 3) { clearDrawing(); return }
        fg.clearLayers()
        drawLayerRef.current = L.polygon(pts, {
          color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981'
        })
        fg.addLayer(drawLayerRef.current)
        finalizeArea({
          type: 'lasso',
          coordinates: pts.map(p => [p.lat, p.lng]),
          area: Math.round(calcPolyArea(pts) * 100) / 100,
        })
      }
      container.addEventListener('mousedown', onDown)
      container.addEventListener('mousemove', onMove)
      container.addEventListener('mouseup', onUp)
      modeCleanupRef.current = () => {
        container.removeEventListener('mousedown', onDown)
        container.removeEventListener('mousemove', onMove)
        container.removeEventListener('mouseup', onUp)
        map.dragging.enable()
      }
    }

    /* ── RETTANGOLO ─────────────────────────────────────────────────────── */
    if (drawMode === 'rect') {
      let start: L.LatLng | null = null
      let active = false

      /**
       * Il rettangolo inizia al PRIMO click (mousedown) e si ridimensiona
       * trascinando. Al mouseup viene finalizzato.
       */
      const onDown = (e: MouseEvent) => {
        if (e.button !== 0) return
        const r = container.getBoundingClientRect()
        start = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))
        active = true
        fg.clearLayers()
        drawLayerRef.current = null
        map.dragging.disable()
      }
      const onMove = (e: MouseEvent) => {
        if (!active || !start) return
        const r = container.getBoundingClientRect()
        const end = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        drawLayerRef.current = L.rectangle([start, end], {
          color: '#10b981', weight: 2.5, fillOpacity: 0.12, fillColor: '#10b981'
        })
        fg.addLayer(drawLayerRef.current)
      }
      const onUp = (e: MouseEvent) => {
        if (!active || !start) return
        active = false
        map.dragging.enable()
        const r = container.getBoundingClientRect()
        const end = map.containerPointToLatLng(L.point(e.clientX - r.left, e.clientY - r.top))
        const bounds = L.latLngBounds(start, end)
        const w = Math.abs(bounds.getEast() - bounds.getWest())
        const h = Math.abs(bounds.getNorth() - bounds.getSouth())
        if (w < 0.001 || h < 0.001) { clearDrawing(); return }
        const coords: [number, number][] = [
          [bounds.getNorth(), bounds.getWest()],
          [bounds.getNorth(), bounds.getEast()],
          [bounds.getSouth(), bounds.getEast()],
          [bounds.getSouth(), bounds.getWest()],
        ]
        finalizeArea({
          type: 'rectangle',
          coordinates: coords,
          area: Math.round(w * 111 * h * 111 * 100) / 100,
        })
      }
      container.addEventListener('mousedown', onDown)
      container.addEventListener('mousemove', onMove)
      container.addEventListener('mouseup', onUp)
      modeCleanupRef.current = () => {
        container.removeEventListener('mousedown', onDown)
        container.removeEventListener('mousemove', onMove)
        container.removeEventListener('mouseup', onUp)
        map.dragging.enable()
      }
    }

    /* ── POLIGONO ───────────────────────────────────────────────────────── */
    if (drawMode === 'polygon') {
      const pts: L.LatLng[] = []
      let previewLine: L.Polyline | null = null

      /* Click aggiunge vertice */
      const onClick = (e: L.LeafletMouseEvent) => {
        pts.push(e.latlng)
        /* Marcatore vertice */
        L.circleMarker(e.latlng, {
          radius: 5, color: '#10b981', weight: 2, fillColor: '#fff', fillOpacity: 1
        }).addTo(fg)
        /* Aggiorna poligono preview */
        if (previewLine) { fg.removeLayer(previewLine); previewLine = null }
        if (drawLayerRef.current) fg.removeLayer(drawLayerRef.current)
        if (pts.length >= 3) {
          drawLayerRef.current = L.polygon(pts, {
            color: '#10b981', weight: 2.5, fillOpacity: 0.12, fillColor: '#10b981'
          })
          fg.addLayer(drawLayerRef.current)
        } else if (pts.length === 2) {
          previewLine = L.polyline(pts, { color: '#10b981', weight: 2, dashArray: '4 4' })
          fg.addLayer(previewLine)
        }
      }

      /* Mousemove: linea guida verso cursore */
      const onMove = (e: L.LeafletMouseEvent) => {
        if (!pts.length) return
        if (previewLine) { fg.removeLayer(previewLine); previewLine = null }
        previewLine = L.polyline([pts[pts.length - 1], e.latlng], {
          color: '#10b981', weight: 1.5, dashArray: '4 4', opacity: 0.6
        })
        fg.addLayer(previewLine)
      }

      /* Doppio click chiude */
      const onDbl = (e: L.LeafletMouseEvent) => {
        // Previeni l'aggiunta di un vertice extra dal doppio click
        e.originalEvent.preventDefault()
        map.off('click', onClick)
        map.off('mousemove', onMove)
        map.off('dblclick', onDbl)
        if (previewLine) { fg.removeLayer(previewLine); previewLine = null }
        /* Rimuovi l'ultimo punto aggiunto dal secondo click del dblclick */
        if (pts.length > 3) pts.pop()
        if (pts.length < 3) { clearDrawing(); return }
        fg.clearLayers()
        drawLayerRef.current = L.polygon(pts, {
          color: '#10b981', weight: 2.5, fillOpacity: 0.2, fillColor: '#10b981'
        })
        fg.addLayer(drawLayerRef.current)
        finalizeArea({
          type: 'polygon',
          coordinates: pts.map(p => [p.lat, p.lng]),
          area: Math.round(calcPolyArea(pts) * 100) / 100,
        })
      }
      map.on('click', onClick)
      map.on('mousemove', onMove)
      map.on('dblclick', onDbl)
      modeCleanupRef.current = () => {
        map.off('click', onClick)
        map.off('mousemove', onMove)
        map.off('dblclick', onDbl)
        if (previewLine) { fg.removeLayer(previewLine); previewLine = null }
      }
    }

    return () => {
      modeCleanupRef.current?.()
      modeCleanupRef.current = null
    }
  }, [drawMode, map, clearDrawing, finalizeArea, onDrawStart, onDrawEnd])

  return null
}

/* ─── Props ─────────────────────────────────────────────────────────────── */
interface MapComponentProps {
  mapStyle?: MapStyleKey
  drawMode?: 'lasso' | 'rect' | 'polygon' | null
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

  /* Esponi handle al parent */
  useImperativeHandle(ref, () => ({
    clearDrawing: () => clearDrawingRef.current?.(),
    zoomIn:  () => mapInstanceRef.current?.zoomIn(),
    zoomOut: () => mapInstanceRef.current?.zoomOut(),
  }))

  const onMapReady = useCallback((m: L.Map) => {
    mapInstanceRef.current = m
    /* Cursore manina di default */
    m.getContainer().style.cursor = 'grab'
    m.on('mousedown', () => { if (m.dragging.enabled()) m.getContainer().style.cursor = 'grabbing' })
    m.on('mouseup',   () => { if (m.dragging.enabled()) m.getContainer().style.cursor = 'grab' })
  }, [])

  if (!isClient) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Caricamento mappa...</div>
      </div>
    )
  }

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
            <div className="text-sm">
              <strong>{searchResult.address.split(',').slice(0, 2).join(', ')}</strong>
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  )
})
