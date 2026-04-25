'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useAnalysisRealtime } from '@/lib/realtime'
import { loadAllAnalyses, deleteAnalysis } from '@/lib/analysis-store'
import { runAnalysis } from '@/lib/actions/run-analysis'
import { loadSettings, addHistoryEntry, DEFAULT_SETTINGS, UserSettings, saveSettings, POLICY_PRESETS, PolicyWeights } from '@/components/user/user-panel'
import { PolicyProfile } from '@/lib/types'
import { AnalysisResult, DrawnArea, RiskLevel } from '@/lib/types'
import { MapStyleKey, MapHandle } from '@/components/map/map-component'
import { SearchBar } from '@/components/map/search-bar'
import { generateAnalysisPDF } from '@/lib/pdf-generator'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import {
  LayoutDashboard, Map, FileBarChart2, Bell, Menu,
  Settings, Key, LogOut, Plus, Satellite, ChevronRight,
  Loader2, Trash2, Download, BarChart2, Star,
  AlertTriangle, CheckCircle, TrendingUp,
  X, Camera, Navigation, Smartphone, Minus,
  SquareDashedBottom, MapPin, ArrowLeft,
} from 'lucide-react'
import { ComparisonPanel } from '@/components/comparison/comparison-panel'
import { PortfolioPanel } from '@/components/user/portfolio-panel'
import { ApiKeysPanel } from '@/components/user/api-keys-panel'

// ─── Dynamic map ───────────────────────────────────────────────────────────
const MapComponent = dynamic(
  () => import('@/components/map/map-component').then(m => m.MapComponent),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#2dd4bf] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-mono tracking-widest">INITIALIZING ORBITAL VIEW</p>
        </div>
      </div>
    ),
  }
)

// ─── Helpers ───────────────────────────────────────────────────────────────
function fmt(km2: number, unit: 'km2' | 'ha' = 'km2') {
  if (unit === 'ha') return `${(km2 * 100).toFixed(1)} ha`
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`
}
function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const RISK_CFG: Record<RiskLevel, { bg: string; text: string; dot: string; bar: string; label: string; border: string }> = {
  basso:   { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', bar: 'bg-emerald-500', label: 'LOW',      border: 'border-emerald-500/20' },
  medio:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-400',   bar: 'bg-amber-500',   label: 'MEDIUM',   border: 'border-amber-500/20' },
  alto:    { bg: 'bg-orange-500/10',  text: 'text-orange-400',  dot: 'bg-orange-400',  bar: 'bg-orange-500',  label: 'HIGH',     border: 'border-orange-500/20' },
  critico: { bg: 'bg-red-500/10',     text: 'text-red-400',     dot: 'bg-red-400',     bar: 'bg-red-500',     label: 'CRITICAL', border: 'border-red-500/20' },
}
function rc(l: RiskLevel) { return RISK_CFG[l] || RISK_CFG.basso }

// ─── Types ─────────────────────────────────────────────────────────────────
type View = 'dashboard' | 'map' | 'reports' | 'alerts' | 'compare' | 'portfolio' | 'apikeys' | 'settings'

// ─── Small reusable pieces ─────────────────────────────────────────────────
function RiskBadge({ level }: { level: RiskLevel }) {
  const t = useTranslations('analysis.riskLabels')
  const c = rc(level)
  const labelMap: Record<RiskLevel, string> = {
    basso: t('basso'),
    medio: t('medio'),
    alto: t('alto'),
    critico: t('critico'),
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${c.bg} ${c.text} border ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {labelMap[level]}
    </span>
  )
}

function MetricCard({ label, value, sub, accent, critical }: {
  label: string; value: string | number; sub?: string; accent?: boolean; critical?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 border transition-all ${
      critical ? 'bg-red-500/5 border-red-500/20' :
      accent   ? 'bg-[#2dd4bf]/5 border-[#2dd4bf]/20' :
                 'bg-white/[0.03] border-slate-200'
    }`}>
      <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${critical ? 'text-red-400' : accent ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${critical ? 'text-red-400/60' : 'text-slate-600'}`}>{sub}</p>}
    </div>
  )
}

// ─── Processing Overlay ────────────────────────────────────────────────────
function ProcessingOverlay({ open, title }: { open: boolean; title: string }) {
  const t = useTranslations('processingOverlay')
  const steps = [t('step1'), t('step2'), t('step3'), t('step4'), t('step5'), t('step6')]
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (!open) { setIdx(0); return }
    const iv = setInterval(() => setIdx(i => Math.min(i + 1, steps.length - 1)), 500)
    return () => clearInterval(iv)
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 relative flex-shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-100" />
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            <Satellite className="absolute inset-0 m-auto w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-slate-900 font-semibold text-sm">{title}</p>
            <p className="text-slate-400 text-xs">{t('inProgress')}</p>
          </div>
        </div>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs transition-all duration-300 ${i <= idx ? 'opacity-100' : 'opacity-20'}`}>
              <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border ${i < idx ? 'bg-[#2dd4bf] border-[#2dd4bf]' : i === idx ? 'border-[#2dd4bf] bg-[#2dd4bf]/20' : 'border-slate-200'}`}>
                {i < idx && <span className="text-slate-900 text-[8px] font-bold">✓</span>}
              </div>
              <span className={i <= idx ? 'text-slate-700' : 'text-slate-300'}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Analysis Modal ────────────────────────────────────────────────────────
function AnalysisModal({ open, drawnArea, address, unit, policy, onPolicyChange, onClose, onStart }: {
  open: boolean; drawnArea: DrawnArea | null; address?: string; unit: 'km2' | 'ha'
  policy: PolicyProfile; onPolicyChange: (p: PolicyProfile) => void
  onClose: () => void
  onStart: (title: string, start: string, end: string, mode: 'snapshot' | 'timeseries', useMock: boolean) => void
}) {
  const t = useTranslations('analysisModal')
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('2022-01-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<'snapshot' | 'timeseries'>('snapshot')
  const [useMock, setUseMock] = useState(false)
  const [titleTouched, setTitleTouched] = useState(false)
  useEffect(() => { if (open) { setTitle(address ? address.split(',').slice(0, 2).join(', ') : ''); setTitleTouched(false) } }, [open, address])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center"><Satellite className="w-4 h-4 text-white" /></div>
            <div>
              <h2 className="text-slate-900 font-bold text-base leading-none">{t('title')}</h2>
              <p className="text-slate-400 text-xs mt-0.5">{t('indicesSubtitle', { dataMode: useMock ? t('simulatedData') : t('realData') })}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          {drawnArea && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <SquareDashedBottom className="w-4 h-4 text-emerald-600" />
              <div>
                <p className="text-xs text-emerald-600 font-medium">{t('selectedArea')}</p>
                <p className="text-sm font-semibold text-emerald-900">
                  {drawnArea.type === 'rectangle' ? t('rectangle') : drawnArea.type === 'lasso' ? t('lassoZone') : t('polygonZone')} · {fmt(drawnArea.area, unit)}
                </p>
              </div>
            </div>
          )}
          {/* Policy profile */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-2">
              {t('policyProfile')} <span className="text-slate-400 font-normal">{t('policyProfileSub')}</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                ['agricultural', '🌾', t('agricultural')],
                ['property',     '🏘', t('property')],
                ['crop',         '🌿', t('crop')],
                ['custom',       '⚙️', t('custom')],
              ] as const).map(([key, emoji, label]) => (
                <button key={key} onClick={() => onPolicyChange(key)}
                  className={`flex items-center gap-2 h-9 px-3 rounded-xl border text-xs font-medium transition-all ${
                    policy === key ? 'bg-violet-50 border-violet-400 text-violet-800' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  <span>{emoji}</span> {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-2">{t('analysisType')}</label>
            <div className="grid grid-cols-2 gap-2">
              {([['snapshot', t('snapshot'), Camera, t('snapshotDesc')], ['timeseries', t('timeseries'), TrendingUp, t('timeseriesDesc')]] as const).map(([k, lbl, Icon, desc]) => (
                <button key={k} onClick={() => setMode(k)}
                  className={`flex flex-col items-start p-3 rounded-xl border-2 transition-all ${mode === k ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${mode === k ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className={`text-xs font-semibold ${mode === k ? 'text-emerald-700' : 'text-slate-600'}`}>{lbl}</span>
                  </div>
                  <p className="text-[10px] text-slate-500">{desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">{t('analysisName')} <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} onBlur={() => setTitleTouched(true)} placeholder={t('namePlaceholder')} autoFocus
              className={`w-full h-10 bg-white border rounded-xl px-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 transition-all ${titleTouched && !title.trim() ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200 focus:border-emerald-400 focus:ring-emerald-100"}`} />
          </div>
          {mode === 'timeseries' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">{t('startDate')}</label>
                <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all [color-scheme:light]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">{t('endDate')}</label>
                <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all [color-scheme:light]" />
              </div>
            </div>
          )}
          {/* Mock / Real toggle */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <p className="text-xs font-semibold text-slate-700">{useMock ? t('mockData') : t('realSentinel')}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{useMock ? t('mockDesc') : t('realDesc')}</p>
            </div>
            <button
              onClick={() => setUseMock(v => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${useMock ? 'bg-amber-400' : 'bg-emerald-500'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 bg-white rounded-full shadow transition-all duration-200 ${useMock ? 'left-0.5' : 'left-[22px]'}`} />
            </button>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">{t('cancelBtn')}</button>
            <button onClick={() => { setTitleTouched(true); if (title.trim() && drawnArea) onStart(title.trim(), startDate, endDate, mode, useMock) }} disabled={!drawnArea || !title.trim()}
              className="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm">
              <Satellite className="w-4 h-4" /> {t('startBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Coordinate Dialog ─────────────────────────────────────────────────────
function CoordDialog({ open, onClose, onStart }: {
  open: boolean; onClose: () => void
  onStart: (t: string, s: string, e: string, m: 'snapshot' | 'timeseries', c: [number, number][], a: number) => void
}) {
  const t = useTranslations('coordDialog')
  const tModal = useTranslations('analysisModal')
  const [title, setTitle] = useState('')
  const [lat, setLat] = useState('41.90'); const [lon, setLon] = useState('12.50'); const [size, setSize] = useState('0.05')
  const [startDate, setStartDate] = useState('2022-01-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<'snapshot' | 'timeseries'>('timeseries')
  if (!open) return null
  const h = parseFloat(size) / 2; const cLat = parseFloat(lat); const cLon = parseFloat(lon)
  const coords: [number, number][] = [[cLat + h, cLon - h], [cLat + h, cLon + h], [cLat - h, cLon + h], [cLat - h, cLon - h]]
  const area = Math.round(parseFloat(size) * parseFloat(size) * 12300) / 100
  const valid = !isNaN(cLat) && !isNaN(cLon) && !isNaN(h) && h > 0 && title.trim()
  const inputCls = "w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center"><Navigation className="w-4 h-4 text-white" /></div>
            <h2 className="text-slate-900 font-bold">{t('title')}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">{t('analysisName')} <span className="text-red-500">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('namePlaceholder')} autoFocus className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {([[t('latitude'), lat, setLat], [t('longitude'), lon, setLon], [t('size'), size, setSize]] as [string, string, (v: string) => void][]).map(([lbl, v, sv]) => (
              <div key={lbl}>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">{lbl}</label>
                <input type="number" step="0.001" value={v} onChange={e => sv(e.target.value)} className={inputCls} />
              </div>
            ))}
          </div>
          {valid && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <Navigation className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-xs text-emerald-600 font-medium">{t('calculatedArea')}</p>
                <p className="text-sm font-semibold text-emerald-900">{area < 1 ? `${(area * 100).toFixed(1)} ha` : `${area.toFixed(2)} km²`} · {cLat.toFixed(4)}°N, {cLon.toFixed(4)}°E</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {([['snapshot', tModal('snapshot'), Camera], ['timeseries', tModal('timeseries'), TrendingUp]] as const).map(([k, lbl, Icon]) => (
              <button key={k} onClick={() => setMode(k)} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${mode === k ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                <Icon className="w-3.5 h-3.5" /> {lbl}
              </button>
            ))}
          </div>
          {mode === 'timeseries' && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-slate-600 block mb-1.5">{tModal('startDate')}</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls + " [color-scheme:light]"} /></div>
              <div><label className="text-xs font-semibold text-slate-600 block mb-1.5">{tModal('endDate')}</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls + " [color-scheme:light]"} /></div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">{t('cancelBtn')}</button>
            <button onClick={() => valid && onStart(title.trim(), startDate, endDate, mode, coords, area)} disabled={!valid}
              className="flex-1 h-11 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm">
              <Satellite className="w-4 h-4" /> {t('startBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tool Button ───────────────────────────────────────────────────────────
function ToolBtn({ active, tooltip, danger, onClick, disabled, children }: {
  active: boolean; tooltip: string; danger?: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <div className="relative group">
      <button onClick={onClick} disabled={disabled}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all shadow-md border ${
          disabled
            ? 'bg-white/80 text-slate-300 cursor-not-allowed border-slate-200'
            : active
            ? 'bg-emerald-500 text-white border-emerald-500 shadow-emerald-200'
            : danger
            ? 'bg-white text-slate-600 border-slate-300 hover:bg-red-50 hover:text-red-500 hover:border-red-300'
            : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300'
        }`}>{children}</button>
      {!disabled && (
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">{tooltip}</div>
      )}
    </div>
  )
}

// ─── Logo SVG GeoBridge ────────────────────────────────────────────────────
function GeoBridgeLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="9" fill="url(#gb-grad)" />
      <ellipse cx="18" cy="18" rx="10" ry="10" stroke="white" strokeWidth="1.5" strokeOpacity="0.9" fill="none" />
      <ellipse cx="18" cy="18" rx="10" ry="5.5" stroke="white" strokeWidth="1.2" strokeOpacity="0.6" fill="none" />
      <line x1="18" y1="8" x2="18" y2="28" stroke="white" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="8" y1="18" x2="28" y2="18" stroke="white" strokeWidth="1.2" strokeOpacity="0.6" />
      <circle cx="26" cy="10" r="3.5" fill="white" fillOpacity="0.95" />
      <circle cx="26" cy="10" r="2" fill="#10b981" />
      <path d="M18 8 Q28 8 28 18" stroke="white" strokeWidth="1" strokeOpacity="0.5" fill="none" strokeDasharray="2 2" />
      <defs>
        <linearGradient id="gb-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ─── Sidebar Nav Component ────────────────────────────────────────────────
interface SidebarNavProps {
  view: View
  navigate: (v: View) => void
  navItems: { id: View; label: string; icon: React.ElementType; badge?: number }[]
  alertCount: number
  userName: string
  isDemo: boolean
  userEmail?: string
  realtimeStatus: string
  onSignOut: () => void
}

function SidebarNav({ view, navigate, navItems, alertCount, userName, isDemo, userEmail, realtimeStatus, onSignOut }: SidebarNavProps) {
  const t = useTranslations('common')
  const ts = useTranslations('sidebar')
  return (
    <>
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <GeoBridgeLogo />
          <div>
            <p className="text-slate-900 font-bold text-[15px] leading-none">GeoBridge</p>
            <p className="text-[9px] text-slate-400 font-semibold tracking-[0.12em] uppercase mt-0.5">{ts('orbitalIntelligence')}</p>
          </div>
        </div>
      </div>
      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <button key={item.id} onClick={() => navigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all relative ${
                active ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}>
              <Icon className="w-[17px] h-[17px] flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge ? (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                  active ? 'bg-emerald-100 text-emerald-700' :
                  item.id === 'alerts' && alertCount > 0 ? 'bg-red-100 text-red-600' :
                  'bg-slate-100 text-slate-500'
                }`}>{item.badge}</span>
              ) : null}
              {active && <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-500 rounded-l-full" />}
            </button>
          )
        })}
      </nav>
      {/* CTA */}
      <div className="px-3 pb-4">
        <button onClick={() => navigate('map')}
          className="w-full h-10 bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm">
          <Plus className="w-4 h-4" /> {ts('newAnalysisBtn')}
        </button>
      </div>
      {/* Language switcher */}
      <div className="px-4 pb-3">
        <LanguageSwitcher compact />
      </div>
      {/* User */}
      <div className="px-4 py-4 border-t border-slate-100">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-sky-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold shadow-sm">
            {userName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 text-xs font-semibold truncate">{userName}</p>
            <p className="text-[10px] text-slate-400 truncate">{isDemo ? t('demoMode') : userEmail}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${realtimeStatus === 'connected' ? 'bg-emerald-500' : isDemo ? 'bg-amber-400' : 'bg-slate-300'}`} />
            <span className="text-[10px] text-slate-400">
              {realtimeStatus === 'connected' ? t('liveStatus') : isDemo ? t('demoStatus') : t('offlineStatus')}
            </span>
          </div>
          <button onClick={onSignOut} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-500 transition-colors">
            <LogOut className="w-3 h-3" /> {t('signOut')}
          </button>
        </div>
      </div>
    </>
  )
}


// ══════════════════════════════════════════════════════════════════════════
// APP SHELL
// ══════════════════════════════════════════════════════════════════════════
export function AppShell() {
  const router = useRouter()
  const { user, isDemo, signOut } = useAuth()
  const userId = user?.id
  const mapRef = useRef<MapHandle>(null)
  const t = useTranslations()
  const tNav = useTranslations('nav')
  const tDash = useTranslations('dashboard')
  const tMap = useTranslations('map')
  const tReports = useTranslations('reports')
  const tAlerts = useTranslations('alerts')
  const tPortfolio = useTranslations('portfolio')
  const tApikeys = useTranslations('apikeys')
  const tSettings = useTranslations('settings')
  const tToasts = useTranslations('toasts')

  const [view, setView] = useState<View>('dashboard')
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'disconnected' | 'demo'>('demo')

  // Map
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('satellite')
  const [drawMode, setDrawMode] = useState<'lasso' | 'rect' | 'polygon' | 'touch_rect' | null>(null)
  const [drawnArea, setDrawnArea] = useState<DrawnArea | null>(null)
  const [lastAnalyzedArea, setLastAnalyzedArea] = useState<DrawnArea | null>(null)
  const [searchResult, setSearchResult] = useState<{ lat: number; lon: number; address: string } | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  // Modals
  const [showAnalysisModal, setShowAnalysisModal] = useState(false)
  const [showCoordDialog, setShowCoordDialog] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingTitle, setProcessingTitle] = useState('')

  // Comparison
  const [selectedForComparison, setSelectedForComparison] = useState<Set<string>>(new Set())
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyProfile>('agricultural')

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = loadSettings()
    setSettings(s)
    setMapStyle(s.defaultMap)
    setIsTouchDevice(('ontouchstart' in window) || navigator.maxTouchPoints > 0)
    const requested = sessionStorage.getItem('gb_shell_view') as View | null
    if (requested) { sessionStorage.removeItem('gb_shell_view'); setView(requested) }
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try { setAnalyses(await loadAllAnalyses(userId)) }
      finally { setLoading(false) }
    }
    load()
    setRealtimeStatus(isDemo ? 'demo' : 'disconnected')
  }, [userId, isDemo])

  useAnalysisRealtime({
    userId,
    onAnalysisUpdate: useCallback((a: AnalysisResult) => {
      setAnalyses(prev => { const i = prev.findIndex(x => x.id === a.id); if (i >= 0) { const n = [...prev]; n[i] = a; return n }; return [a, ...prev] })
      setRealtimeStatus('connected')
    }, []),
    onAnalysisDelete: useCallback((id: string) => { setAnalyses(prev => prev.filter(a => a.id !== id)) }, []),
  })

  useEffect(() => {
    if (!isDemo && userId) {
      const timer = setTimeout(() => setRealtimeStatus(s => s === 'disconnected' ? 'connected' : s), 2000)
      return () => clearTimeout(timer)
    }
  }, [isDemo, userId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawMode(null); setIsDrawing(false) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ── Analysis ──────────────────────────────────────────────────────────────
  const handleAreaDrawn = useCallback((area: DrawnArea) => {
    setDrawnArea(area); setLastAnalyzedArea(null); setDrawMode(null); setIsDrawing(false)
    addHistoryEntry('area', `Area ${area.type}`)
    setShowAnalysisModal(true)
  }, [])

  const handleStartAnalysis = async (title: string, startDate: string, endDate: string, mode: 'snapshot' | 'timeseries', useMock: boolean) => {
    if (!drawnArea) return
    setShowAnalysisModal(false); setProcessing(true); setProcessingTitle(title); setLastAnalyzedArea(drawnArea)
    try {
      const effectiveStart = mode === 'snapshot' ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : startDate
      const result = await runAnalysis({ title, address: searchResult?.address, drawnArea, startDate: effectiveStart, endDate, policyProfile: selectedPolicy, useMock })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withMeta = { ...result, analysisMode: mode } as any
      sessionStorage.setItem('gb_pending_analysis', JSON.stringify(withMeta))
      setProcessing(false)
      router.push(`/analysis/${result.id}`)
    } catch (err: unknown) {
      setProcessing(false)
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[GeoBridge] analysis error:', msg)
      toast.error(tToasts('analysisError'), {
        description: msg.slice(0, 300),
        duration: 15000,
      })
    }
  }

  const handleStartFromCoords = async (title: string, startDate: string, endDate: string, mode: 'snapshot' | 'timeseries', coords: [number, number][], areaKm2: number, useMock: boolean = false) => {
    setShowCoordDialog(false)
    const synArea = { type: 'rectangle' as const, coordinates: coords, area: areaKm2 }
    const cLat = coords.reduce((s, c) => s + c[0], 0) / coords.length
    const cLon = coords.reduce((s, c) => s + c[1], 0) / coords.length
    setSearchResult({ lat: cLat, lon: cLon, address: title })
    mapRef.current?.flyToBounds(coords)
    setLastAnalyzedArea(synArea); setProcessing(true); setProcessingTitle(title)
    try {
      const effectiveStart = mode === 'snapshot' ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : startDate
      const result = await runAnalysis({ title, drawnArea: synArea, startDate: effectiveStart, endDate, policyProfile: selectedPolicy, useMock })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withMeta = { ...result, analysisMode: mode } as any
      sessionStorage.setItem('gb_pending_analysis', JSON.stringify(withMeta))
      setProcessing(false)
      router.push(`/analysis/${result.id}`)
    } catch (err: unknown) {
      setProcessing(false)
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[GeoBridge] coords analysis error:', msg)
      toast.error(tToasts('analysisError'), {
        description: msg.slice(0, 300),
        duration: 15000,
      })
    }
  }

  const handleDelete = async (id: string) => {
    setAnalyses(prev => prev.filter(a => a.id !== id))
    setSelectedForComparison(prev => { const n = new Set(prev); n.delete(id); return n })
    await deleteAnalysis(id, userId)
    toast(tToasts('analysisDeleted'))
  }


  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const n = new Set(prev)
      if (n.has(id)) { n.delete(id); toast(tReports('favoriteRemoved')) }
      else { n.add(id); toast(tReports('favoriteAdded')) }
      return n
    })
  }
  const toggleDraw = (m: 'lasso' | 'rect' | 'polygon' | 'touch_rect') => {
    if (drawMode === m) { setDrawMode(null); setIsDrawing(false) }
    else { setDrawnArea(null); setLastAnalyzedArea(null); mapRef.current?.clearDrawing(); setDrawMode(m) }
  }
  const clearDrawing = () => {
    setDrawnArea(null); setLastAnalyzedArea(null); setDrawMode(null); setIsDrawing(false); mapRef.current?.clearDrawing()
  }

  const navigate = (v: View) => { setView(v); setSidebarOpen(false) }

  // ── Derived ───────────────────────────────────────────────────────────────
  const criticalAlerts = analyses.filter(a => a.compositeLevel === 'critico')
  const highAlerts     = analyses.filter(a => a.compositeLevel === 'alto')
  const alertCount     = criticalAlerts.length + highAlerts.length
  const avgRisk        = analyses.length ? Math.round(analyses.reduce((s, a) => s + a.compositeScore, 0) / analyses.length) : 0
  const comparisonAnalyses = analyses.filter(a => selectedForComparison.has(a.id))
  const userName = (user?.user_metadata as Record<string, string>)?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User'

  const isMapView = view === 'map'

  const navItems = [
    { id: 'dashboard' as View, label: tNav('dashboard'),      icon: LayoutDashboard },
    { id: 'map'       as View, label: tNav('newAnalysis'),    icon: Map },
    { id: 'reports'   as View, label: tNav('reports'),        icon: FileBarChart2, badge: analyses.length },
    { id: 'alerts'    as View, label: tNav('alerts'),         icon: Bell,          badge: alertCount || undefined },
    { id: 'compare'   as View, label: tNav('compare'),        icon: BarChart2,     badge: selectedForComparison.size || undefined },
    { id: 'portfolio' as View, label: tNav('portfolio'),      icon: TrendingUp },
    { id: 'apikeys'   as View, label: tNav('apikeys'),        icon: Key },
    { id: 'settings'  as View, label: tNav('settings'),       icon: Settings },
  ]

  const viewTitles: Record<View, string> = {
    dashboard: tDash('welcomeBack', { name: userName }),
    map:       tMap('title'),
    reports:   tNav('reports'),
    alerts:    tNav('alerts'),
    compare:   tNav('compare'),
    portfolio: tNav('portfolio'),
    apikeys:   tNav('apikeys'),
    settings:  tNav('settings'),
  }

  const drawHints: Record<string, string> = {
    lasso: tMap('holdAndDrag'),
    rect: tMap('clickAndDrag'),
    polygon: tMap('clickVertices'),
    touch_rect: tMap('tapCorners'),
  }

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen w-screen flex bg-slate-50 overflow-hidden" style={{ fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}>

      {/* ── SIDEBAR DESKTOP */}
      {!isMapView && (
      <aside className="hidden md:flex w-[215px] flex-shrink-0 bg-white border-r border-slate-100 flex-col">
        <SidebarNav view={view} navigate={navigate} navItems={navItems} alertCount={alertCount} userName={userName} isDemo={isDemo} userEmail={user?.email} realtimeStatus={realtimeStatus} onSignOut={signOut} />
      </aside>
      )}

      {/* ── SIDEBAR MOBILE OVERLAY */}
      {sidebarOpen && !isMapView && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm md:hidden" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 z-50 w-[260px] bg-white border-r border-slate-100 flex flex-col shadow-2xl md:hidden">
            <div className="absolute top-4 right-4 z-10">
              <button onClick={() => setSidebarOpen(false)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <SidebarNav view={view} navigate={navigate} navItems={navItems} alertCount={alertCount} userName={userName} isDemo={isDemo} userEmail={user?.email} realtimeStatus={realtimeStatus} onSignOut={signOut} />
          </aside>
        </>
      )}

      {/* ── MAIN ──────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Top bar */}
        {!isMapView && (
        <header className="h-[56px] bg-white border-b border-slate-100 flex items-center px-4 sm:px-6 gap-3 flex-shrink-0 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0 hover:bg-slate-200 transition-colors">
            <Menu className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-slate-900 font-semibold text-[14px] leading-none">{viewTitles[view]}</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
              {isDemo && <span className="ml-2 text-amber-500/80">· {t('common.demoMode')}</span>}
            </p>
          </div>



          <button onClick={() => navigate('alerts')} title={tNav('alerts')} className="relative w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors">
            <Bell className="w-3.5 h-3.5" />
            {alertCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white" />}
          </button>
        </header>
        )}

        {/* ── VIEWS ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">

          {/* DASHBOARD */}
          {view === 'dashboard' && (
            <div className="h-full overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard label={tDash('totalAnalyses')} value={loading ? '…' : analyses.length} sub={tDash('inPortfolio')} accent />
                <MetricCard label={tDash('criticalRisk')} value={criticalAlerts.length} sub={criticalAlerts.length > 0 ? tDash('actionRequired') : tDash('noAlert')} critical={criticalAlerts.length > 0} />
                <MetricCard label={tDash('highRisk')}    value={highAlerts.length}    sub={tDash('activeMonitoring')} />
                <MetricCard label={tDash('avgScore')}     value={`${avgRisk}`}          sub={tDash('portfolioScore')} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* Alert list */}
                <div className="lg:col-span-3">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-slate-800 font-semibold text-sm">{tDash('highPriorityAlerts')}</p>
                    <button onClick={() => setView('alerts')} className="text-emerald-600 text-xs hover:text-emerald-700 transition-colors">{tDash('viewAll')}</button>
                  </div>
                  <div className="space-y-2">
                    {loading ? (
                      <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-600" /></div>
                    ) : [...criticalAlerts, ...highAlerts].length === 0 ? (
                      <div className="text-center py-10 bg-white/[0.02] border border-slate-100 rounded-2xl">
                        <CheckCircle className="w-8 h-8 text-emerald-500/30 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">{tDash('noActiveAlerts')}</p>
                        <p className="text-slate-400 text-xs mt-1">{tDash('portfolioNormal')}</p>
                      </div>
                    ) : (
                      [...criticalAlerts, ...highAlerts].slice(0, 5).map(a => {
                        const c = rc(a.compositeLevel)
                        return (
                          <div key={a.id} onClick={() => router.push(`/analysis/${a.id}`)}
                            className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer hover:opacity-80 transition-all ${c.bg} ${c.border}`}>
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${c.dot} ${a.compositeLevel === 'critico' ? 'animate-pulse' : ''}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                              <p className="text-xs text-slate-500">{a.address?.split(',')[0] || 'Area'} · {timeAgo(a.createdAt)}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <RiskBadge level={a.compositeLevel} />
                              <span className="text-[10px] text-slate-500 tabular-nums">{a.compositeScore}/100</span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Recent analyses */}
                <div className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-slate-800 font-semibold text-sm">{tDash('recentAnalyses')}</p>
                    <button onClick={() => setView('reports')} className="text-emerald-600 text-xs hover:text-emerald-700 transition-colors">{tDash('viewAllAnalyses')}</button>
                  </div>
                  <div className="space-y-2">
                    {loading ? (
                      <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-600" /></div>
                    ) : analyses.length === 0 ? (
                      <div className="text-center py-10 bg-white/[0.02] border border-slate-100 rounded-2xl">
                        <Satellite className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">{tDash('noAnalyses')}</p>
                        <button onClick={() => setView('map')} className="mt-2 text-emerald-600 text-xs hover:text-emerald-700">{tDash('startFirst')}</button>
                      </div>
                    ) : (
                      analyses.slice(0, 5).map(a => {
                        const c = rc(a.compositeLevel)
                        return (
                          <div key={a.id} onClick={() => router.push(`/analysis/${a.id}`)}
                            className="flex items-center gap-3 p-3 bg-white/[0.025] hover:bg-white/[0.045] border border-slate-100 rounded-xl cursor-pointer transition-all group">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.bg} border ${c.border}`}>
                              <Satellite className={`w-3.5 h-3.5 ${c.text}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-900 truncate">{a.title}</p>
                              <p className="text-[10px] text-slate-600">{a.address?.split(',')[0] || 'Area'}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <RiskBadge level={a.compositeLevel} />
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {analyses.length > 0 && (
                    <div className="mt-4 p-4 bg-white/[0.025] border border-slate-100 rounded-2xl">
                      <p className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase mb-3">{tDash('aggregateRisk')}</p>
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 flex-shrink-0">
                          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                            <circle cx="50" cy="50" r="38" fill="none" strokeWidth="12" strokeLinecap="round"
                              stroke={avgRisk < 25 ? '#10b981' : avgRisk < 50 ? '#f59e0b' : avgRisk < 75 ? '#f97316' : '#ef4444'}
                              strokeDasharray={`${2 * Math.PI * 38}`}
                              strokeDashoffset={`${2 * Math.PI * 38 * (1 - avgRisk / 100)}`}
                              style={{ transition: 'stroke-dashoffset 1s ease' }} />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-sm font-bold text-slate-900 tabular-nums">{avgRisk}%</span>
                          </div>
                        </div>
                        <div className="flex-1 text-xs text-slate-500 leading-relaxed">
                          {tDash('portfolioHealth')}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MAP */}
          {view === 'map' && (
            <div className="h-full relative">
              <div className="absolute inset-0">
                <MapComponent ref={mapRef} mapStyle={mapStyle} drawMode={drawMode}
                  onAreaDrawn={handleAreaDrawn}
                  onDrawStart={() => setIsDrawing(true)} onDrawEnd={() => setIsDrawing(false)}
                  searchResult={searchResult} savedAnalyses={[]} />
              </div>

              {/* Top floating bar */}
              <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-2 pointer-events-none">
                <button
                  onClick={() => setView('dashboard')}
                  className="pointer-events-auto w-11 h-11 bg-white rounded-xl shadow-lg flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-all border border-slate-200 flex-shrink-0"
                  title={tMap('backToDashboard')}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="flex-1 flex items-center gap-2 min-w-0 pointer-events-auto">
                  <div className="flex-1 min-w-0">
                    <SearchBar
                      onSearchSelect={(lat, lon, address) => {
                        setSearchResult({ lat, lon, address })
                        addHistoryEntry('search', address.split(',')[0])
                      }}
                    />
                  </div>
                  <button
                    onClick={() => setShowCoordDialog(true)}
                    className="h-11 px-3 bg-white rounded-xl shadow-lg flex items-center gap-1.5 text-slate-700 hover:text-slate-900 text-xs font-semibold transition-all border border-slate-200 flex-shrink-0"
                  >
                    <Navigation className="w-4 h-4" />
                    <span className="hidden sm:inline">{tMap('coordinates')}</span>
                  </button>
                </div>

                {/* Layer switcher */}
                <div className="pointer-events-auto bg-white rounded-xl shadow-lg border border-slate-200 p-1 flex gap-0.5 flex-shrink-0">
                  {(['street', 'satellite', 'topo'] as MapStyleKey[]).map(s => (
                    <button key={s} onClick={() => setMapStyle(s)}
                      className={`h-9 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                        mapStyle === s ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                      }`}>
                      <span className="hidden sm:inline">{s === 'street' ? tMap('street') : s === 'satellite' ? tMap('satellite') : tMap('topo')}</span>
                      <span className="sm:hidden">{s === 'street' ? '🗺' : s === 'satellite' ? '🛰' : '⛰'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Draw hint */}
              {drawMode && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-slate-900/85 backdrop-blur text-white px-4 py-2 rounded-full text-xs flex items-center gap-3 pointer-events-none shadow-xl">
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse flex-shrink-0" />
                  {drawHints[drawMode]}
                  {!isTouchDevice && <kbd className="bg-white/15 rounded px-1.5 py-0.5 font-mono text-[10px] ml-1">{tMap('escKey')}</kbd>}
                </div>
              )}

              {/* ── Drawing tools — left */}
              <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
                {!isTouchDevice ? (
                  <>
                    <ToolBtn active={drawMode === 'lasso'} tooltip={tMap('lasso')} onClick={() => toggleDraw('lasso')}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M5 12a7 7 0 1014 0A7 7 0 005 12z" strokeDasharray="4 2"/>
                        <path d="M12 12v4M12 16l-2 3M12 16l2 3"/>
                      </svg>
                    </ToolBtn>
                    <ToolBtn active={drawMode === 'rect'} tooltip={tMap('rectangle')} onClick={() => toggleDraw('rect')}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                      </svg>
                    </ToolBtn>
                  </>
                ) : (
                  <ToolBtn active={drawMode === 'touch_rect'} tooltip={tMap('touchRect')} onClick={() => toggleDraw('touch_rect')}>
                    <Smartphone className="w-4 h-4" />
                  </ToolBtn>
                )}
                <ToolBtn active={drawMode === 'polygon'} tooltip={tMap('polygon')} onClick={() => toggleDraw('polygon')}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
                  </svg>
                </ToolBtn>
                <div className="h-px bg-slate-300 mx-1 my-0.5" />
                <ToolBtn active={false} danger tooltip={tMap('clearArea')} disabled={!drawnArea && !lastAnalyzedArea && !drawMode} onClick={clearDrawing}>
                  <Trash2 className="w-4 h-4" />
                </ToolBtn>
              </div>

              {/* Zoom — right */}
              <div className="absolute right-4 bottom-20 z-10 flex flex-col shadow-lg rounded-xl overflow-hidden border border-slate-200">
                <button onClick={() => mapRef.current?.zoomIn()}
                  className="w-10 h-10 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors border-b border-slate-100">
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={() => mapRef.current?.zoomOut()}
                  className="w-10 h-10 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <Minus className="w-4 h-4" />
                </button>
              </div>

              {/* Area panel — top right */}
              {(drawnArea || lastAnalyzedArea || searchResult) && (
                <div className="absolute top-20 right-4 z-20" style={{ width: 272 }}>
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                      <span className="text-slate-900 text-sm font-semibold">
                        {lastAnalyzedArea && !drawnArea ? tMap('lastArea') : tMap('selectedArea')}
                      </span>
                      <button
                        onClick={() => { setDrawnArea(null); setLastAnalyzedArea(null); setSearchResult(null); mapRef.current?.clearDrawing() }}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      {searchResult && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          <span className="text-sm text-slate-700 truncate">{searchResult.address.split(',').slice(0, 2).join(', ')}</span>
                        </div>
                      )}
                      {(drawnArea || lastAnalyzedArea) && (
                        <div className="flex items-center gap-2">
                          <SquareDashedBottom className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs text-slate-500">{tMap('surface')}</span>
                          <span className="text-xs font-semibold text-emerald-600">{fmt((drawnArea || lastAnalyzedArea)!.area, settings.unit)}</span>
                        </div>
                      )}
                      <button onClick={() => setShowAnalysisModal(true)} disabled={!drawnArea}
                        className="w-full h-10 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm">
                        <Satellite className="w-4 h-4" /> {tMap('startAnalysis')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Status bar — bottom */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-white/95 backdrop-blur border border-slate-200 shadow-lg px-4 py-2 rounded-full text-xs flex items-center gap-2 pointer-events-none max-w-sm">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isDrawing ? 'bg-amber-500 animate-pulse' : drawnArea ? 'bg-emerald-500' : 'bg-emerald-400 animate-pulse'
                }`} />
                <span className="text-slate-700 font-medium">
                  {isDrawing ? tMap('drawingInProgress')
                    : drawnArea ? tMap('areaReady', { size: fmt(drawnArea.area, settings.unit) })
                    : searchResult ? tMap('positionFound')
                    : isTouchDevice ? tMap('touchSelectTool')
                    : tMap('selectTool')}
                </span>
              </div>
            </div>
          )}

          {/* REPORTS */}
          {view === 'reports' && (
            <div className="h-full overflow-y-auto p-6">
              <p className="text-slate-500 text-xs mb-5">{tReports('subtitle', { count: analyses.length })}</p>
              {loading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-600" /></div>
              ) : analyses.length === 0 ? (
                <div className="text-center py-20">
                  <FileBarChart2 className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">{tReports('noReports')}</p>
                  <p className="text-slate-600 text-xs mt-1 mb-4">{tReports('noReportsSub')}</p>
                  <button onClick={() => setView('map')} className="h-9 px-5 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition-colors">{tReports('newAnalysis')}</button>
                </div>
              ) : (
                <>
                  {selectedForComparison.size > 0 && (
                    <div className="mb-4 flex items-center justify-between p-3 bg-[#2dd4bf]/5 border border-[#2dd4bf]/20 rounded-xl">
                      <span className="text-sm text-emerald-700 font-medium">{tReports('selectedForComparison', { count: selectedForComparison.size })}</span>
                      <div className="flex gap-2">
                        {selectedForComparison.size >= 2 && (
                          <button onClick={() => setView('compare')} className="h-7 px-3 bg-emerald-100 border border-emerald-300 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-200 transition-colors">{tReports('compare')}</button>
                        )}
                        <button onClick={() => setSelectedForComparison(new Set())} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">{tReports('reset')}</button>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[...analyses].sort((a,b) => (favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)).map(a => {
                      const c = rc(a.compositeLevel)
                      const isSelected = selectedForComparison.has(a.id)
                      return (
                        <div key={a.id}
                          className={`group relative bg-white/[0.025] hover:bg-white/[0.045] border rounded-2xl overflow-hidden transition-all cursor-pointer ${isSelected ? 'border-[#2dd4bf]/30 shadow-lg shadow-[#2dd4bf]/5' : 'border-slate-200 hover:border-slate-200'}`}
                          onClick={() => router.push(`/analysis/${a.id}`)}>
                          <div className={`h-1 ${c.bar}`} />
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0 pr-2">
                                <h3 className="text-sm font-semibold text-slate-900 truncate">{a.title}</h3>
                                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{a.address?.split(',')[0]} · {a.startDate?.slice(0, 7)}</p>
                                <p className="text-[10px] text-slate-300 font-mono mt-0.5 truncate select-all" title="API ID">{a.id}</p>
                              </div>
                              <RiskBadge level={a.compositeLevel} />
                              <button
                                onClick={e => { e.stopPropagation(); toggleFavorite(a.id) }}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${favorites.has(a.id) ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}>
                                <Star className="w-3.5 h-3.5" fill={favorites.has(a.id) ? 'currentColor' : 'none'} />
                              </button>
                            </div>
                            <div className="grid grid-cols-4 gap-2 mb-3">
                              {(a.categories || []).slice(0, 4).map(cat => (
                                <div key={cat.name} className="text-center bg-white/[0.03] rounded-lg py-1.5">
                                  <p className="text-[9px] text-slate-400 truncate px-0.5">{cat.name.split(' ')[0]}</p>
                                  <p className="text-xs font-bold text-slate-900">{cat.score}</p>
                                </div>
                              ))}
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-3">
                              <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${a.compositeScore}%` }} />
                            </div>
                            <div className="flex items-center justify-between" onClick={e => e.stopPropagation()}>
                              <span className="text-[10px] text-slate-600">{timeAgo(a.createdAt)}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setSelectedForComparison(prev => { const n = new Set(prev); if (n.has(a.id)) n.delete(a.id); else if (n.size < 4) n.add(a.id); return n })}
                                  className={`h-6 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-0.5 transition-all ${isSelected ? 'bg-[#2dd4bf]/15 text-[#2dd4bf]' : 'bg-white/5 text-slate-500 hover:text-slate-300'}`}>
                                  <BarChart2 className="w-2.5 h-2.5" />{isSelected ? '✓' : '+'}
                                </button>
                                <button onClick={() => generateAnalysisPDF(a)} className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors"><Download className="w-2.5 h-2.5" /></button>
                                <button onClick={() => handleDelete(a.id)} className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors"><Trash2 className="w-2.5 h-2.5" /></button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ALERTS */}
          {view === 'alerts' && (
            <div className="h-full overflow-y-auto p-6">
              <p className="text-slate-500 text-xs mb-5">{tAlerts('subtitle', { total: analyses.length, count: alertCount })}</p>
              {[...criticalAlerts, ...highAlerts, ...analyses.filter(a => a.compositeLevel === 'medio')].length === 0 ? (
                <div className="text-center py-20">
                  <CheckCircle className="w-12 h-12 text-emerald-500/30 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">{tAlerts('noAlerts')}</p>
                  <p className="text-slate-600 text-xs mt-1">{tAlerts('portfolioNormal')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[...criticalAlerts, ...highAlerts, ...analyses.filter(a => a.compositeLevel === 'medio')].map(a => {
                    const c = rc(a.compositeLevel)
                    return (
                      <div key={a.id} onClick={() => router.push(`/analysis/${a.id}`)}
                        className={`p-4 rounded-2xl border cursor-pointer hover:opacity-80 transition-all ${c.bg} ${c.border}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${c.dot} ${a.compositeLevel === 'critico' ? 'animate-pulse' : ''} mt-0.5`} />
                            <RiskBadge level={a.compositeLevel} />
                            <span className="text-[10px] text-slate-500">{timeAgo(a.createdAt)}</span>
                          </div>
                          <span className={`text-lg font-bold tabular-nums ${c.text.replace("400", "600")}`}>{a.compositeScore}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900 mb-0.5">{a.title}</h3>
                        <p className="text-xs text-slate-500 mb-3">{a.address?.split(',')[0] || tAlerts('analyzedArea')}</p>
                        <p className="text-xs text-slate-600 line-clamp-2">{a.summary}</p>
                        <div className="mt-3 h-1 bg-black/10 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${a.compositeScore}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* COMPARE */}
          {view === 'compare' && (
            <div className="h-full overflow-y-auto p-6">
              {selectedForComparison.size < 2 ? (
                <div className="text-center py-20">
                  <BarChart2 className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">{tPortfolio('selectHint')}</p>
                  <p className="text-slate-600 text-xs mt-1 mb-4">{tPortfolio('selectHintSub')}</p>
                  <button onClick={() => setView('reports')} className="h-9 px-5 bg-slate-100 border border-slate-200 text-slate-600 text-sm rounded-xl hover:bg-slate-200 transition-colors">{tPortfolio('goToReports')}</button>
                </div>
              ) : (
                <div className="comparison-dark-wrapper">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-slate-500 text-xs">{tPortfolio('comparingCount', { count: selectedForComparison.size })}</p>
                    <button onClick={() => setSelectedForComparison(new Set())} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"><X className="w-3 h-3" /> {tPortfolio('clear')}</button>
                  </div>
                  <ComparisonPanel
                    selected={comparisonAnalyses}
                    onRemove={id => setSelectedForComparison(prev => { const n = new Set(prev); n.delete(id); return n })}
                    onClear={() => setSelectedForComparison(new Set())}
                  />
                </div>
              )}
            </div>
          )}

          {/* PORTFOLIO — Asset in gestione */}
          {view === 'portfolio' && <PortfolioPanel />}

          {/* API KEYS */}
          {view === 'apikeys' && (
            <div className="h-full overflow-y-auto p-6">
              <div className="max-w-xl">
                <p className="text-slate-500 text-xs mb-5">{tApikeys('subtitle')}</p>
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <ApiKeysPanel />
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {view === 'settings' && (
            <div className="h-full overflow-y-auto p-6">
              <div className="max-w-lg space-y-4">

                {/* Language */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4">Language / Lingua / Idioma</h3>
                  <LanguageSwitcher />
                </div>

                {/* Units */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4">{tSettings('measureUnit')}</h3>
                  <div className="flex gap-2">
                    {(['km2', 'ha'] as const).map(u => (
                      <button key={u} onClick={() => { const s = { ...settings, unit: u }; setSettings(s); saveSettings(s) }}
                        className={`h-9 px-4 rounded-xl text-sm font-medium transition-all ${settings.unit === u ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'}`}>
                        {u === 'km2' ? tSettings('squareKm') : tSettings('hectares')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Map style */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4">{tSettings('defaultMapStyle')}</h3>
                  <div className="flex gap-2">
                    {(['street', 'satellite', 'topo'] as MapStyleKey[]).map(s => (
                      <button key={s} onClick={() => { const ns = { ...settings, defaultMap: s }; setSettings(ns); saveSettings(ns) }}
                        className={`h-9 px-4 rounded-xl text-sm font-medium transition-all ${settings.defaultMap === s ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'}`}>
                        {s === 'street' ? tSettings('mapStyleStreet') : s === 'satellite' ? tSettings('mapStyleSatellite') : tSettings('mapStyleTopo')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Policy Risk Profile */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">{tSettings('riskPolicyProfile')}</h3>
                  <p className="text-xs text-slate-400 mb-4">{tSettings('riskPolicySub')}</p>
                  <div className="grid grid-cols-2 gap-2 mb-5">
                    {([
                      ['agricultural', '🌾', tSettings('agricultural'), tSettings('agriculturalDesc')],
                      ['property',     '🏘', tSettings('property'),     tSettings('propertyDesc')],
                      ['crop',         '🌿', tSettings('crop'),         tSettings('cropDesc')],
                      ['custom',       '⚙️', tSettings('custom'),       tSettings('customDesc')],
                    ] as const).map(([key, emoji, label, desc]) => (
                      <button key={key}
                        onClick={() => {
                          const pw: PolicyWeights = { profile: key, ...POLICY_PRESETS[key] }
                          const ns = { ...settings, policyWeights: pw }
                          setSettings(ns); saveSettings(ns)
                        }}
                        className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                          settings.policyWeights.profile === key
                            ? 'bg-violet-50 border-violet-300'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-base">{emoji}</span>
                          <span className={`text-xs font-bold ${settings.policyWeights.profile === key ? 'text-violet-800' : 'text-slate-700'}`}>{label}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{desc}</span>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {([
                      ['flood',     tSettings('floodLabel'),     'bg-blue-500'],
                      ['fire',      tSettings('fireLabel'),      'bg-orange-500'],
                      ['drought',   tSettings('droughtLabel'),   'bg-amber-500'],
                      ['urbanHeat', tSettings('urbanHeatLabel'), 'bg-red-500'],
                    ] as const).map(([key, label, barColor]) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-600 w-28 flex-shrink-0">{label}</span>
                        <input type="range" min={0} max={100} step={5}
                          value={settings.policyWeights[key]}
                          onChange={e => {
                            const pw: PolicyWeights = { ...settings.policyWeights, [key]: Number(e.target.value), profile: 'custom' }
                            const ns = { ...settings, policyWeights: pw }
                            setSettings(ns); saveSettings(ns)
                          }}
                          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-violet-600" />
                        <span className="text-xs font-bold text-slate-700 tabular-nums w-8 text-right">{settings.policyWeights[key]}%</span>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const tot = settings.policyWeights.flood + settings.policyWeights.fire + settings.policyWeights.drought + settings.policyWeights.urbanHeat
                    return (
                      <div className={`mt-3 text-xs font-semibold flex justify-between ${tot === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
                        <span>{tot === 100 ? tSettings('balanced') : tSettings('mustSum100')}</span>
                        <span>{tot}%</span>
                      </div>
                    )
                  })()}
                </div>

                {/* Account */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">{tSettings('account')}</h3>
                  <p className="text-sm text-slate-600 mb-1">{user?.email || 'Demo'}</p>
                  {isDemo && <p className="text-xs text-amber-500 mb-3">{tSettings('demoModeLocal')}</p>}
                  <button onClick={() => signOut()} className="flex items-center gap-2 h-9 px-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl hover:bg-red-100 transition-colors">
                    <LogOut className="w-3.5 h-3.5" /> {tSettings('disconnect')}
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>
      </main>

      {/* Global modals */}
      <AnalysisModal open={showAnalysisModal} drawnArea={drawnArea} address={searchResult?.address}
        unit={settings.unit} policy={selectedPolicy} onPolicyChange={setSelectedPolicy} onClose={() => setShowAnalysisModal(false)} onStart={handleStartAnalysis} />
      <CoordDialog open={showCoordDialog} onClose={() => setShowCoordDialog(false)} onStart={handleStartFromCoords} />
      <ProcessingOverlay open={processing} title={processingTitle} />

      <style>{`
        .comparison-dark-wrapper .rounded-xl,
        .comparison-dark-wrapper .rounded-2xl {
          background-color: rgba(255,255,255,0.025) !important;
          border-color: rgba(255,255,255,0.07) !important;
        }
        .comparison-dark-wrapper table { color: #cbd5e1; }
        .comparison-dark-wrapper thead tr { border-color: rgba(255,255,255,0.07); }
        .comparison-dark-wrapper tbody tr { border-color: rgba(255,255,255,0.04); }
        .comparison-dark-wrapper tbody tr:hover { background: rgba(255,255,255,0.03) !important; }
        .comparison-dark-wrapper .bg-slate-50 { background: rgba(255,255,255,0.03) !important; }
        .comparison-dark-wrapper .border-slate-200 { border-color: rgba(255,255,255,0.08) !important; }
        .comparison-dark-wrapper .text-slate-700 { color: #cbd5e1 !important; }
        .comparison-dark-wrapper .text-slate-600 { color: #94a3b8 !important; }
        .comparison-dark-wrapper .text-slate-500 { color: #64748b !important; }
        .comparison-dark-wrapper .text-slate-400 { color: #475569 !important; }
        .comparison-dark-wrapper .text-slate-900 { color: #f1f5f9 !important; }
        .comparison-dark-wrapper .text-slate-800 { color: #e2e8f0 !important; }
        .comparison-dark-wrapper .bg-white { background: rgba(255,255,255,0.04) !important; }
      `}</style>
    </div>
  )
}
