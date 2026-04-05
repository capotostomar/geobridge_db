'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { AnalysisResult } from '@/lib/types'

interface ComparisonMapProps {
  analyses: AnalysisResult[]
  colors: { name: string; hex: string; bg: string; border: string; text: string; light: string }[]
}

export function ComparisonMap({ analyses, colors }: ComparisonMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current || analyses.length < 2) return

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    // Create map
    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    })

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)

    // Fit bounds to all areas
    const allCoords: L.LatLngExpression[] = []
    analyses.forEach(a => {
      a.coordinates.forEach(([lat, lng]) => {
        allCoords.push([lat, lng])
      })
    })

    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords)
      map.fitBounds(bounds, { padding: [40, 40] })
    }

    // Add polygons for each analysis
    analyses.forEach((analysis, index) => {
      const color = colors[index % colors.length]
      const polygonCoords: L.LatLngExpression[] = analysis.coordinates.map(
        ([lat, lng]) => [lat, lng] as L.LatLngExpression
      )

      if (polygonCoords.length < 3) return

      // Fill polygon
      const polygon = L.polygon(polygonCoords, {
        color: color.hex,
        fillColor: color.hex,
        fillOpacity: 0.25,
        weight: 3,
        dashArray: '0',
      }).addTo(map)

      // Border polygon (dashed outline)
      L.polygon(polygonCoords, {
        color: color.hex,
        fillColor: 'transparent',
        weight: 2,
        dashArray: '8, 6',
        opacity: 0.7,
      }).addTo(map)

      // Label with analysis info
      const center = polygon.getBounds().getCenter()

      // Custom marker
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            background: ${color.hex};
            color: white;
            padding: 4px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            font-family: system-ui, sans-serif;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 4px;
          ">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: white; opacity: 0.8;"></span>
            ${analysis.title}
            <span style="opacity: 0.8; font-weight: 400;">${analysis.compositeScore}/100</span>
          </div>
        `,
        iconSize: [200, 30],
        iconAnchor: [100, -10],
      })

      L.marker(center, { icon }).addTo(map)
    })

    // Legend as DOM overlay (avoids L.control TS issues)
    const legendDiv = document.createElement('div')
    legendDiv.style.cssText = 'position:absolute;top:10px;right:10px;z-index:1000;background:white;border-radius:12px;padding:12px 16px;box-shadow:0 4px 12px rgba(0,0,0,0.1);font-family:system-ui,sans-serif;font-size:12px;line-height:1.6;'
    legendDiv.innerHTML = `<div style="font-weight:600;margin-bottom:6px;color:#334155">Confronto Aree</div>${analyses.map((a, i) => `<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${colors[i % colors.length].hex}"></span><span style="color:#475569">${a.title}</span><span style="color:#94a3b8;font-size:11px">(${a.compositeLevel})</span></div>`).join('')}`
    mapRef.current?.appendChild(legendDiv)

    mapInstanceRef.current = map

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [analyses, colors])

  return (
    <div className="relative w-full h-[500px] rounded-b-lg overflow-hidden">
      <div ref={mapRef} className="absolute inset-0 z-0" />
    </div>
  )
}
