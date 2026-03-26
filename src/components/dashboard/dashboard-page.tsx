'use client'

import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { SearchBar } from '@/components/map/search-bar'
import {
  UserPanel, UserButton, addHistoryEntry,
  loadSettings, UserSettings, DEFAULT_SETTINGS
} from '@/components/user/user-panel'
import { SavedSidebar } from '@/components/user/saved-sidebar'
import { DrawnArea, AnalysisResult } from '@/lib/types'
import { MapStyleKey } from '@/components/map/map-component'
import {
  runMockAnalysis, saveAnalysis, loadAllAnalyses
} from '@/lib/analysis-engine'
import {
  Menu, Trash2, X, MapPin, SquareDashedBottom,
  PlayCircle, Satellite, Calendar, Loader2, ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'

const MapComponent = dynamic(
  () => import('@/components/map/map-component').then(m => m.MapComponent),
  { ssr: false, loading: () => <div className="w-full h-full bg-slate-100 flex items-center justify-center"><div className="text-slate-400 animate-pulse">Caricamento mappa...</div></div> }
)

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatArea(km2: number, unit: 'km2' | 'ha') {
  if (unit === 'ha') return `${(km2 * 100).toFixed(1)} ha`
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`
}

const riskColor: Record<string, string> = {
  basso: 'text-emerald-600 bg-emerald-50',
  medio: 'text-amber-600 bg-amber-50',
  alto: 'text-orange-600 bg-orange-50',
  critico: 'text-red-600 bg-red-50',
}

// ─── Modal avvio analisi ────────────────────────────────────────────────────
function AnalysisModal({
  open, drawnArea, address, onClose, onStart
}: {
  open: boolean
  drawnArea: DrawnArea | null
  address?: string
  onClose: () => void
  onStart: (title: string, startDate: string, endDate: string) => void
}) {
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('2022-01-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    if (open && address) {
      setTitle(address.split(',').slice(0, 2).join(', '))
    }
  }, [open, address])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" style={{ animation: 'modalIn .2s cubic-bezier(0.4,0,0.2,1)' }}>
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}`}</style>

        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Satellite className="w-5 h-5 text-emerald-400" />
              <h2 className="text-white font-bold text-base">Avvia Analisi Rischio</h2>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-white/50 text-xs mt-1">Analisi multi-temporale con indici NDVI, NDMI, NBR, NDBI, BREI, DOPI</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Area info */}
          {drawnArea && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <SquareDashedBottom className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-emerald-700">Area selezionata</p>
                <p className="text-sm font-semibold text-emerald-900">
                  {drawnArea.type === 'rectangle' ? 'Rettangolo' : drawnArea.type === 'lasso' ? 'Zona libera' : 'Poligono'} · {formatArea(drawnArea.area, 'km2')}
                </p>
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Nome dell'analisi</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Es. Zona industriale Milano Nord"
              className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              autoFocus
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Data inizio
              </label>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm text-slate-900 outline-none focus:border-emerald-400 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Data fine</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setEndDate(e.target.value)}
                className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm text-slate-900 outline-none focus:border-emerald-400 transition-all"
              />
            </div>
          </div>

          <p className="text-xs text-slate-400 flex items-start gap-1.5">
            <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">!</span>
            I dati sono simulati (mock). In produzione verranno usate immagini Sentinel-2 reali via GeoSync.
          </p>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
              Annulla
            </button>
            <button
              onClick={() => onStart(title || 'Analisi senza titolo', startDate, endDate)}
              disabled={!drawnArea}
              className="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <PlayCircle className="w-4 h-4" /> Avvia Analisi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Processing overlay ─────────────────────────────────────────────────────
function ProcessingOverlay({ open, title }: { open: boolean; title: string }) {
  const steps = [
    'Recupero immagini Sentinel-2...',
    'Calcolo indici NDVI e NDMI...',
    'Analisi NBR e rischio incendio...',
    'Calcolo NDBI e BREI...',
    'Composizione rischio finale...',
    'Generazione report...',
  ]
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    if (!open) { setStepIdx(0); return }
    const interval = setInterval(() => {
      setStepIdx(i => (i < steps.length - 1 ? i + 1 : i))
    }, 500)
    return () => clearInterval(interval)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center">
        <div className="w-16 h-16 mx-auto mb-5 relative">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
          <Satellite className="absolute inset-0 m-auto w-6 h-6 text-emerald-500" />
        </div>
        <h3 className="font-bold text-slate-900 text-base mb-1">{title}</h3>
        <p className="text-sm text-slate-500 mb-5">Analisi in corso...</p>
        <div className="space-y-2 text-left">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs transition-all duration-300 ${i <= stepIdx ? 'opacity-100' : 'opacity-30'}`}>
              <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${i < stepIdx ? 'bg-emerald-500' : i === stepIdx ? 'bg-emerald-200 border-2 border-emerald-500' : 'bg-slate-100'}`}>
                {i < stepIdx && <span className="text-white text-[8px]">✓</span>}
              </div>
              <span className={i <= stepIdx ? 'text-slate-700 font-medium' : 'text-slate-400'}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
export function DashboardPage() {
  const router = useRouter()
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('street')
  const [drawMode, setDrawMode] = useState<'lasso' | 'rect' | 'polygon' | null>(null)
  const [searchResult, setSearchResult] = useState<{ lat: number; lon: number; address: string } | null>(null)
  const [drawnArea, setDrawnArea] = useState<DrawnArea | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([])
  const [userPanelOpen, setUserPanelOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [showAnalysisModal, setShowAnalysisModal] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingTitle, setProcessingTitle] = useState('')

  useEffect(() => {
    const s = loadSettings()
    setSettings(s)
    setMapStyle(s.defaultMap)
    setAnalyses(loadAllAnalyses())
  }, [])

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
    addHistoryEntry('area', `Area ${area.type} — ${formatArea(area.area, 'km2')}`)
  }, [])

  const toggleDrawMode = (mode: 'lasso' | 'rect' | 'polygon') => {
    setDrawMode(prev => prev === mode ? null : mode)
    setDrawnArea(null)
  }

  const clearAll = () => {
    setDrawMode(null); setDrawnArea(null); setSearchResult(null)
  }

  const handleStartAnalysis = async (title: string, startDate: string, endDate: string) => {
    if (!drawnArea) return
    setShowAnalysisModal(false)
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
      
      // Aggiorna history
      addHistoryEntry('save', `Analisi: ${title} — Rischio ${result.compositeLevel} (${result.compositeScore}/100)`)
      
      // Aggiorna lista analisi sulla mappa
      setAnalyses(prev => [result, ...prev])
      
      setProcessing(false)
      toast.success('Analisi completata! Apertura risultati...')
      
      // Naviga alla pagina risultati
      setTimeout(() => router.push(`/analysis/${result.id}`), 600)
      
    } catch (err) {
      setProcessing(false)
      toast.error('Errore durante l\'analisi. Riprova.')
    }
  }

  const showPanel = !!(searchResult || drawnArea)
  const drawInstructions: Record<string, string> = {
    lasso:   'Tieni premuto e trascina per tracciare la zona liberamente',
    rect:    'Clicca e trascina per disegnare il rettangolo',
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
          savedAnalyses={analyses}
        />
      </div>

      {/* TOP BAR */}
      <header className="absolute top-4 left-4 right-4 z-20 flex items-center gap-2 pointer-events-none">
        <button onClick={() => setSidebarOpen(o => !o)} className="w-12 h-12 rounded-full bg-white shadow-md hover:shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all pointer-events-auto flex-shrink-0">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 max-w-xl pointer-events-auto">
          <SearchBar onSearchSelect={handleSearchSelect} />
        </div>
        <div className="bg-white rounded-full shadow-md p-1 flex gap-0.5 pointer-events-auto">
          {(['street', 'satellite', 'topo'] as MapStyleKey[]).map(style => (
            <button key={style} onClick={() => setMapStyle(style)} className={`h-10 px-3 rounded-full text-xs font-medium transition-all ${mapStyle === style ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
              {mapStyleLabels[style]}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex-shrink-0">
          <UserButton onClick={() => setUserPanelOpen(o => !o)} unreadNotifs={3} />
        </div>
      </header>

      {/* Draw instructions */}
      {drawMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur text-white px-5 py-2.5 rounded-full text-sm flex items-center gap-3 shadow-xl pointer-events-none">
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          {drawInstructions[drawMode]}
          <kbd className="bg-white/15 rounded px-2 py-0.5 text-xs font-mono">ESC</kbd>
        </div>
      )}

      {/* Draw tools */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
        {([
          ['lasso', 'Zona libera', <svg key="l" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12a7 7 0 1014 0A7 7 0 005 12zM12 8V4m0 16v-4m-4-4H4m16 0h-4"/></svg>],
          ['rect', 'Rettangolo', <svg key="r" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>],
          ['polygon', 'Poligono', <svg key="p" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/></svg>],
        ] as [string, string, React.ReactNode][]).map(([mode, label, icon]) => (
          <div key={mode} className="relative group">
            <button onClick={() => toggleDrawMode(mode as 'lasso' | 'rect' | 'polygon')} className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all shadow-sm ${drawMode === mode ? 'bg-emerald-500 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-600'}`}>{icon}</button>
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">{label}</div>
          </div>
        ))}
        <div className="h-px bg-slate-200 mx-1 my-0.5" />
        <div className="relative group">
          <button onClick={clearAll} className="w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Cancella tutto</div>
        </div>
      </div>

      {/* Right panel */}
      <div className={`absolute right-4 top-20 z-20 w-[300px] transition-all duration-200 ${showPanel ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}>
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm">Area Selezionata</h3>
            <button onClick={clearAll} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-3">
            {searchResult && (
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0"><MapPin className="w-4 h-4 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Indirizzo</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{searchResult.address.split(',').slice(0, 2).join(', ')}</p>
                </div>
              </div>
            )}
            {drawnArea && (
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0"><SquareDashedBottom className="w-4 h-4 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Superficie</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">{formatArea(drawnArea.area, settings.unit)}</span>
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* Avvia analisi button — principale CTA */}
          <div className="px-4 pb-4 space-y-2">
            <button
              onClick={() => setShowAnalysisModal(true)}
              disabled={!drawnArea}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Satellite className="w-4 h-4" />
              Avvia Analisi Rischio
              <ChevronRight className="w-4 h-4" />
            </button>
            {!drawnArea && (
              <p className="text-xs text-center text-slate-400">Seleziona prima un'area sulla mappa</p>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-slate-900/85 backdrop-blur text-white px-5 py-2 rounded-full text-xs flex items-center gap-2 shadow-lg pointer-events-none">
        <span className={`w-1.5 h-1.5 rounded-full ${isDrawing ? 'bg-amber-400 animate-pulse' : drawnArea || searchResult ? 'bg-emerald-400' : 'bg-emerald-400 animate-pulse'}`} />
        {isDrawing ? 'Disegno in corso...' : drawnArea ? `Zona pronta · ${formatArea(drawnArea.area, settings.unit)} · Avvia l'analisi` : searchResult ? "Posizione trovata · traccia un'area per l'analisi" : "Traccia un'area o cerca un indirizzo per iniziare"}
      </div>

      {/* Sidebar analisi salvate */}
      <SavedSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        analyses={analyses}
        unit={settings.unit}
        onFocus={a => {
          if (a.coordinates?.length) {
            const lat = a.coordinates.reduce((s, c) => s + c[0], 0) / a.coordinates.length
            const lon = a.coordinates.reduce((s, c) => s + c[1], 0) / a.coordinates.length
            setSearchResult({ lat, lon, address: a.address || a.title })
          }
          setSidebarOpen(false)
        }}
        onOpen={a => { router.push(`/analysis/${a.id}`); setSidebarOpen(false) }}
        onDelete={id => setAnalyses(prev => prev.filter(a => a.id !== id))}
      />

      {/* User Panel */}
      <UserPanel
        open={userPanelOpen}
        onClose={() => setUserPanelOpen(false)}
        savedCount={analyses.length}
        onSettingsChange={s => { setSettings(s); setMapStyle(s.defaultMap) }}
      />

      {/* Analysis Modal */}
      <AnalysisModal
        open={showAnalysisModal}
        drawnArea={drawnArea}
        address={searchResult?.address}
        onClose={() => setShowAnalysisModal(false)}
        onStart={handleStartAnalysis}
      />

      {/* Processing overlay */}
      <ProcessingOverlay open={processing} title={processingTitle} />
    </div>
  )
}
