'use client'

import React from 'react'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { SearchBar } from '@/components/map/search-bar'
import { UserPanel, UserButton, addHistoryEntry, loadSettings, UserSettings, DEFAULT_SETTINGS } from '@/components/user/user-panel'
import { SavedSidebar } from '@/components/user/saved-sidebar'
import { DrawnArea, Search as SearchType } from '@/lib/types'
import { MapStyleKey } from '@/components/map/map-component'
import { Menu, Trash2, Save, Check, X, MapPin, SquareDashedBottom } from 'lucide-react'
import { toast } from 'sonner'

const MapComponent = dynamic(
  () => import('@/components/map/map-component').then(m => m.MapComponent),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Caricamento mappa...</div>
      </div>
    ),
  }
)

const SAVED_KEY = 'gb_searches'

function loadSaved(): SearchType[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') } catch { return [] }
}

function persistSaved(s: SearchType[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(s))
}

function formatArea(km2: number, unit: 'km2' | 'ha') {
  if (unit === 'ha') return `${(km2 * 100).toFixed(1)} ha`
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`
}

export function DashboardPage() {
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('street')
  const [drawMode, setDrawMode] = useState<'lasso' | 'rect' | 'polygon' | null>(null)
  const [searchResult, setSearchResult] = useState<{ lat: number; lon: number; address: string } | null>(null)
  const [drawnArea, setDrawnArea] = useState<DrawnArea | null>(null)
  const [savedSearches, setSavedSearches] = useState<SearchType[]>([])
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveDesc, setSaveDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [userPanelOpen, setUserPanelOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    setSavedSearches(loadSaved())
    const s = loadSettings()
    setSettings(s)
    setMapStyle(s.defaultMap)
  }, [])

  // ESC per uscire dalla modalità disegno
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrawMode(null); setIsDrawing(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSearchSelect = useCallback((lat: number, lon: number, address: string) => {
    setSearchResult({ lat, lon, address })
    addHistoryEntry('search', address.split(',').slice(0, 2).join(', '))
  }, [])

  const handleAreaDrawn = useCallback((area: DrawnArea) => {
    setDrawnArea(area)
    setDrawMode(null)
    setShowSaveForm(false)
    addHistoryEntry('area', `Area ${area.type === 'rectangle' ? 'rettangolare' : 'disegnata'} — ${formatArea(area.area, settings.unit)}`)
  }, [settings.unit])

  const toggleDrawMode = (mode: 'lasso' | 'rect' | 'polygon') => {
    setDrawMode(prev => prev === mode ? null : mode)
    setDrawnArea(null)
    setShowSaveForm(false)
  }

  const clearAll = () => {
    setDrawMode(null)
    setDrawnArea(null)
    setSearchResult(null)
    setShowSaveForm(false)
    setSaveTitle('')
    setSaveDesc('')
  }

  const handleSave = async () => {
    if (!saveTitle.trim()) return
    setSaving(true)
    const newSearch: SearchType = {
      id: Date.now().toString(),
      user_id: 'demo',
      title: saveTitle.trim(),
      description: saveDesc.trim() || undefined,
      address: searchResult?.address,
      latitude: searchResult?.lat,
      longitude: searchResult?.lon,
      area_geojson: drawnArea
        ? JSON.stringify({ coordinates: drawnArea.coordinates, type: drawnArea.type, area: drawnArea.area })
        : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const next = [newSearch, ...savedSearches]
    setSavedSearches(next)
    persistSaved(next)
    addHistoryEntry('save', saveTitle.trim())
    setSaveTitle('')
    setSaveDesc('')
    setShowSaveForm(false)
    setSaving(false)
    toast.success('Ricerca salvata con successo')
  }

  const handleDeleteSaved = (id: string) => {
    const next = savedSearches.filter(s => s.id !== id)
    setSavedSearches(next)
    persistSaved(next)
    toast.error('Ricerca eliminata')
  }

  const handleFocusSaved = (s: SearchType) => {
    if (s.latitude && s.longitude) {
      setSearchResult({ lat: s.latitude, lon: s.longitude, address: s.address || s.title })
    }
    setSidebarOpen(false)
  }

  const showPanel = !!(searchResult || drawnArea)

  const drawInstructions: Record<string, string> = {
    lasso: 'Tieni premuto e trascina per tracciare la zona liberamente',
    rect: 'Clicca e trascina per disegnare il rettangolo',
    polygon: 'Clicca i vertici — doppio click per chiudere il poligono',
  }

  const mapStyleLabels: Record<MapStyleKey, string> = { street: 'Mappa', satellite: 'Satellite', topo: 'Topo' }

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-slate-100">

      {/* MAP */}
      <div className="absolute inset-0">
        <MapComponent
          mapStyle={mapStyle}
          drawMode={drawMode}
          onAreaDrawn={handleAreaDrawn}
          onDrawStart={() => setIsDrawing(true)}
          onDrawEnd={() => setIsDrawing(false)}
          searchResult={searchResult}
          savedAreas={savedSearches}
        />
      </div>

      {/* TOP BAR */}
      <header className="absolute top-4 left-4 right-4 z-20 flex items-center gap-2 pointer-events-none">
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="w-12 h-12 rounded-full bg-white shadow-md hover:shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all pointer-events-auto flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex-1 max-w-xl pointer-events-auto">
          <SearchBar onSearchSelect={handleSearchSelect} />
        </div>

        {/* Map style buttons */}
        <div className="bg-white rounded-full shadow-md p-1 flex gap-0.5 pointer-events-auto">
          {(['street', 'satellite', 'topo'] as MapStyleKey[]).map(style => (
            <button
              key={style}
              onClick={() => setMapStyle(style)}
              className={`h-10 px-3 rounded-full text-xs font-medium transition-all ${mapStyle === style ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {mapStyleLabels[style]}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto flex-shrink-0">
          <UserButton onClick={() => setUserPanelOpen(o => !o)} unreadNotifs={3} />
        </div>
      </header>

      {/* Draw instructions banner */}
      {drawMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur text-white px-5 py-2.5 rounded-full text-sm flex items-center gap-3 shadow-xl pointer-events-none">
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          {drawInstructions[drawMode]}
          <kbd className="bg-white/15 rounded px-2 py-0.5 text-xs font-mono">ESC</kbd>
          <span className="text-white/50 text-xs">per annullare</span>
        </div>
      )}

      {/* Draw tools (sinistra) */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
        {([
          ['lasso', 'Zona libera', <svg key="l" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z"/><path d="M8 12a4 4 0 108 0 4 4 0 00-8 0"/></svg>],
          ['rect', 'Rettangolo', <svg key="r" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>],
          ['polygon', 'Poligono', <svg key="p" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/></svg>],
        ] as [string, string, React.ReactNode][]).map(([mode, label, icon]) => (
          <div key={mode} className="relative group">
            <button
              onClick={() => toggleDrawMode(mode as 'lasso' | 'rect' | 'polygon')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all shadow-sm ${drawMode === mode ? 'bg-emerald-500 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-600'}`}
            >
              {icon}
            </button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {label}
            </div>
          </div>
        ))}

        <div className="h-px bg-slate-200 mx-1 my-0.5" />

        <div className="relative group">
          <button
            onClick={clearAll}
            className="w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            Cancella tutto
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className={`absolute right-4 top-20 z-20 w-[300px] transition-all duration-200 ${showPanel ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}>
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm">Area Selezionata</h3>
            <button onClick={clearAll} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {searchResult && (
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Indirizzo</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{searchResult.address.split(',').slice(0, 2).join(', ')}</p>
                </div>
              </div>
            )}
            {drawnArea && (
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <SquareDashedBottom className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Superficie stimata</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                      {formatArea(drawnArea.area, settings.unit)}
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {!showSaveForm ? (
            <div className="px-4 pb-4">
              <button
                onClick={() => setShowSaveForm(true)}
                className="w-full h-9 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" /> Salva Ricerca
              </button>
            </div>
          ) : (
            <div className="border-t border-slate-100 p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Titolo</label>
                <input
                  value={saveTitle}
                  onChange={e => setSaveTitle(e.target.value)}
                  placeholder="Es. Zona industriale Milano"
                  className="w-full h-9 border border-slate-200 rounded-lg px-3 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Note (opzionale)</label>
                <textarea
                  value={saveDesc}
                  onChange={e => setSaveDesc(e.target.value)}
                  placeholder="Descrizione aggiuntiva..."
                  className="w-full h-16 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSaveForm(false)}
                  className="flex-1 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSave}
                  disabled={!saveTitle.trim() || saving}
                  className="flex-1 h-9 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Check className="w-4 h-4" /> Salva
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-slate-900/85 backdrop-blur text-white px-5 py-2 rounded-full text-xs flex items-center gap-2 shadow-lg pointer-events-none">
        <span className={`w-1.5 h-1.5 rounded-full ${isDrawing ? 'bg-amber-400 animate-pulse' : drawnArea || searchResult ? 'bg-emerald-400' : 'bg-emerald-400 animate-pulse'}`} />
        {isDrawing
          ? 'Disegno in corso...'
          : drawnArea
          ? `Zona selezionata · ${formatArea(drawnArea.area, settings.unit)}`
          : searchResult
          ? "Posizione trovata · traccia un'area per l'analisi"
          : "Traccia un'area o cerca un indirizzo per iniziare"}
      </div>

      {/* Saved Sidebar */}
      <SavedSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        searches={savedSearches}
        onFocus={handleFocusSaved}
        onDelete={handleDeleteSaved}
        unit={settings.unit}
      />

      {/* User Panel */}
      <UserPanel
        open={userPanelOpen}
        onClose={() => setUserPanelOpen(false)}
        savedCount={savedSearches.length}
        onSettingsChange={s => { setSettings(s); setMapStyle(s.defaultMap) }}
      />
    </div>
  )
}
