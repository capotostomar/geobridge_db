'use client'

import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import { MapContainer, TileLayer, useMap, Marker, Popup, Polygon } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, DrawnArea } from '@/lib/types'

// Fix for default marker icon
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

L.Marker.prototype.options.icon = defaultIcon

interface MapComponentProps {
  onAreaDrawn?: (area: DrawnArea) => void
  onSearchSelect?: (lat: number, lon: number, address: string) => void
  searchResult?: { lat: number; lon: number; address: string } | null
  savedAreas?: Search[]
}

function MapController({ searchResult }: { 
  searchResult?: { lat: number; lon: number; address: string } | null
}) {
  const map = useMap()

  useEffect(() => {
    if (searchResult) {
      map.flyTo([searchResult.lat, searchResult.lon], 15, {
        duration: 1.5
      })
    }
  }, [searchResult, map])

  return null
}

// Custom draw controls without react-leaflet-draw
function DrawController({ onAreaDrawn }: { onAreaDrawn?: (area: DrawnArea) => void }) {
  const map = useMap()
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const isDrawingRef = useRef(false)

  useEffect(() => {
    // Create a feature group for drawn items
    drawnItemsRef.current = new L.FeatureGroup()
    drawnItemsRef.current.addTo(map)

    // Custom draw control
    const drawControl = L.control({
      position: 'topright'
    })

    drawControl.onAdd = function() {
      const div = L.DomUtil.create('div', 'leaflet-draw-toolbar')
      div.innerHTML = `
        <div class="flex flex-col gap-1 bg-white rounded-lg shadow-lg p-1">
          <button id="draw-rect" class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors" title="Disegna rettangolo">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
          </button>
          <button id="draw-polygon" class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors" title="Disegna poligono">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
            </svg>
          </button>
          <button id="clear-draw" class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors" title="Cancella disegno">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `
      return div
    }

    drawControl.addTo(map)

    // Rectangle drawing
    let rectangle: L.Rectangle | null = null
    let startPoint: L.LatLng | null = null

    const startRectangle = (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current) return
      startPoint = e.latlng
      rectangle = L.rectangle([[startPoint.lat, startPoint.lng], [startPoint.lat, startPoint.lng]], {
        color: '#10b981',
        weight: 3,
        fillOpacity: 0.2,
        fillColor: '#10b981'
      })
      rectangle.addTo(drawnItemsRef.current!)
    }

    const updateRectangle = (e: L.LeafletMouseEvent) => {
      if (!rectangle || !startPoint || !isDrawingRef.current) return
      rectangle.setBounds([
        [startPoint.lat, startPoint.lng],
        [e.latlng.lat, e.latlng.lng]
      ])
    }

    const endRectangle = () => {
      if (!rectangle || !isDrawingRef.current) return
      isDrawingRef.current = false
      
      const bounds = rectangle.getBounds()
      const area: DrawnArea = {
        type: 'rectangle',
        coordinates: [
          [bounds.getSouth(), bounds.getWest()],
          [bounds.getNorth(), bounds.getEast()]
        ],
        area: Math.round(calculateArea(bounds) * 100) / 100
      }
      
      onAreaDrawn?.(area)
      map.dragging.enable()
    }

    // Polygon drawing
    const polygonPoints: L.LatLng[] = []
    let polygon: L.Polygon | null = null
    let polygonMarkers: L.Marker[] = []

    const drawPolygonPoint = (e: L.LeafletMouseEvent) => {
      if (!isDrawingRef.current) return
      
      polygonPoints.push(e.latlng)
      
      // Add marker
      const marker = L.marker(e.latlng, { icon: defaultIcon })
      marker.addTo(drawnItemsRef.current!)
      polygonMarkers.push(marker)
      
      // Update or create polygon
      if (polygonPoints.length >= 3) {
        if (polygon) {
          polygon.setLatLngs(polygonPoints)
        } else {
          polygon = L.polygon(polygonPoints, {
            color: '#10b981',
            weight: 3,
            fillOpacity: 0.2,
            fillColor: '#10b981'
          })
          polygon.addTo(drawnItemsRef.current!)
        }
      }
    }

    const finishPolygon = () => {
      if (polygonPoints.length < 3 || !polygon) {
        clearDrawing()
        return
      }
      
      isDrawingRef.current = false
      
      const area: DrawnArea = {
        type: 'polygon',
        coordinates: polygonPoints.map(ll => [ll.lat, ll.lng]),
        area: Math.round(calculatePolygonArea(polygonPoints) * 100) / 100
      }
      
      onAreaDrawn?.(area)
      map.dragging.enable()
    }

    const clearDrawing = () => {
      if (drawnItemsRef.current) {
        drawnItemsRef.current.clearLayers()
      }
      polygonPoints.length = 0
      polygon = null
      rectangle = null
      polygonMarkers = []
      isDrawingRef.current = false
      map.dragging.enable()
    }

    // Calculate area in km²
    const calculateArea = (bounds: L.LatLngBounds): number => {
      const width = Math.abs(bounds.getEast() - bounds.getWest()) * 111
      const height = Math.abs(bounds.getNorth() - bounds.getSouth()) * 111
      return width * height
    }

    const calculatePolygonArea = (points: L.LatLng[]): number => {
      if (points.length < 3) return 0
      let area = 0
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length
        area += points[i].lng * points[j].lat
        area -= points[j].lng * points[i].lat
      }
      return Math.abs(area / 2) * 111 * 111
    }

    // Event handlers
    const handleRectClick = () => {
      isDrawingRef.current = true
      map.dragging.disable()
      map.once('mousedown', startRectangle)
      map.on('mousemove', updateRectangle)
      map.once('mouseup', endRectangle)
    }

    const handlePolygonClick = () => {
      isDrawingRef.current = true
      map.dragging.disable()
      map.on('click', drawPolygonPoint)
      map.once('dblclick', () => {
        map.off('click', drawPolygonPoint)
        finishPolygon()
      })
    }

    const handleClearClick = clearDrawing

    // Add click handlers
    document.getElementById('draw-rect')?.addEventListener('click', handleRectClick)
    document.getElementById('draw-polygon')?.addEventListener('click', handlePolygonClick)
    document.getElementById('clear-draw')?.addEventListener('click', handleClearClick)

    return () => {
      document.getElementById('draw-rect')?.removeEventListener('click', handleRectClick)
      document.getElementById('draw-polygon')?.removeEventListener('click', handlePolygonClick)
      document.getElementById('clear-draw')?.removeEventListener('click', handleClearClick)
      map.off('mousedown')
      map.off('mousemove')
      map.off('mouseup')
      map.off('click')
      drawControl.remove()
    }
  }, [map, onAreaDrawn])

  return null
}

export function MapComponent({ onAreaDrawn, onSearchSelect, searchResult, savedAreas = [] }: MapComponentProps) {
  const mapRef = useRef<L.Map | null>(null)
  
  // Check if we're on client side
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

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
      ref={mapRef}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <MapController searchResult={searchResult} />
      <DrawController onAreaDrawn={onAreaDrawn} />
      
      {/* Search result marker */}
      {searchResult && (
        <Marker position={[searchResult.lat, searchResult.lon]}>
          <Popup>
            <div className="text-sm">
              <strong>{searchResult.address}</strong>
            </div>
          </Popup>
        </Marker>
      )}
      
      {/* Saved areas */}
      {savedAreas.map((area, idx) => {
        if (area.area_geojson) {
          try {
            const geo = JSON.parse(area.area_geojson)
            return (
              <Polygon
                key={area.id || idx}
                positions={geo.coordinates}
                pathOptions={{
                  color: '#6366f1',
                  fillColor: '#6366f1',
                  fillOpacity: 0.3
                }}
              >
                <Popup>{area.title}</Popup>
              </Polygon>
            )
          } catch {
            return null
          }
        }
        return null
      })}
    </MapContainer>
  )
}
