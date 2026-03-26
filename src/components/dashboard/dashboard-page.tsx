'use client'

import React, { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Menu, Plus, Minus, X, Trash2, Satellite, SquareDashedBottom } from 'lucide-react'
import { toast } from 'sonner'
import { loadSettings, DEFAULT_SETTINGS, addHistoryEntry } from '@/components/user/user-panel'
import { Sidebar } from '@/components/navigation/Sidebar'
import { runMockAnalysis, saveAnalysis, loadAllAnalyses } from '@/lib/analysis-engine'

const MapComponent = dynamic(
  () => import('@/components/map/map-component').then(m => m.MapComponent),
  { ssr: false, loading: () => <div className="h-full w-full bg-slate-100" /> }
)

const SearchBar = dynamic(
  () => import('@/components/map/search-bar').then(m => m.SearchBar),
  { ssr: false, loading: () => <div className="h-10 w-64 bg-white rounded-xl" /> }
)

export function DashboardPage() {
  const router = useRouter()
  const mapRef = useRef<any>(null)
  
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite' | 'topo'>('street')
  const [drawMode, setDrawMode] = useState<'lasso' | 'rect' | 'polygon' | null>(null)
  const [searchResult, setSearchResult] = useState<any>(null)
  const [drawnArea, setDrawnArea] = useState<any>(null)
  const [analyses, setAnalyses] = useState<any[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    setSettings(loadSettings())
    setAnalyses(loadAllAnalyses())
  }, [])

  const handleSearchSelect = (lat: number, lon: number, address: string) => {
    setSearchResult({ lat, lon, address })
    addHistoryEntry('search', address)
    mapRef.current?.flyTo(lat, lon, 13)
  }

  const handleAreaDrawn = (area: any) => {
    setDrawnArea(area)
    setDrawMode(null)
    setSearchResult(null)
    addHistoryEntry('area', `Area ${area.type}`)
  }

  const toggleDrawMode = (mode: 'lasso' | 'rect' | 'polygon') => {
    setDrawMode(drawMode === mode ? null : mode)
    setDrawnArea(null)
    setSearchResult(null)
    mapRef.current?.clearDrawing()
  }

  const handleClearDrawing = () => {
    setDrawnArea(null)
    setSearchResult(null)
    setDrawMode(null)
    mapRef.current?.clearDrawing()
    toast('Area cancellata')
  }

  const handleStartAnalysis = async (title: string, startDate: string, endDate: string) => {
    if (!drawnArea) return
    setShowModal(false)
    try {
      const result = await runMockAnalysis({ title, drawnArea, startDate, endDate })
      saveAnalysis(result)
      setAnalyses(prev => [result, ...prev])
      toast.success('Analisi completata!')
      router.push(`/analysis/${result.id}`)
    } catch {
      toast.error('Errore analisi')
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      
      {/* MAPPA */}
      <MapComponent
        ref={mapRef}
        mapStyle={mapStyle}
        drawMode={drawMode}
        onAreaDrawn={handleAreaDrawn}
        onMapStyleChange={setMapStyle}
        onSearchSelect={handleSearchSelect}
        searchResult={searchResult}
        savedAnalyses={analyses}
      />

      {/* TOP BAR */}
      <div className="absolute top-4 left-4 right-4 z-50 flex items-center gap-3">
        <button 
          onClick={() => setSidebarOpen(true)}
          className="p-2.5 bg-white rounded-xl shadow-lg hover:bg-slate-50"
        >
          <Menu size={20} className="text-slate-700" />
        </button>
        
        <div className="flex-1 max-w-xl mx-auto">
          <SearchBar onSelect={handleSearchSelect} />
        </div>

        <div className="flex gap-2">
          {(['street', 'satellite', 'topo'] as const).map(style => (
            <button
              key={style}
              onClick={() => setMapStyle(style)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                mapStyle === style ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'
              }`}
            >
              {style === 'street' ? 'Mappa' : style === 'satellite' ? 'Satellite' : 'Topo'}
            </button>
          ))}
        </div>
      </div>

      {/* DRAW TOOLS - SINISTRA */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2">
        {(['lasso', 'rect', 'polygon'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => toggleDrawMode(mode)}
            className={`w-10 h-10 bg-white rounded-xl shadow-lg flex items-center justify-center ${
              drawMode === mode ? 'border-2 border-emerald-500' : ''
            }`}
          >
            <SquareDashedBottom size={18} className="text-slate-600" />
          </button>
        ))}
        <div className="w-10 h-px bg-slate-200 my-1" />
        <button
          onClick={handleClearDrawing}
          className="w-10 h-10 bg-white rounded-xl shadow-lg flex items-center justify-center"
        >
          <Trash2 size={18} className="text-slate-400" />
        </button>
      </div>

      {/* ZOOM - DESTRA IN BASSO */}
      <div className="absolute right-4 bottom-24 z-50 flex flex-col">
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="w-10 h-10 bg-white rounded-t-xl shadow-lg flex items-center justify-center text-lg font-bold"
        >
          <Plus size={20} />
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-10 h-10 bg-white rounded-b-xl shadow-lg flex items-center justify-center text-lg font-bold"
        >
          <Minus size={20} />
        </button>
      </div>

      {/* RIGHT PANEL */}
      {(searchResult || drawnArea) && (
        <div className="absolute right-4 top-24 z-50 w-80 bg-white rounded-2xl shadow-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Area Selezionata</h3>
            <button onClick={() => { setSearchResult(null); setDrawnArea(null); }}>
              <X size={16} className="text-slate-400" />
            </button>
          </div>
          {drawnArea && (
            <button
              onClick={() => setShowModal(true)}
              className="w-full h-11 bg-slate-900 text-white rounded-xl font-bold"
            >
              <Satellite size={16} className="inline mr-2" />
              Avvia Analisi
            </button>
          )}
        </div>
      )}

      {/* SIDEBAR */}
      <Sidebar 
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        analyses={analyses}
        unit={settings.unit}
        onFocus={() => {}}
        onOpen={(a: any) => router.push(`/analysis/${a.id}`)}
        onDelete={(id: string) => {
          const updated = analyses.filter(a => a.id !== id)
          setAnalyses(updated)
        }}
        onSettingsChange={(s: any) => { setSettings(s); setMapStyle(s.defaultMap) }}
      />

      {/* MODAL ANALISI */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Avvia Analisi</h2>
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 h-11 border rounded-xl">Annulla</button>
              <button onClick={() => handleStartAnalysis('Analisi', '2022-01-01', new Date().toISOString().slice(0,10))} className="flex-1 h-11 bg-emerald-500 text-white rounded-xl">Avvia</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
