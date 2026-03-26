'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { SearchBar } from '@/components/map/search-bar'
import { Sidebar } from '@/components/navigation/Sidebar'
import { 
  loadSettings, UserSettings, DEFAULT_SETTINGS,
  addHistoryEntry 
} from '@/components/user/user-panel'
import { DrawnArea, AnalysisResult } from '@/lib/types'
import { MapStyleKey, MapHandle } from '@/components/map/map-component'
import { runMockAnalysis, saveAnalysis, loadAllAnalyses } from '@/lib/analysis-engine'
import {
  Menu, Trash2, X, SquareDashedBottom,
  Satellite, Plus, Minus, CheckCircle
} from 'lucide-react'
import { toast } from 'sonner'

/* ─── Dynamic import mappa (no SSR) ──────────────────────────────────────── */
const MapComponent = dynamic(
  () => import('@/components/map/map-component').then(m => m.MapComponent),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    ),
  }
)

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function formatArea(km2: number, unit: 'km2' | 'ha') {
  if (unit === 'ha') return `${(km2 * 100).toFixed(1)} ha`
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`
}

/* ─── Modal avvio analisi ─────────────────────────────────────────────────── */
function AnalysisModal({
  open, drawnArea, address, unit, onClose, onStart,
}: {
  open: boolean
  drawnArea: DrawnArea | null
  address?: string
  unit: 'km2' | 'ha'
  onClose: () => void
  onStart: (title: string, startDate: string, endDate: string) => void
}) {
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('2022-01-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    if (open && address) setTitle(address.split(',').slice(0, 2).join(', '))
  }, [open, address])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Avvia Analisi Rischio</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
            <Satellite size={14} />
            <span>Indici NDVI · NDMI · NBR · NDBI · BREI · DOPI [dati simulati]</span>
          </div>

          {drawnArea && (
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
              <p className="text-xs font-medium text-emerald-800">Area selezionata</p>
              <p className="text-sm text-emerald-900">
                {drawnArea.type === 'rectangle' ? 'Rettangolo' : drawnArea.type === 'lasso' ? 'Zona libera' : 'Poligono'}
                {' · '}
                {formatArea(drawnArea.area, unit)}
              </p>
            </div>
          )}

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Es. Zona industriale Milano Nord"
            className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Inizio</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm outline-none focus:border-emerald-400 transition-all"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Fine</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm outline-none focus:border-emerald-400 transition-all"
              />
            </div>
          </div>

          <div className="text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
            ⚠️ Dati simulati. In produzione vengono usate immagini Sentinel-2 reali via GeoSync.
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-11 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={() => onStart(title || 'Analisi senza titolo', startDate, endDate)}
            disabled={!drawnArea}
            className="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            Avvia
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Processing overlay ──────────────────────────────────────────────────── */
function ProcessingOverlay({ open, title }: { open: boolean; title: string }) {
  const steps = [
    'Recupero immagini Sentinel-2…',
    'Calcolo indici NDVI e NDMI…',
    'Analisi NBR e rischio incendio…',
    'Calcolo NDBI e BREI…',
    'Composizione rischio finale…',
    'Generazione report…',
  ]
  const [stepIdx, setStepIdx] = useState(0)
  
  useEffect(() => {
    if (!open) { setStepIdx(0); return }
    const iv = setInterval(() => setStepIdx(i => (i < steps.length - 1 ? i + 1 : i)), 500)
    return () => clearInterval(iv)
  }, [open])
  
  if (!open) return null
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-500 border-t-transparent" />
          <h3 className="font-semibold text-slate-800">{title}</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">Analisi in corso…</p>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-center gap-2 text-sm ${i <= stepIdx ? 'text-slate-700' : 'text-slate-300'}`}>
              {i < stepIdx && <CheckCircle size={14} className="text-emerald-500" />}
              {i === stepIdx && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
              {i > stepIdx && <div className="w-2 h-2 rounded-full bg-slate-200" />}
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Dashboard principale ────────────────────────────────────────────────── */
export function DashboardPage() {
  const router = useRouter()
  const mapRef = useRef<MapHandle>(null)

  const [mapStyle, setMapStyle] = useState<MapStyleKey>('street')
  const [drawMode, setDrawMode] = useState<'lasso' | 'rect' | 'polygon' | null>(null)
  const [searchResult, setSearchResult] = useState<{ lat: number; lon: number; address: string } | null>(null)
  const [drawnArea, setDrawnArea] = useState<DrawnArea | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [showModal, setShowModal] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingTitle, setProcessingTitle] = useState('')

  /* Init */
  useEffect(() => {
    const s = loadSettings()
    setSettings(s)
    setMapStyle(s.defaultMap)
    setAnalyses(loadAllAnalyses())
  }, [])

  /* ESC annulla modalità di disegno */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawMode(null)
        setIsDrawing(false)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  /* ── Handler ricerca ──────────────────────────────────────────────────── */
  const handleSearchSelect = useCallback((lat: number, lon: number, address: string) => {
    setSearchResult({ lat, lon, address })
    setDrawnArea(null)
    addHistoryEntry('search', address.split(',').slice(0, 2).join(', '))
    if (mapRef.current) {
      mapRef.current.flyTo(lat, lon, 13)
    }
  }, [])

  /* ── Handler area disegnata ───────────────────────────────────────────── */
  const handleAreaDrawn = useCallback((area: DrawnArea) => {
    setDrawnArea(area)
    setDrawMode(null)
    setIsDrawing(false)
    setSearchResult(null)
    addHistoryEntry('area', `Area ${area.type} · ${formatArea(area.area, 'km2')}`)
  }, [])

  /* ── Toggle draw mode ─────────────────────────────────────────────────── */
  const toggleDrawMode = (mode: 'lasso' | 'rect' | 'polygon') => {
    if (drawMode === mode) {
      setDrawMode(null)
      setIsDrawing(false)
    } else {
      setDrawnArea(null)
      setSearchResult(null)
      mapRef.current?.clearDrawing()
      setDrawMode(mode)
    }
  }

  /* ── Cestino: cancella area disegnata ─────────────────────────────────── */
  const handleClearDrawing = () => {
    setDrawnArea(null)
    setSearchResult(null)
    setDrawMode(null)
    setIsDrawing(false)
    mapRef.current?.clearDrawing()
    toast('Area cancellata')
  }

  /* ── Avvia analisi ────────────────────────────────────────────────────── */
  const handleStartAnalysis = async (title: string, startDate: string, endDate: string) => {
    if (!drawnArea) return
    setShowModal(false)
    setProcessing(true)
    setProcessingTitle(title)
    try {
      const result = await runMockAnalysis({
        title,
        address: searchResult?.address,
        drawnArea,
        startDate,
        endDate,
      })
      saveAnalysis(result)
      addHistoryEntry('save', `Analisi: ${title} · Rischio ${result.compositeLevel} (${result.compositeScore}/100)`)
      setAnalyses(prev => [result, ...prev])
      setProcessing(false)
      toast.success('Analisi completata!')
      setTimeout(() => router.push(`/analysis/${result.id}`), 500)
    } catch {
      setProcessing(false)
      toast.error("Errore durante l'analisi. Riprova.")
    }
  }

  /* ── Istruzioni disegno ───────────────────────────────────────────────── */
  const drawInstructions: Record<'lasso' | 'rect' | 'polygon', string> = {
    lasso: 'Tieni premuto e trascina per tracciare la zona',
    rect: 'Clicca e trascina per disegnare il rettangolo',
    polygon: 'Clicca per aggiungere vertici · doppio click per chiudere',
  }

  const showPanel = !!(searchResult || drawnArea)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-50">
      
      {/* ── MAP ──────────────────────────────────────────────────────────── */}
      <MapComponent
        ref={mapRef}
        mapStyle={mapStyle}
        drawMode={drawMode}
        onAreaDrawn={handleAreaDrawn}
        onMapStyleChange={setMapStyle}
        onSearchSelect={handleSearchSelect}
        onDrawStart={() => setIsDrawing(true)}
        onDrawEnd={() => setIsDrawing(false)}
        searchResult={searchResult}
        savedAnalyses={analyses}
      />

      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <div className="absolute top-4 left-4 right-4 z-40 flex items-center gap-3 pointer-events-none">
        <div className="pointer-events-auto">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2.5 bg-white rounded-xl shadow-md hover:bg-slate-50 transition-colors border border-slate-200"
            aria-label="Apri menu"
          >
            <Menu size={20} className="text-slate-700" />
          </button>
        </div>
        <div className="flex-1 pointer-events-auto max-w-xl mx-auto">
          <SearchBar onSelect={handleSearchSelect} />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {(['street', 'satellite', 'topo'] as const).map(style => (
            <button
              key={style}
              onClick={() => setMapStyle(style)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                mapStyle === style 
                  ? 'bg-slate-900 text-white shadow-sm' 
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {style === 'street' ? 'Mappa' : style === 'satellite' ? 'Satellite' : 'Topo'}
            </button>
          ))}
        </div>
      </div>

      {/* ── DRAW INSTRUCTIONS BANNER ──────────────────────────────────────── */}
      {drawMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3 backdrop-blur-sm">
          <span className="font-medium">{drawInstructions[drawMode]}</span>
          <kbd className="text-[10px] bg-white/20 px-2 py-0.5 rounded">ESC</kbd>
          <span className="text-slate-300">per uscire</span>
        </div>
      )}

      {/* ── DRAW TOOLS (sinistra, verticale) ──────────────────────────────── */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2">
        {[
          { mode: 'lasso' as const, icon: <SquareDashedBottom size={18} />, tooltip: 'Lasso libero' },
          { mode: 'rect' as const, icon: <div className="w-4 h-4 border-2 border-current rounded-sm" />, tooltip: 'Rettangolo' },
          { mode: 'polygon' as const, icon: <div className="w-4 h-4 border-2 border-current" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }} />, tooltip: 'Poligono' },
        ].map(tool => (
          <button
            key={tool.mode}
            onClick={() => toggleDrawMode(tool.mode)}
            className={`w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center transition-all border-2 ${
              drawMode === tool.mode 
                ? 'border-emerald-500 text-emerald-600 bg-emerald-50' 
                : 'border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-200'
            }`}
            title={tool.tooltip}
          >
            {tool.icon}
          </button>
        ))}
        
        <div className="w-10 h-px bg-slate-200 my-1" />
        
        <button
          onClick={handleClearDrawing}
          disabled={!drawnArea && !searchResult}
          className="w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-transparent hover:border-red-200"
          title="Cancella area"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* ── ZOOM CONTROLS (destra, in BASSO) ──────────────────────────────── */}
      <div className="absolute right-4 bottom-24 z-40 flex flex-col">
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="w-10 h-10 bg-white rounded-t-xl shadow-md hover:bg-slate-50 flex items-center justify-center text-slate-700 font-bold text-lg transition-colors border border-slate-200 border-b-0"
          aria-label="Zoom in"
        >
          <Plus size={20} />
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-10 h-10 bg-white rounded-b-xl shadow-md hover:bg-slate-50 flex items-center justify-center text-slate-700 font-bold text-lg transition-colors border border-slate-200 border-t-0"
          aria-label="Zoom out"
        >
          <Minus size={20} />
        </button>
      </div>

      {/* ── RIGHT PANEL (area info + avvia analisi) ───────────────────────── */}
      {showPanel && (
        <div className="absolute right-4 top-24 z-40 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Area Selezionata</h3>
            <button onClick={() => { setSearchResult(null); setDrawnArea(null); }} className="p-1 hover:bg-slate-100 rounded">
              <X size={16} className="text-slate-400" />
            </button>
          </div>
          
          <div className="p-4 space-y-3">
            {searchResult && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Indirizzo</p>
                <p className="text-sm text-slate-700">{searchResult.address.split(',').slice(0, 2).join(', ')}</p>
              </div>
            )}
            
            {drawnArea ? (
              <div>
                <p className="text-xs text-slate-500 mb-1">Superficie</p>
                <p className="text-lg font-bold text-slate-800">{formatArea(drawnArea.area, settings.unit)}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">Disegna un'area sulla mappa per avviare l'analisi</p>
            )}
            
            <button
              onClick={() => setShowModal(true)}
              disabled={!drawnArea}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Satellite size={16} />
              Avvia Analisi Rischio
            </button>
            
            {!drawnArea && (
              <p className="text-[11px] text-slate-400 text-center">
                Seleziona prima un'area con gli strumenti a sinistra
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── STATUS BAR ────────────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
        {isDrawing
          ? '🎨 Disegno in corso…'
          : drawnArea
          ? `✓ Zona pronta · ${formatArea(drawnArea.area, settings.unit)} · Avvia l'analisi`
          : searchResult
          ? "📍 Posizione trovata · disegna un'area per analizzarla"
          : "🗺️ Trascina la mappa per navigare · seleziona uno strumento per disegnare"}
      </div>

      {/* ── SIDEBAR UNIFICATO ────────────────────────────────────────────── */}
      <Sidebar 
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        analyses={analyses}
        unit={settings.unit}
        onFocus={a => {
          if (a.coordinates?.length) {
            const lat = a.coordinates.reduce((s, c) => s + c[0], 0) / a.coordinates.length
            const lon = a.coordinates.reduce((s, c) => s + c[1], 0) / a.coordinates.length
            setSearchResult({ lat, lon, address: a.address || a.title })
            if (mapRef.current) {
              mapRef.current.flyTo(lat, lon, 13)
            }
          }
          setSidebarOpen(false)
        }}
        onOpen={a => { router.push(`/analysis/${a.id}`); setSidebarOpen(false) }}
        onDelete={id => {
          const updated = analyses.filter(a => a.id !== id)
          setAnalyses(updated)
          localStorage.setItem('gb_analyses', JSON.stringify(updated))
        }}
        onSettingsChange={s => { setSettings(s); setMapStyle(s.defaultMap) }}
      />

      {/* ── ANALYSIS MODAL ────────────────────────────────────────────────── */}
      <AnalysisModal
        open={showModal}
        onClose={() => setShowModal(false)}
        drawnArea={drawnArea}
        address={searchResult?.address}
        unit={settings.unit}
        onStart={handleStartAnalysis}
      />

      {/* ── PROCESSING OVERLAY ────────────────────────────────────────────── */}
      <ProcessingOverlay open={processing} title={processingTitle} />
    </div>
  )
}
