'use client'

import React, { useRef, useImperativeHandle, forwardRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polygon } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix icone
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})
L.Marker.prototype.options.icon = icon

export const MapComponent = forwardRef(({ mapStyle, drawMode, onAreaDrawn, searchResult, savedAnalyses }: any, ref: any) => {
  const mapRef = useRef<any>(null)

  const tiles: any = {
    street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    topo: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  }

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lon: number, zoom = 13) => mapRef.current?.flyTo([lat, lon], zoom),
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    clearDrawing: () => {},
  }))

  return (
    <MapContainer
      center={[41.9028, 12.4964]}
      zoom={6}
      className="h-full w-full"
      whenCreated={(map) => { mapRef.current = map }}
    >
      <TileLayer url={tiles[mapStyle]} attribution="© OpenStreetMap" />
      
      {searchResult && (
        <Marker position={[searchResult.lat, searchResult.lon]}>
          <Popup>{searchResult.address}</Popup>
        </Marker>
      )}

      {savedAnalyses?.map((a: any) => (
        a.coordinates?.length > 0 && (
          <Polygon key={a.id} positions={a.coordinates} pathOptions={{ color: '#6366f1', fillOpacity: 0.2 }}>
            <Popup>{a.title}</Popup>
          </Polygon>
        )
      ))}
    </MapContainer>
  )
})

MapComponent.displayName = 'MapComponent'
