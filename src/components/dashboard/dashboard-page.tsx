'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { SearchBar } from '@/components/map/search-bar'
import {
  UserPanel, addHistoryEntry,
  loadSettings, UserSettings, DEFAULT_SETTINGS, saveAlertConfigFromSettings
} from '@/components/user/user-panel'
import { SavedSidebar } from '@/components/user/saved-sidebar'
import { DrawnArea, AnalysisResult } from '@/lib/types'
import { MapStyleKey, MapHandle } from '@/components/map/map-component'
import { runMockAnalysis } from '@/lib/analysis-engine'
import { saveAnalysis, loadAllAnalyses, deleteAnalysis } from '@/lib/analysis-store'
import { useAnalysisRealtime } from '@/lib/realtime'
import { useAuth } from '@/lib/auth-context'
import {
  Menu, Trash2, X, MapPin, SquareDashedBottom,
  Satellite, Calendar, ChevronRight, Plus, Minus,
  Camera, TrendingUp, Bell, BellRing, Smartphone,
  Wifi, WifiOff
} from 'lucide-react'
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

function formatArea(km2: number, unit: 'km2' | 'ha') {
  if (unit === 'ha') return `${(km2 * 100).toFixed(1)} ha`
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`
}

/* ─── Push Notification helpers ─────────────────────────────────────────── */
async function requestPushPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function sendPushNotification(title: string, body: string, tag = 'geobridge-alert') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  new Notification(title, { body, tag, icon: '/favicon.ico' })
}

function checkGeofenceAlerts(analyses: AnalysisResult[], settings: UserSettings) {
  const thr = settings.alertThresholds
  if (!thr?.enabled) return
  analyses.forEach(a => {
    const triggered: string[] = []
    if (a.compositeScore >= thr.composite) triggered.push(`Rischio composito ${a.compositeScore}/100 ≥ ${thr.composite}`)
    const fire = a.categories?.find(c => c.name.includes('Incendio'))
    if (fire && fire.score >= thr.fire) triggered.push(`Incendio ${fire.score}/100 ≥ ${thr.fire}`)
    const water = a.categories?.find(c => c.name.includes('Idrico'))
    if (water && water.score >= thr.flood) triggered.push(`Alluvione ${water.score}/100 ≥ ${thr.flood}`)
    if (triggered.length > 0) {
      sendPushNotification(`⚠️ GeoBridge Alert — ${a.title}`, triggered.join('\n'), `alert-${a.id}`)
    }
  })
}

/* ─── Modal analisi ─────────────────────────────────────────────────────── */
function AnalysisModal({ open, drawnArea, address, unit, onClose, onStart }: {
  open: boolean; drawnArea: DrawnArea | null; address?: string; unit: 'km2' | 'ha'
  onClose: () => void
  onStart: (title: string, startDate: string, endDate: string, mode: 'snapshot' | 'timeseries') => void
}) {
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('2022-01-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<'snapshot' | 'timeseries'>('snapshot')
  useEffect(() => { if (open && address) setTitle(address.split(',').slice(0, 2).join(', ')) }, [open, address])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" style={{ animation: 'modalIn .2s cubic-bezier(0.4,0,0.2,1)' }}>
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}`}</style>
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Satellite className="w-5 h-5 text-emerald-400" /><h2 className="text-white font-bold text-base">Avvia Analisi Rischio</h2></div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-white/50 text-xs mt-1">Indici NDVI · NDMI · NBR · NDBI · BREI · DOPI [dati simulati]</p>
        </div>
        <div className="p-6 space-y-4">
          {drawnArea && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <SquareDashedBottom className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-emerald-700">Area selezionata</p>
                <p className="text-sm font-semibold text-emerald-900">
                  {drawnArea.type === 'rectangle' ? 'Rettangolo' : drawnArea.type === 'lasso' ? 'Zona libera' : 'Poligono'} · {formatArea(drawnArea.area, unit)}
                </p>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-2">Tipo di analisi</label>
            <div className="grid grid-cols-2 gap-2">
              {([['snapshot', 'Snapshot', Camera, 'Situazione attuale — istantanea alla data odierna'],
                 ['timeseries', 'Serie Storica', TrendingUp, 'Evoluzione nel periodo — trend e variazioni']] as const).map(([k, lbl, Icon, desc]) => (
                <button key={k} onClick={() => setMode(k as 'snapshot' | 'timeseries')}
                  className={`flex flex-col items-start p-3 rounded-xl border-2 transition-all ${mode === k ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${mode === k ? 'text-emerald-600' : 'text-slate-500'}`} />
                    <span className={`text-xs font-semibold ${mode === k ? 'text-emerald-700' : 'text-slate-700'}`}>{lbl}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 text-left leading-relaxed">{desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Nome dell'analisi</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. Zona industriale Milano Nord" autoFocus
              className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all" />
          </div>
          {mode === 'timeseries' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> Inizio</label>
                <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm outline-none focus:border-emerald-400 transition-all" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Fine</label>
                <input type="date" value={endDate} min={startDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setEndDate(e.target.value)}
                  className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm outline-none focus:border-emerald-400 transition-all" />
              </div>
            </div>
          )}
          {mode === 'snapshot' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-xs text-blue-700 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 flex-shrink-0" />Analisi dell'ultimo mese disponibile.</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">Annulla</button>
            <button onClick={() => onStart(title || 'Analisi senza titolo', startDate, endDate, mode)} disabled={!drawnArea}
              className="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
              <Satellite className="w-4 h-4" /> Avvia
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Processing overlay ─────────────────────────────────────────────────── */
function ProcessingOverlay({ open, title }: { open: boolean; title: string }) {
  const steps = ['Recupero immagini Sentinel-2…', 'Calcolo indici NDVI e NDMI…', 'Analisi NBR e rischio incendio…', 'Calcolo NDBI e BREI…', 'Composizione rischio finale…', 'Generazione report…']
  const [stepIdx, setStepIdx] = useState(0)
  useEffect(() => {
    if (!open) { setStepIdx(0); return }
    const iv = setInterval(() => setStepIdx(i => Math.min(i + 1, steps.length - 1)), 500)
    return () => clearInterval(iv)
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
        <p className="text-sm text-slate-500 mb-5">Analisi in corso…</p>
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

/* ─── Dashboard principale ───────────────────────────────────────────────── */
export function DashboardPage() {
  const router = useRouter()
  const mapRef = useRef<MapHandle>(null)
  const { user, isDemo } = useAuth()
  const userId = user?.id

  const [mapStyle, setMapStyle]   = useState<MapStyleKey>('street')
  const [drawMode, setDrawMode]   = useState<'lasso' | 'rect' | 'polygon' | 'touch_rect' | null>(null)
  const [searchResult, setSearchResult] = useState<{ lat: number; lon: number; address: string } | null>(null)
  const [drawnArea, setDrawnArea] = useState<DrawnArea | null>(null)
  const [lastAnalyzedArea, setLastAnalyzedArea] = useState<DrawnArea | null>(null)
  const [analyses, setAnalyses]   = useState<AnalysisResult[]>([])
  const [loading, setLoading]     = useState(true)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [settings, setSettings]   = useState<UserSettings>(DEFAULT_SETTINGS)
  const [showModal, setShowModal] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingTitle, setProcessingTitle] = useState('')
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [pushGranted, setPushGranted] = useState(false)
  const [showPushBanner, setShowPushBanner] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'disconnected' | 'demo'>('demo')

  /* ── Init ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const s = loadSettings()
    setSettings(s)
    setMapStyle(s.defaultMap)
    setIsTouchDevice(('ontouchstart' in window) || navigator.maxTouchPoints > 0)
    if ('Notification' in window) {
      setPushGranted(Notification.permission === 'granted')
      if (Notification.permission === 'default' && s.alertThresholds?.enabled) setShowPushBanner(true)
    }
  }, [])

  /* ── Carica analisi dall'utente (Supabase o localStorage) ─────────────── */
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const list = await loadAllAnalyses(userId)
        setAnalyses(list)
      } finally {
        setLoading(false)
      }
    }
    load()
    setRealtimeStatus(isDemo ? 'demo' : 'disconnected')
  }, [userId, isDemo])

  /* ── Realtime WebSocket ───────────────────────────────────────────────── */
  useAnalysisRealtime({
    userId,
    onAnalysisUpdate: useCallback((a: AnalysisResult) => {
      setAnalyses(prev => {
        const idx = prev.findIndex(x => x.id === a.id)
        if (idx >= 0) { const next = [...prev]; next[idx] = a; return next }
        return [a, ...prev]
      })
      setRealtimeStatus('connected')
    }, []),
    onAnalysisDelete: useCallback((id: string) => {
      setAnalyses(prev => prev.filter(a => a.id !== id))
    }, []),
  })

  useEffect(() => {
    if (!isDemo && userId) {
      const t = setTimeout(() => setRealtimeStatus(s => s === 'disconnected' ? 'connected' : s), 2000)
      return () => clearTimeout(t)
    }
  }, [isDemo, userId])

  /* ── ESC ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawMode(null); setIsDrawing(false) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const handleSearchSelect = useCallback((lat: number, lon: number, address: string) => {
    setSearchResult({ lat, lon, address })
    addHistoryEntry('search', address.split(',').slice(0, 2).join(', '))
  }, [])

  const handleAreaDrawn = useCallback((area: DrawnArea) => {
    setDrawnArea(area); setLastAnalyzedArea(null); setDrawMode(null); setIsDrawing(false)
    addHistoryEntry('area', `Area ${area.type} · ${formatArea(area.area, 'km2')}`)
  }, [])

  const toggleDrawMode = (mode: 'lasso' | 'rect' | 'polygon' | 'touch_rect') => {
    if (drawMode === mode) { setDrawMode(null); setIsDrawing(false) }
    else { setDrawnArea(null); setLastAnalyzedArea(null); mapRef.current?.clearDrawing(); setDrawMode(mode) }
  }

  const handleClearDrawing = () => {
    setDrawnArea(null); setLastAnalyzedArea(null); setDrawMode(null); setIsDrawing(false)
    mapRef.current?.clearDrawing(); toast('Area cancellata')
  }

  const clearAll = () => {
    setDrawnArea(null); setLastAnalyzedArea(null); setSearchResult(null)
    setDrawMode(null); setIsDrawing(false); mapRef.current?.clearDrawing()
  }

  const handleRequestPush = async () => {
    const granted = await requestPushPermission()
    setPushGranted(granted); setShowPushBanner(false)
    if (granted) toast.success('Notifiche push abilitate!')
    else toast.error('Notifiche non consentite dal browser.')
  }

  /* ── Avvia analisi (salva su Supabase o localStorage) ─────────────────── */
  const handleStartAnalysis = async (
    title: string, startDate: string, endDate: string, mode: 'snapshot' | 'timeseries'
  ) => {
    if (!drawnArea) return
    const areaToAnalyze = drawnArea
    setShowModal(false); setProcessing(true); setProcessingTitle(title)
    setLastAnalyzedArea(areaToAnalyze)
    try {
      const effectiveStart = mode === 'snapshot'
        ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : startDate
      const result = await runMockAnalysis({
        title, address: searchResult?.address,
        drawnArea: areaToAnalyze, startDate: effectiveStart, endDate,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultWithMeta = { ...result, analysisMode: mode } as any

      /* Salva su Supabase (se autenticato) + localStorage come cache */
      await saveAnalysis(resultWithMeta, userId)

      addHistoryEntry('save', `Analisi: ${title} · Rischio ${result.compositeLevel} (${result.compositeScore}/100)`)

      /* Aggiorna lo stato locale immediatamente (il realtime lo sincronizzerà poi) */
      setAnalyses(prev => {
        const idx = prev.findIndex(x => x.id === resultWithMeta.id)
        if (idx >= 0) { const next = [...prev]; next[idx] = resultWithMeta; return next }
        return [resultWithMeta, ...prev]
      })

      /* Geo-fenced alert check */
      checkGeofenceAlerts([resultWithMeta], settings)

      setProcessing(false)
      toast.success(isDemo ? 'Analisi completata (modalità demo)!' : 'Analisi salvata su Supabase!')
      setTimeout(() => router.push(`/analysis/${result.id}`), 500)
    } catch (err) {
      console.error(err)
      setProcessing(false)
      toast.error("Errore durante l'analisi. Riprova.")
    }
  }

  /* ── Elimina analisi ──────────────────────────────────────────────────── */
  const handleDeleteAnalysis = useCallback(async (id: string) => {
    setAnalyses(prev => prev.filter(a => a.id !== id))
    await deleteAnalysis(id, userId)
  }, [userId])

  /* ── Settings change → salva alert config su Supabase ─────────────────── */
  const handleSettingsChange = useCallback(async (s: UserSettings) => {
    setSettings(s); setMapStyle(s.defaultMap)
    if (!isDemo && userId) {
      await saveAlertConfigFromSettings(s, userId)
    }
  }, [isDemo, userId])

  const drawInstructions: Record<string, string> = {
    lasso: 'Tieni premuto e trascina', rect: 'Clicca e trascina per il rettangolo',
    polygon: 'Clicca per aggiungere vertici · doppio click per chiudere',
    touch_rect: 'Tocca il primo angolo, poi il secondo',
  }
  const mapStyleLabels: Record<MapStyleKey, string> = { street: 'Mappa', satellite: 'Satellite', topo: 'Topologia' }
  const activeArea = drawnArea || lastAnalyzedArea
  const showPanel  = !!(searchResult || activeArea)
  const canDelete  = !!(drawnArea || lastAnalyzedArea || drawMode)

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-slate-100">

      <div className="absolute inset-0">
        <MapComponent
          ref={mapRef} mapStyle={mapStyle} drawMode={drawMode}
          onAreaDrawn={handleAreaDrawn} onDrawStart={() => setIsDrawing(true)} onDrawEnd={() => setIsDrawing(false)}
          searchResult={searchResult} savedAnalyses={analyses}
        />
      </div>

      {/* TOP BAR */}
      <header className="absolute top-4 left-4 right-4 z-20 flex items-center gap-2 pointer-events-none">
        <button onClick={() => setMenuOpen(o => !o)}
          className="w-12 h-12 rounded-full bg-white shadow-md hover:shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all pointer-events-auto flex-shrink-0 relative">
          <Menu className="w-5 h-5" />
          {!pushGranted && <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />}
        </button>

        <div className="flex-1 max-w-xl pointer-events-auto">
          <SearchBar onSearchSelect={handleSearchSelect} />
        </div>

        <div className="bg-white rounded-full shadow-md p-1 flex gap-0.5 pointer-events-auto">
          {(['street', 'satellite', 'topo'] as MapStyleKey[]).map(style => (
            <button key={style} onClick={() => setMapStyle(style)}
              className={`h-10 px-2 sm:px-3 rounded-full text-xs font-medium transition-all ${mapStyle === style ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
              <span className="hidden sm:inline">{mapStyleLabels[style]}</span>
              <span className="sm:hidden">{style === 'street' ? '🗺' : style === 'satellite' ? '🛰' : '⛰'}</span>
            </button>
          ))}
        </div>

        {/* Indicatore Supabase realtime */}
        {!isDemo && (
          <div className={`pointer-events-auto flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-colors ${realtimeStatus === 'connected' ? 'bg-emerald-500' : 'bg-slate-300'}`}
            title={realtimeStatus === 'connected' ? 'Realtime connesso' : 'Connessione in corso…'}>
            {realtimeStatus === 'connected'
              ? <Wifi className="w-4 h-4 text-white" />
              : <WifiOff className="w-4 h-4 text-slate-500" />
            }
          </div>
        )}
      </header>

      {/* Push banner */}
      {showPushBanner && (
        <div className="absolute top-20 left-4 right-4 z-20 max-w-sm mx-auto">
          <div className="bg-amber-500 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
            <BellRing className="w-5 h-5 flex-shrink-0" />
            <p className="text-xs font-medium flex-1">Abilita le notifiche push per geo-fenced alert in tempo reale</p>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={handleRequestPush} className="bg-white text-amber-600 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-amber-50 transition-colors">Abilita</button>
              <button onClick={() => setShowPushBanner(false)}><X className="w-4 h-4 text-white/70" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Draw instructions */}
      {drawMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur text-white px-4 py-2.5 rounded-full text-xs sm:text-sm flex items-center gap-3 shadow-xl pointer-events-none max-w-xs sm:max-w-none">
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse flex-shrink-0" />
          <span>{drawInstructions[drawMode]}</span>
          {!isTouchDevice && <><kbd className="bg-white/15 rounded px-2 py-0.5 text-xs font-mono">ESC</kbd><span className="text-white/50 text-xs">per uscire</span></>}
        </div>
      )}

      {/* DRAW TOOLS */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
        {!isTouchDevice && (
          <>
            <ToolButton active={drawMode === 'lasso'} tooltip="Zona libera (lasso)" onClick={() => toggleDrawMode('lasso')}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12a7 7 0 1014 0A7 7 0 005 12z" strokeDasharray="4 2"/><path d="M12 12v4M12 16l-2 3M12 16l2 3"/></svg>
            </ToolButton>
            <ToolButton active={drawMode === 'rect'} tooltip="Rettangolo (drag)" onClick={() => toggleDrawMode('rect')}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </ToolButton>
          </>
        )}
        {isTouchDevice && (
          <ToolButton active={drawMode === 'touch_rect'} tooltip="Rettangolo (2 tocchi)" onClick={() => toggleDrawMode('touch_rect')}>
            <Smartphone className="w-4 h-4" />
          </ToolButton>
        )}
        <ToolButton active={drawMode === 'polygon'} tooltip={isTouchDevice ? 'Poligono (tocca i vertici)' : 'Poligono'} onClick={() => toggleDrawMode('polygon')}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/></svg>
        </ToolButton>
        {isTouchDevice && (
          <ToolButton active={drawMode === 'lasso'} tooltip="Zona libera (trascina)" onClick={() => toggleDrawMode('lasso')}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12a7 7 0 1014 0A7 7 0 005 12z" strokeDasharray="4 2"/><path d="M12 12v4M12 16l-2 3M12 16l2 3"/></svg>
          </ToolButton>
        )}
        <div className="h-px bg-slate-200 mx-1 my-0.5" />
        <ToolButton active={false} danger tooltip="Cancella area" onClick={handleClearDrawing} disabled={!canDelete}>
          <Trash2 className="w-4 h-4" />
        </ToolButton>
      </div>

      {/* ZOOM */}
      <div className="absolute right-4 bottom-24 z-10 flex flex-col gap-1">
        <button onClick={() => mapRef.current?.zoomIn()} className="w-10 h-10 bg-white rounded-t-xl shadow-md hover:bg-slate-50 flex items-center justify-center text-slate-700 transition-colors border-b border-slate-100"><Plus className="w-5 h-5" /></button>
        <button onClick={() => mapRef.current?.zoomOut()} className="w-10 h-10 bg-white rounded-b-xl shadow-md hover:bg-slate-50 flex items-center justify-center text-slate-700 transition-colors"><Minus className="w-5 h-5" /></button>
      </div>

      {/* RIGHT PANEL */}
      <div className={`absolute right-4 top-20 z-20 w-[280px] sm:w-[300px] transition-all duration-200 ${showPanel ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'}`}>
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm">{lastAnalyzedArea && !drawnArea ? 'Ultima Area Analizzata' : 'Area Selezionata'}</h3>
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
            {activeArea ? (
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0"><SquareDashedBottom className="w-4 h-4 text-emerald-600" /></div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Superficie</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">{formatArea(activeArea.area, settings.unit)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Disegna un'area sulla mappa per avviare l'analisi</p>
            )}
          </div>
          <div className="px-4 pb-4 space-y-2">
            <button onClick={() => setShowModal(true)} disabled={!drawnArea}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
              <Satellite className="w-4 h-4" /> Avvia Analisi <ChevronRight className="w-4 h-4" />
            </button>
            {lastAnalyzedArea && !drawnArea && (
              <button onClick={handleClearDrawing} className="w-full h-9 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Rimuovi area
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Demo mode banner */}
      {isDemo && (
        <div className="absolute bottom-16 right-4 z-10 bg-amber-100 border border-amber-300 text-amber-800 px-3 py-1.5 rounded-xl text-xs font-medium shadow flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Modalità demo — dati locali
        </div>
      )}

      {/* Push alert indicator */}
      {pushGranted && settings.alertThresholds?.enabled && (
        <div className="absolute bottom-6 right-4 z-10">
          <div className="bg-emerald-500 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 shadow-lg">
            <Bell className="w-3 h-3" /> Alert attivi
          </div>
        </div>
      )}

      {/* STATUS BAR */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-slate-900/85 backdrop-blur text-white px-4 py-2 rounded-full text-xs flex items-center gap-2 shadow-lg pointer-events-none max-w-[calc(100vw-8rem)]">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDrawing ? 'bg-amber-400 animate-pulse' : activeArea ? 'bg-emerald-400' : 'bg-emerald-400 animate-pulse'}`} />
        <span className="truncate">
          {loading ? 'Caricamento analisi…'
            : isDrawing ? 'Disegno in corso…'
            : drawnArea ? `Zona pronta · ${formatArea(drawnArea.area, settings.unit)}`
            : lastAnalyzedArea ? `Ultima area · ${formatArea(lastAnalyzedArea.area, settings.unit)}`
            : searchResult ? "Posizione trovata · seleziona un'area"
            : isTouchDevice ? "Tocca uno strumento per disegnare"
            : "Seleziona uno strumento per disegnare"}
        </span>
      </div>

      <SavedSidebar
        open={sidebarOpen} onClose={() => setSidebarOpen(false)} analyses={analyses} unit={settings.unit}
        onFocus={a => {
          if (a.coordinates?.length) {
            const lat = a.coordinates.reduce((s, c) => s + c[0], 0) / a.coordinates.length
            const lon = a.coordinates.reduce((s, c) => s + c[1], 0) / a.coordinates.length
            setSearchResult({ lat, lon, address: a.address || a.title })
          }
          setSidebarOpen(false)
        }}
        onOpen={a => { router.push(`/analysis/${a.id}`); setSidebarOpen(false) }}
        onDelete={handleDeleteAnalysis}
      />

      <UserPanel
        open={menuOpen} onClose={() => setMenuOpen(false)} savedCount={analyses.length}
        onSettingsChange={handleSettingsChange}
        onOpenSaved={() => { setMenuOpen(false); setSidebarOpen(true) }}
      />

      <AnalysisModal
        open={showModal} drawnArea={drawnArea} address={searchResult?.address}
        unit={settings.unit} onClose={() => setShowModal(false)} onStart={handleStartAnalysis}
      />
      <ProcessingOverlay open={processing} title={processingTitle} />
    </div>
  )
}

function ToolButton({ active, danger = false, tooltip, onClick, disabled = false, children }: {
  active: boolean; danger?: boolean; tooltip: string; onClick: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <div className="relative group">
      <button onClick={onClick} disabled={disabled}
        className={['w-11 h-11 rounded-xl flex items-center justify-center transition-all shadow-sm',
          disabled ? 'bg-white text-slate-300 cursor-not-allowed'
            : active ? 'bg-emerald-500 text-white shadow-md'
            : danger ? 'bg-white text-slate-500 hover:bg-red-50 hover:text-red-500'
            : 'bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-600',
        ].join(' ')}>{children}</button>
      {!disabled && (
        <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
          {tooltip}
        </div>
      )}
    </div>
  )
}
