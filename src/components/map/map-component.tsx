'use client'

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon, Rectangle, CircleMarker, useMap } from 'react-leaflet'
import { DrawnArea } from '@/lib/types'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { toast } from 'sonner'

const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})
L.Marker.prototype.options.icon = icon

export type MapStyleKey = 'street' | 'satellite' | 'topo'

export interface MapHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void
  zoomIn: () => void
  zoomOut: () => void
  clearDrawing: () => void
}

interface MapComponentProps {
  mapStyle: MapStyleKey
  drawMode: 'lasso' | 'rect' | 'polygon' | null
  onAreaDrawn: (area: DrawnArea) => void
  onMapStyleChange: (style: MapStyleKey) => void
  onSearchSelect: (lat: number, lon: number, address: string) => void
  onDrawStart: () => void
  onDrawEnd: () => void
  searchResult: { lat: number; lon: number; address: string } | null
  savedAnalyses: any[]
}

function MapEvents({ 
  drawMode, onAreaDrawn, onDrawStart, onDrawEnd, searchResult, savedAnalyses 
}: { 
  drawMode: 'lasso' | 'rect' | 'polygon' | null
  onAreaDrawn: (area: DrawnArea) => void
  onDrawStart: () => void
  onDrawEnd: () => void
  searchResult: { lat: number; lon: number; address: string } | null
  savedAnalyses: any[]
}) {
  const map = useMap()
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([])
  const [lassoPoints, setLassoPoints] = useState<[number, number][]>([])
  const [isDrawingLasso, setIsDrawingLasso] = useState(false)
  const [rectangle, setRectangle] = useState<{latLngs: L.LatLngBounds} | null>(null)

  useEffect(() => {
    if (drawMode === 'polygon') {
      map.doubleClickZoom.disable()
    } else {
      map.doubleClickZoom.enable()
    }
    return () => {
      map.doubleClickZoom.enable()
    }
  }, [drawMode, map])

  useEffect(() => {
    if (!drawMode) {
      setPolygonPoints([])
      setLassoPoints([])
      setRectangle(null)
      setIsDrawingLasso(false)
    }
  }, [drawMode])

  useEffect(() => {
    if (searchResult) {
      map.flyTo([searchResult.lat, searchResult.lon], 13, { duration: 1.5 })
    }
  }, [searchResult, map])

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    if (drawMode !== 'polygon') return
    onDrawStart()
    
    const { lat, lng } = e.latlng
    const newPoint: [number, number] = [lat, lng]
    
    if (polygonPoints.length === 0) {
      setPolygonPoints([newPoint])
    } else {
      const lastPoint = polygonPoints[polygonPoints.length - 1]
      const distance = Math.sqrt(
        Math.pow(lat - lastPoint[0], 2) + Math.pow(lng - lastPoint[1], 2)
      )
      
      if (distance < 0.0001 && polygonPoints.length > 2) {
        finalizePolygon()
      } else {
        setPolygonPoints([...polygonPoints, newPoint])
      }
    }
  }

  const finalizePolygon = () => {
    if (polygonPoints.length < 3) return
    
    const area = calculatePolygonArea(polygonPoints)
    onAreaDrawn({
      type: 'polygon',
      coordinates: polygonPoints,
      area,
    })
    setPolygonPoints([])
    onDrawEnd()
    toast('Poligono creato con successo')
  }

  const handleMapMousemove = (e: L.LeafletMouseEvent) => {
    if (drawMode !== 'lasso' || !isDrawingLasso) return
    const { lat, lng } = e.latlng
    setLassoPoints(prev => [...prev, [lat, lng]])
  }

  const handleMapMousedown = () => {
    if (drawMode !== 'lasso') return
    setIsDrawingLasso(true)
    setLassoPoints([])
    onDrawStart()
  }

  const handleMapMouseup = () => {
    if (drawMode !== 'lasso' || !isDrawingLasso) return
    setIsDrawingLasso(false)
    
    if (lassoPoints.length > 2) {
      const area = calculatePolygonArea(lassoPoints)
      onAreaDrawn({
        type: 'lasso',
        coordinates: lassoPoints,
        area,
      })
      setLassoPoints([])
      onDrawEnd()
      toast('Zona libera creata con successo')
    }
  }

  const handleMapMouseDownRect = (e: L.LeafletMouseEvent) => {
    if (drawMode !== 'rect') return
    onDrawStart()
    const start = e.latlng
    const moveHandler = (moveEvent: L.LeafletMouseEvent) => {
      const bounds = L.latLngBounds(start, moveEvent.latlng)
      setRectangle({ latLngs: bounds })
    }
    const upHandler = () => {
      map.off('mousemove', moveHandler)
      map.off('mouseup', upHandler)
      if (rectangle) {
        const bounds = rectangle.latLngs
        const area = calculateRectangleArea(bounds)
        onAreaDrawn({
          type: 'rectangle',
          coordinates: [
            [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
            [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
          ],
          area,
        })
        setRectangle(null)
        onDrawEnd()
        toast('Rettangolo creato con successo')
      }
    }
    map.on('mousemove', moveHandler)
    map.on('mouseup', upHandler)
  }

  function calculatePolygonArea(points: [number, number][]) {
    let area = 0
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length
      area += points[i][1] * points[j][0]
      area -= points[j][1] * points[i][0]
    }
    area = Math.abs(area) / 2
    return area * 0.0001
  }

  function calculateRectangleArea(bounds: L.LatLngBounds) {
    const latDiff = Math.abs(bounds.getNorth() - bounds.getSouth())
    const lngDiff = Math.abs(bounds.getEast() - bounds.getWest())
    return (latDiff * 111) * (lngDiff * 111 * Math.cos(bounds.getCenter().lat * Math.PI / 180)) / 1000000
  }

  useEffect(() => {
    if (drawMode === 'rect') {
      map.on('mousedown', handleMapMouseDownRect)
    }
    return () => {
      map.off('mousedown', handleMapMouseDownRect)
    }
  }, [drawMode, map])

  return (
    <>
      {drawMode === 'polygon' && (
        <>
          <Polygon 
            positions={polygonPoints} 
            pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.3 }} 
          />
          {polygonPoints.length > 0 && (
            <CircleMarker 
              center={polygonPoints[0]} 
              radius={6} 
              pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 1 }} 
            />
          )}
        </>
      )}
      
      {drawMode === 'lasso' && isDrawingLasso && (
        <Polygon 
          positions={lassoPoints} 
          pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.3, dashArray: '5,5' }} 
        />
      )}
      
      {drawMode === 'rect' && rectangle && (
        <Rectangle 
          bounds={rectangle.latLngs} 
          pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.3 }} 
        />
      )}

      {searchResult && (
        <Marker position={[searchResult.lat, searchResult.lon]}>
          <Popup>{searchResult.address}</Popup>
        </Marker>
      )}

      {savedAnalyses.map((a: any) => (
        a.coordinates?.length > 0 && (
          <Polygon
            key={a.id}
            positions={a.coordinates}
            pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.2 }}
          >
            <Popup>{a.title}</Popup>
          </Polygon>
        )
      ))}

      {drawMode === 'polygon' && <div onClick={handleMapClick} className="absolute inset-0 z-[400]" style={{ pointerEvents: 'auto' }} />}
      {drawMode === 'lasso' && (
        <div 
          onMouseDown={handleMapMousedown}
          onMouseMove={handleMapMousemove}
          onMouseUp={handleMapMouseup}
          className="absolute inset-0 z-[400]"
          style={{ pointerEvents: 'auto' }}
        />
      )}
    </>
  )
}

export const MapComponent = forwardRef<MapHandle, MapComponentProps>(({
  mapStyle, drawMode, onAreaDrawn, onMapStyleChange, onSearchSelect,
  onDrawStart, onDrawEnd, searchResult, savedAnalyses
}, ref) => {
  const mapRef = useRef<L.Map | null>(null)

  const tiles: Record<MapStyleKey, string> = {
    street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    topo: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  }

  const attribution: Record<MapStyleKey, string> = {
    street: '© OpenStreetMap',
    satellite: '© ESRI',
    topo: '© OpenTopoMap',
  }

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lon, zoom = 13) => {
      mapRef.current?.flyTo([lat, lon], zoom, { duration: 1.5 })
    },
    zoomIn: () => {
      mapRef.current?.zoomIn()
    },
    zoomOut: () => {
      mapRef.current?.zoomOut()
    },
    clearDrawing: () => {
      window.dispatchEvent(new CustomEvent('gb-clear-drawing'))
    },
  }))

  useEffect(() => {
    const handler = () => {
      onDrawEnd()
    }
    window.addEventListener('gb-clear-drawing', handler)
    return () => window.removeEventListener('gb-clear-drawing', handler)
  }, [onDrawEnd])

  return (
    <MapContainer
      center={[41.9028, 12.4964]}
      zoom={6}
      className="h-full w-full"
      whenCreated={(map) => { mapRef.current = map }}
    >
      <TileLayer url={tiles[mapStyle]} attribution={attribution[mapStyle]} />
      <MapEvents
        drawMode={drawMode}
        onAreaDrawn={onAreaDrawn}
        onDrawStart={onDrawStart}
        onDrawEnd={onDrawEnd}
        searchResult={searchResult}
        savedAnalyses={savedAnalyses}
      />
    </MapContainer>
  )
})

MapComponent.displayName = 'MapComponent'
