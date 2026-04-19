'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadAnalysisById } from '@/lib/analysis-store'
import { saveAnalysis } from '@/lib/analysis-store'
import { useAuth } from '@/lib/auth-context'
import { AnalysisResult, PeriodResult, IndexResult, RiskCategory, RiskLevel, SpecificRisk, PolicyProfile } from '@/lib/types'
import { loadSettings, POLICY_PRESETS } from '@/components/user/user-panel'
import {
  ArrowLeft, Download, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, Minus, Info, MapPin, Calendar,
  SquareDashedBottom, Satellite, Flame, Droplets, Trees, Building2,
  Camera, Shield, Sliders, Save, Plus, X
} from 'lucide-react'
import { toast } from 'sonner'
import { generateAnalysisPDF } from '@/lib/pdf-generator'

// ─── Utility ──────────────────────────────────────────────────────────────

function riskBadge(level: RiskLevel) {
  const cfg: Record<RiskLevel, { bg: string; text: string; label: string }> = {
    basso:   { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'BASSO' },
    medio:   { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'MEDIO' },
    alto:    { bg: 'bg-orange-100',  text: 'text-orange-700',  label: 'ALTO' },
    critico: { bg: 'bg-red-100',     text: 'text-red-700',     label: 'CRITICO' },
  }
  const c = cfg[level] || cfg.basso
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${c.bg} ${c.text}`}>{c.label}</span>
}

function riskGauge(score: number, level: RiskLevel) {
  const colors: Record<RiskLevel, string> = { basso: '#10b981', medio: '#f59e0b', alto: '#f97316', critico: '#ef4444' }
  const color = colors[level] || colors.basso
  const circumference = 2 * Math.PI * 42
  const offset = circumference - (score / 100) * circumference
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="10" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900">{score}</span>
        <span className="text-xs text-slate-400 font-medium">/100</span>
      </div>
    </div>
  )
}

function TrendIcon({ trend, value }: { trend: IndexResult['trend']; value: number }) {
  if (trend === 'improving') return <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium"><TrendingUp className="w-3 h-3" />+{Math.abs(value).toFixed(3)}</span>
  if (trend === 'degrading') return <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><TrendingDown className="w-3 h-3" />-{Math.abs(value).toFixed(3)}</span>
  return <span className="flex items-center gap-1 text-xs text-slate-400 font-medium"><Minus className="w-3 h-3" />stabile</span>
}

function categoryIcon(name: string) {
  if (name.includes('Vegetazione')) return <Trees className="w-5 h-5" />
  if (name.includes('Idrico')) return <Droplets className="w-5 h-5" />
  if (name.includes('Urbano')) return <Building2 className="w-5 h-5" />
  if (name.includes('Incendio')) return <Flame className="w-5 h-5" />
  return <Info className="w-5 h-5" />
}

function categoryColor(level: RiskLevel) {
  return {
    basso:   { icon: 'bg-emerald-100 text-emerald-600', bar: 'bg-emerald-500', border: 'border-emerald-200' },
    medio:   { icon: 'bg-amber-100 text-amber-600',     bar: 'bg-amber-500',   border: 'border-amber-200' },
    alto:    { icon: 'bg-orange-100 text-orange-600',   bar: 'bg-orange-500',  border: 'border-orange-200' },
    critico: { icon: 'bg-red-100 text-red-600',         bar: 'bg-red-500',     border: 'border-red-200' },
  }[level] || { icon: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400', border: 'border-slate-200' }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatArea(km2: number) {
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`
}

// ─── Timeline chart ────────────────────────────────────────────────────────
function RiskTimelineChart({ periods }: { periods: PeriodResult[] }) {
  if (!periods.length) return null
  const maxW = 560; const h = 140
  const barW = Math.min(40, (maxW / periods.length) - 6)
  const gap = (maxW - barW * periods.length) / (periods.length + 1)
  const colorForScore = (s: number) => s < 25 ? '#10b981' : s < 50 ? '#f59e0b' : s < 75 ? '#f97316' : '#ef4444'
  return (
    <div className="overflow-x-auto">
      <svg width={maxW} height={h + 48} className="overflow-visible">
        {[0, 25, 50, 75, 100].map(v => {
          const y = h - (v / 100) * h
          return (
            <g key={v}>
              <line x1={0} y1={y} x2={maxW} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={-4} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{v}</text>
            </g>
          )
        })}
        {periods.map((p, i) => {
          const x = gap + i * (barW + gap)
          const barH = (p.compositeRisk / 100) * h
          const y = h - barH
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={3} fill={colorForScore(p.compositeRisk)} opacity={0.85} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">{p.compositeRisk}</text>
              <text x={x + barW / 2} y={h + 18} textAnchor="middle" fontSize="9" fill="#94a3b8" transform={`rotate(-30, ${x + barW / 2}, ${h + 18})`}>{p.period.split(' / ')[0]}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function IndexCard({ idx }: { idx: IndexResult }) {
  const pct = Math.round((idx.value + 1) / 2 * 100)
  const barColor = idx.value > 0.4 ? '#10b981' : idx.value > 0.1 ? '#f59e0b' : '#ef4444'
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="font-mono font-bold text-sm text-slate-900">{idx.name}</span>
          <p className="text-[11px] text-slate-400 mt-0.5">{idx.fullName}</p>
        </div>
        <span className="text-xl font-bold text-slate-900">{idx.value.toFixed(3)}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <p className="text-xs text-slate-600 mb-2 leading-relaxed">{idx.interpretation}</p>
      <TrendIcon trend={idx.trend} value={idx.trendValue} />
    </div>
  )
}

// ─── ML Risks Panel ────────────────────────────────────────────────────────
function MLRisksPanel({ analysis }: { analysis: AnalysisResult }) {
  const risks = analysis.specificRisks ?? []
  const ml = analysis.mlModel

  const riskIcon: Record<string, string> = {
    flood: '🌊', landslide: '⛰️', fire: '🔥', drought: '☀️',
    earthquake: '🌍', heatwave: '🌡️', frost: '❄️', pest: '🐛',
  }
  const severityColor: Record<string, string> = {
    basso: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    medio: 'bg-amber-100 text-amber-700 border-amber-200',
    alto: 'bg-orange-100 text-orange-700 border-orange-200',
    critico: 'bg-red-100 text-red-700 border-red-200',
  }

  return (
    <div className="space-y-5">
      {/* ML metadata */}
      {ml && (
        <div className="p-4 bg-slate-800 rounded-2xl text-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">ML</span>
            </div>
            <div>
              <p className="text-sm font-bold">Modello {ml.modelVersion}</p>
              <p className="text-white/50 text-[10px]">Training: {ml.trainingData}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] text-white/50">Confidenza globale</p>
              <p className="text-emerald-400 font-bold">{Math.round((ml.overallConfidence ?? 0.75) * 100)}%</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div><p className="text-white/40 mb-0.5">Bioma</p><p className="text-white/80 font-medium">{ml.biome}</p></div>
            <div><p className="text-white/40 mb-0.5">Uso suolo (Corine)</p><p className="text-white/80 font-medium">{ml.landUseCorine}</p></div>
            <div><p className="text-white/40 mb-0.5">Quota s.l.m.</p><p className="text-white/80 font-medium">{ml.elevation} m</p></div>
            <div><p className="text-white/40 mb-0.5">Pendenza</p><p className="text-white/80 font-medium">{ml.slope}°</p></div>
          </div>
        </div>
      )}

      <p className="text-sm text-slate-500">Probabilità di evento per tipo nelle prossime finestre temporali — modello addestrato su EFFIS 2000–2023 [SIMULATO]</p>

      {/* Specific risks grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {risks.map(r => (
          <div key={r.type} className="bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{riskIcon[r.type] ?? '⚠️'}</span>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{r.label}</p>
                  <p className="text-[10px] text-slate-400">Confidenza: {Math.round(r.confidence * 100)}%</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${severityColor[r.severity]}`}>
                {r.severity.toUpperCase()}
              </span>
            </div>

            {/* Probability bars */}
            <div className="space-y-2 mb-3">
              {[
                { label: '30 giorni', value: r.probability30d },
                { label: '90 giorni', value: r.probability90d },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                    <span>{label}</span>
                    <span className="font-bold text-slate-700">{value}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${value}%`, background: value >= 60 ? '#ef4444' : value >= 35 ? '#f97316' : value >= 15 ? '#f59e0b' : '#10b981' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Drivers */}
            <div>
              <p className="text-[10px] text-slate-400 mb-1">Driver principali:</p>
              <div className="flex flex-wrap gap-1">
                {r.drivers.map(d => (
                  <span key={d} className="text-[9px] bg-slate-50 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md">{d}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Policy params */}
      {analysis.policyParams && (
        <div className="p-4 bg-violet-50 border border-violet-200 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Sliders className="w-4 h-4 text-violet-600" />
            <p className="text-sm font-bold text-violet-900">
              Parametri Specifici — Profilo {
                { agricultural: 'Agricola', property: 'Immobiliare', crop: 'Colture specializzate', custom: 'Custom' }[analysis.policyProfile ?? 'custom']
              }
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Score assicurativo */}
            <div className="bg-white border border-violet-100 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 mb-0.5">Score Assicurativo</p>
              <p className="text-xl font-bold text-violet-700">{analysis.policyParams.insuranceRelevantScore}/100</p>
            </div>
            <div className="bg-white border border-violet-100 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 mb-0.5">Aggiustamento Premio</p>
              <p className={`text-xl font-bold ${(analysis.policyParams.premiumAdjustment ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {(analysis.policyParams.premiumAdjustment ?? 0) > 0 ? '+' : ''}{analysis.policyParams.premiumAdjustment}%
              </p>
            </div>
            {/* Agricola/Colture */}
            {analysis.policyParams.cropType && (
              <div className="bg-white border border-violet-100 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Tipo coltura</p>
                <p className="text-xs font-semibold text-slate-700">{analysis.policyParams.cropType}</p>
              </div>
            )}
            {analysis.policyParams.phenologyStage && (
              <div className="bg-white border border-violet-100 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Fase fenologica</p>
                <p className="text-xs font-semibold text-slate-700">{analysis.policyParams.phenologyStage}</p>
              </div>
            )}
            {analysis.policyParams.irrigationRisk !== undefined && (
              <div className="bg-white border border-violet-100 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Rischio irrigazione</p>
                <p className="text-xs font-bold text-slate-900">{analysis.policyParams.irrigationRisk}/100</p>
              </div>
            )}
            {analysis.policyParams.yieldImpact !== undefined && (
              <div className="bg-white border border-violet-100 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Perdita produzione stimata</p>
                <p className="text-xs font-bold text-orange-600">{analysis.policyParams.yieldImpact}%</p>
              </div>
            )}
            {/* Immobiliare */}
            {analysis.policyParams.floodZone && (
              <div className="bg-white border border-violet-100 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Fascia PAI alluvione</p>
                <p className="text-xs font-semibold text-slate-700">{analysis.policyParams.floodZone}</p>
              </div>
            )}
            {analysis.policyParams.seismicZone && (
              <div className="bg-white border border-violet-100 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Zona sismica</p>
                <p className="text-xs font-semibold text-slate-700">{analysis.policyParams.seismicZone}</p>
              </div>
            )}
            {analysis.policyParams.structuralRisk !== undefined && (
              <div className="bg-white border border-violet-100 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Rischio strutturale</p>
                <p className="text-xs font-bold text-slate-900">{analysis.policyParams.structuralRisk}/100</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Composite Risk Panel ──────────────────────────────────────────────────
function CompositeRiskPanel({ analysis }: { analysis: AnalysisResult }) {
  const settings = loadSettings()
  const weights = settings.policyWeights
  const total = weights.flood + weights.fire + weights.drought + weights.urbanHeat
  const vegCat   = analysis.categories.find(c => c.name.includes('Vegetazione'))
  const waterCat = analysis.categories.find(c => c.name.includes('Idrico'))
  const urbanCat = analysis.categories.find(c => c.name.includes('Urbano'))
  const fireCat  = analysis.categories.find(c => c.name.includes('Incendio'))
  const drought = vegCat?.score ?? 50; const flood = waterCat?.score ?? 50
  const urbanHeat = urbanCat?.score ?? 50; const fire = fireCat?.score ?? 50
  const compositeScore = total > 0
    ? Math.round((flood * weights.flood + fire * weights.fire + drought * weights.drought + urbanHeat * weights.urbanHeat) / total)
    : analysis.compositeScore
  const compositeLevel: RiskLevel = compositeScore < 25 ? 'basso' : compositeScore < 50 ? 'medio' : compositeScore < 75 ? 'alto' : 'critico'
  const profileLabels: Record<string, string> = { agricultural: 'Agricola', property: 'Immobiliare', crop: 'Colture', custom: 'Personalizzato' }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-xl">
        <Sliders className="w-4 h-4 text-violet-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-violet-800">Profilo polizza: {profileLabels[weights.profile]}</p>
          <p className="text-[10px] text-violet-600 mt-0.5">Alluvione {weights.flood}% · Incendio {weights.fire}% · Siccità {weights.drought}% · Calore {weights.urbanHeat}%</p>
        </div>
      </div>
      <div className="flex items-center gap-6 p-5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl">
        {riskGauge(compositeScore, compositeLevel)}
        <div>
          <div className="text-white/60 text-xs uppercase tracking-wider mb-1">Rischio Composito Ponderato</div>
          <div className="text-3xl font-bold text-white mb-1">{compositeScore}/100</div>
          <div>{riskBadge(compositeLevel)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Alluvione', value: flood, weight: weights.flood, icon: Droplets, color: 'text-blue-500 bg-blue-50' },
          { label: 'Incendio', value: fire, weight: weights.fire, icon: Flame, color: 'text-orange-500 bg-orange-50' },
          { label: 'Siccità', value: drought, weight: weights.drought, icon: Trees, color: 'text-amber-500 bg-amber-50' },
          { label: 'Calore urbano', value: urbanHeat, weight: weights.urbanHeat, icon: Building2, color: 'text-red-400 bg-red-50' },
        ].map(({ label, value, weight, icon: Icon, color }) => (
          <div key={label} className="p-3 bg-white border border-slate-100 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}><Icon className="w-3.5 h-3.5" /></div>
              <span className="text-xs font-medium text-slate-700">{label}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-slate-900">{value}</span>
              <span className="text-[10px] text-slate-400">peso {weight}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${value}%`, background: value >= 75 ? '#ef4444' : value >= 50 ? '#f97316' : value >= 25 ? '#f59e0b' : '#10b981' }} />
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="text-xs text-slate-500 flex items-start gap-1.5">
          <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400" />
          Modifica il profilo nelle Impostazioni → Rischio per personalizzare i pesi del calcolo.
        </p>
      </div>
    </div>
  )
}

// ─── Popup "esci senza salvare" ────────────────────────────────────────────
function UnsavedExitModal({ open, onSaveAndExit, onExitWithout, onCancel }: {
  open: boolean
  onSaveAndExit: () => void
  onExitWithout: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" style={{ animation: 'modalIn .15s cubic-bezier(0.4,0,0.2,1)' }}>
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>
        <div className="p-6">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="text-base font-bold text-slate-900 text-center mb-2">Analisi non salvata</h3>
          <p className="text-sm text-slate-500 text-center leading-relaxed mb-6">
            Vuoi uscire senza salvare questa analisi? Andrai a perderla.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={onSaveAndExit}
              className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
              <Save className="w-4 h-4" /> Salva ed esci
            </button>
            <button onClick={onExitWithout}
              className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
              Esci senza salvare
            </button>
            <button onClick={onCancel}
              className="w-full h-9 text-slate-400 hover:text-slate-600 text-xs transition-colors">
              Annulla — rimani qui
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principale ─────────────────────────────────────────────────
export function AnalysisPage({ id }: { id: string }) {
  const router = useRouter()
  const { user, isDemo } = useAuth()
  const userId = user?.id

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'indices' | 'timeline' | 'risk' | 'ml' | 'recommendations'>('overview')
  const [isSaved, setIsSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const pendingNavRef = useRef<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  // Dati sempre reali — nessun fallback mock
  const isMock = false
  const copernicusError: string | null = null

  /* ── Carica analisi: prima cerca in sessionStorage (pending), poi store ── */
  useEffect(() => {
    async function load() {
      setLoading(true)
      // 1. Controlla se c'è un risultato pending in sessionStorage
      const pending = sessionStorage.getItem('gb_pending_analysis')
      if (pending) {
        try {
          const parsed = JSON.parse(pending)
          if (parsed.id === id) {
            setAnalysis(parsed)
            setIsSaved(false)   // non ancora salvata
            setLoading(false)
            return
          }
        } catch {}
      }
      // 2. Non è pending → carica dallo store (già salvata)
      const a = await loadAnalysisById(id, userId)
      setAnalysis(a)
      setIsSaved(true)          // se è nello store è già salvata
      setLoading(false)
    }
    load()
  }, [id, userId])

  /* ── Salva analisi ───────────────────────────────────────────────────── */
  const handleSave = useCallback(async () => {
    if (!analysis || isSaved || saving) return
    setSaving(true)
    try {
      await saveAnalysis(analysis, userId)
      sessionStorage.removeItem('gb_pending_analysis')
      setIsSaved(true)
      toast.success('Analisi salvata!')
    } catch {
      toast.error('Errore nel salvataggio. Riprova.')
    } finally {
      setSaving(false)
    }
  }, [analysis, isSaved, saving, userId])

  /* ── Navigazione con intercettazione "esci senza salvare" ──────────────
     Usiamo un ref per la destinazione e mostriamo il modal se non salvata */
  const navigateAway = useCallback((destination: string) => {
    if (!isSaved && analysis) {
      pendingNavRef.current = destination
      setShowExitModal(true)
    } else {
      sessionStorage.removeItem('gb_pending_analysis')
      router.push(destination)
    }
  }, [isSaved, analysis, router])

  // Torna al dashboard (view di default)
  const goBack = useCallback(() => {
    sessionStorage.removeItem('gb_shell_view')
    navigateAway('/')
  }, [navigateAway])

  // Apre la mappa per nuova analisi
  const goNewAnalysis = useCallback(() => {
    sessionStorage.setItem('gb_shell_view', 'map')
    navigateAway('/')
  }, [navigateAway])

  const handleSaveAndExit = async () => {
    await handleSave()
    setShowExitModal(false)
    sessionStorage.removeItem('gb_pending_analysis')
    router.push(pendingNavRef.current ?? '/')
  }

  const handleExitWithout = () => {
    setShowExitModal(false)
    sessionStorage.removeItem('gb_pending_analysis')
    router.push(pendingNavRef.current ?? '/')
  }

  /* ── Export PDF professionale ────────────────────────────────────────── */
  const handleExportPDF = async () => {
    if (!analysis || generatingPDF) return
    setGeneratingPDF(true)
    try {
      await generateAnalysisPDF(analysis)
      toast.success('PDF generato!')
    } catch (err) {
      console.error('PDF error:', err)
      toast.error('Errore nella generazione del PDF. Riprova.')
    } finally {
      setGeneratingPDF(false)
    }
  }

  /* ── Export JSON ─────────────────────────────────────────────────────── */
  const handleExportJSON = () => {
    if (!analysis) return
    const exportData = {
      _meta: { exportedAt: new Date().toISOString(), version: '1.0', source: 'GeoBridge', dataType: 'mock_simulated' },
      id: analysis.id, title: analysis.title, address: analysis.address,
      createdAt: analysis.createdAt, completedAt: analysis.completedAt,
      analysisMode: (analysis as unknown as { analysisMode?: string }).analysisMode ?? 'timeseries',
      period: { start: analysis.startDate, end: analysis.endDate },
      area: { km2: analysis.area, ha: parseFloat((analysis.area * 100).toFixed(2)), type: analysis.areaType, coordinates: analysis.coordinates },
      compositeRisk: { score: analysis.compositeScore, level: analysis.compositeLevel, summary: analysis.summary },
      categories: analysis.categories.map(c => ({ name: c.name, score: c.score, level: c.level, description: c.description, factors: c.factors })),
      spectralIndices: analysis.indices.map(i => ({ name: i.name, fullName: i.fullName, value: i.value, trend: i.trend, trendValue: i.trendValue, interpretation: i.interpretation })),
      temporalSeries: analysis.periods.map(p => ({
        period: p.period, date: p.date,
        indices: { ndvi: p.ndvi, ndmi: p.ndmi, nbr: p.nbr, ndbi: p.ndbi, brei: p.brei, dopi: p.dopi },
        risks: { vegetation: p.vegetationRisk, water: p.waterRisk, urban: p.urbanRisk, fire: p.fireRisk, composite: p.compositeRisk, level: p.riskLevel },
      })),
      recommendations: analysis.recommendations,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `geobridge_${analysis.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${analysis.id.slice(0, 8)}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  )

  if (!analysis) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Analisi non trovata</h2>
        <p className="text-slate-500 mb-6">L'analisi richiesta non è disponibile.</p>
        <button onClick={() => router.push('/')} className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-emerald-600 transition-colors">
          Torna alla mappa
        </button>
      </div>
    </div>
  )

  const analysisMode = (analysis as unknown as { analysisMode?: string }).analysisMode

  const tabs = [
    { key: 'overview' as const,         label: 'Panoramica' },
    { key: 'indices' as const,          label: 'Indici Spettrali' },
    { key: 'timeline' as const,         label: 'Timeline' },
    { key: 'risk' as const,             label: 'Rischio × Polizza' },
    { key: 'ml' as const,               label: 'Rischi Specifici ML' },
    { key: 'recommendations' as const,  label: 'Raccomandazioni' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white" ref={printRef}>

      {/* ── HEADER ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 print:static">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">

          {/* ── Riga unica su desktop, due righe su mobile ── */}
          <div className="flex items-center gap-2">

            {/* Indietro → dashboard */}
            <button onClick={goBack}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors print:hidden flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>

            {/* Titolo + badge — si contrae su mobile */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Satellite className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <h1 className="font-bold text-slate-900 text-sm sm:text-base truncate max-w-[120px] sm:max-w-none">{analysis.title}</h1>
                {riskBadge(analysis.compositeLevel)}
                {/* Badge modo — solo su sm+ */}
                {analysisMode && (
                  <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${analysisMode === 'snapshot' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'}`}>
                    {analysisMode === 'snapshot' ? <><Camera className="w-3 h-3" /> Snapshot</> : <><TrendingUp className="w-3 h-3" /> Serie Storica</>}
                  </span>
                )}
                {!isSaved && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-amber-100 text-amber-600">
                    Non salvata
                  </span>
                )}
              </div>
              {/* Sottotitolo — solo su sm+ */}
              <p className="hidden sm:block text-xs text-slate-400 mt-0.5">
                Analisi del {formatDate(analysis.createdAt)}
                {isMock
                  ? <span className="ml-1 text-amber-500 font-semibold">· ⚠ Dati simulati [MOCK]</span>
                  : <span className="ml-1 text-emerald-500 font-semibold">· 🛰 Sentinel-2 reale</span>
                }
                {isDemo && <span className="ml-1 text-amber-500">· demo</span>}
              </p>
            </div>

            {/* ── Azioni ── */}
            <div className="flex items-center gap-1.5 sm:gap-2 print:hidden flex-shrink-0">

              {/* Salva — testo su desktop, solo icona su mobile */}
              {!isSaved ? (
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
                  <Save className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">{saving ? 'Salvataggio…' : 'Salva'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-xl border border-emerald-200">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline">Salvata</span>
                </div>
              )}

              {/* PDF — solo testo su desktop */}
              <button onClick={handleExportPDF} disabled={generatingPDF}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 text-xs font-medium rounded-xl transition-colors">
                {generatingPDF
                  ? <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  : <Download className="w-3.5 h-3.5 flex-shrink-0" />
                }
                <span className="hidden sm:inline">{generatingPDF ? 'Generazione…' : 'PDF'}</span>
              </button>

              {/* JSON — nascosto su mobile (accessibile dal menu export) */}
              <button onClick={handleExportJSON}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-xl transition-colors border border-emerald-200">
                <Download className="w-3.5 h-3.5" /> JSON
              </button>

              {/* Nuova analisi → view mappa */}
              <button onClick={goNewAnalysis}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors">
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">Nuova analisi</span>
              </button>
            </div>
          </div>

          {/* ── Riga extra solo mobile: data + JSON export ── */}
          <div className="flex sm:hidden items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 truncate flex-1">
              {formatDate(analysis.createdAt)}
              {isMock ? ' · ⚠ MOCK' : ' · 🛰 Reale'}
              {isDemo ? ' · demo' : ''}
            </p>
            <button onClick={handleExportJSON}
              className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded-lg transition-colors border border-emerald-200 flex-shrink-0 ml-2">
              <Download className="w-3 h-3" /> JSON
            </button>
          </div>

        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* HERO */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-6 text-white tab-panel-section">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="flex-shrink-0">{riskGauge(analysis.compositeScore, analysis.compositeLevel)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-white/60 text-xs font-medium uppercase tracking-wider mb-1">Rischio Composito</div>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-3xl font-bold">{analysis.compositeScore}/100</span>
                <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${
                  analysis.compositeLevel === 'basso' ? 'bg-emerald-500/20 text-emerald-300' :
                  analysis.compositeLevel === 'medio' ? 'bg-amber-500/20 text-amber-300' :
                  analysis.compositeLevel === 'alto' ? 'bg-orange-500/20 text-orange-300' :
                  'bg-red-500/20 text-red-300'}`}>{analysis.compositeLevel.toUpperCase()}</span>
              </div>
              {copernicusError && (
                <div className="mb-3 bg-red-500/20 border border-red-400/40 rounded-xl px-4 py-3">
                  <p className="text-red-300 text-xs font-bold mb-1">⚠ Errore Copernicus — dati non disponibili</p>
                  <p className="text-red-200/80 text-xs font-mono break-all leading-relaxed">{copernicusError}</p>
                </div>
              )}
              {isMock && !copernicusError && (
                <div className="mb-3 bg-amber-500/15 border border-amber-400/30 rounded-xl px-4 py-3">
                  <p className="text-amber-300 text-xs font-semibold">⚠ Dati simulati — le credenziali Copernicus non sono configurate o la chiamata è fallita.</p>
                </div>
              )}
              <p className="text-white/70 text-sm leading-relaxed">{analysis.summary}</p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-white/40 text-[10px] uppercase tracking-wider">ID API:</span>
                <code className="text-emerald-300 text-[10px] font-mono bg-white/5 px-2 py-0.5 rounded select-all cursor-text">{analysis.id}</code>
                <span className="text-white/30 text-[10px]">GET /api/v1/analyses/{'{'}analysis.id{'}'}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-white/10">
            {[
              { icon: <MapPin className="w-3.5 h-3.5" />, label: 'Area', value: formatArea(analysis.area) },
              { icon: <SquareDashedBottom className="w-3.5 h-3.5" />, label: 'Tipo zona', value: analysis.areaType === 'rectangle' ? 'Rettangolo' : analysis.areaType === 'lasso' ? 'Zona libera' : 'Poligono' },
              { icon: <Calendar className="w-3.5 h-3.5" />, label: 'Periodo', value: `${formatDate(analysis.startDate)} — ${formatDate(analysis.endDate)}` },
              { icon: <Satellite className="w-3.5 h-3.5" />, label: 'Periodi analizzati', value: `${analysis.periods.length} semestri` },
            ].map(({ icon, label, value }) => (
              <div key={label}>
                <div className="flex items-center gap-1.5 text-white/50 text-[10px] font-medium uppercase tracking-wider mb-1">{icon}{label}</div>
                <div className="text-white text-sm font-medium">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-100 overflow-x-auto tab-nav">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex-shrink-0 px-5 py-3.5 text-sm font-medium transition-all border-b-2 ${activeTab === t.key ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5">

            {/* OVERVIEW */}
            <div className={`tab-panel tab-panel-section ${activeTab === 'overview' ? '' : 'hidden print:block'}`}>
              {activeTab !== 'overview' && <h3 className="text-base font-bold text-slate-800 mb-4 hidden print:block">Panoramica</h3>}
              <p className="text-sm text-slate-500 mb-4">Valutazione per categoria di rischio</p>
              <div className="space-y-4">
                {analysis.categories.map(cat => {
                  const c = categoryColor(cat.level)
                  return (
                    <div key={cat.name} className={`border ${c.border} rounded-2xl p-4`}>
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.icon}`}>{categoryIcon(cat.name)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 text-sm">{cat.name}</span>
                            {riskBadge(cat.level)}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{cat.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-2xl font-bold text-slate-900">{cat.score}</span>
                          <span className="text-xs text-slate-400">/100</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                        <div className={`h-full rounded-full transition-all duration-700 ${c.bar}`} style={{ width: `${cat.score}%` }} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {cat.factors.map(f => <span key={f} className="text-[11px] bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{f}</span>)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* INDICES */}
            <div className={`tab-panel tab-panel-section ${activeTab === 'indices' ? '' : 'hidden print:block'}`}>
              {activeTab !== 'indices' && <h3 className="text-base font-bold text-slate-800 mb-4 hidden print:block">Indici Spettrali</h3>}
              <p className="text-sm text-slate-500 mb-4">Indici spettrali derivati da immagini Sentinel-2{isMock ? " [SIMULATI]" : " · Sentinel-2 L2A reale (Copernicus)"}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {analysis.indices.map(idx => <IndexCard key={idx.name} idx={idx} />)}
              </div>
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500 flex items-start gap-2"><Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" />{isMock ? "Valori simulati — credenziali Copernicus non configurate o chiamata fallita. Vedi il box rosso in cima alla pagina per il dettaglio." : "Dati reali da Sentinel-2 L2A (Copernicus) · NDVI, EVI, NDMI, NBR, NDBI, BREI calcolati su area selezionata."}</p>
              </div>
            </div>

            {/* TIMELINE */}
            <div className={`tab-panel tab-panel-section ${activeTab === 'timeline' ? '' : 'hidden print:block'}`}>
              {activeTab !== 'timeline' && <h3 className="text-base font-bold text-slate-800 mb-4 hidden print:block">Timeline</h3>}
              {analysisMode === 'snapshot' ? (
                <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                  <Camera className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Analisi Snapshot</p>
                    <p className="text-xs text-blue-600 mt-0.5">Mostra la situazione corrente. Per il trend storico, avvia una nuova analisi "Serie Storica".</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 mb-5">Evoluzione del rischio composito per periodo semestrale</p>
              )}
              <RiskTimelineChart periods={analysis.periods} />
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Periodo', 'NDVI', 'NDMI', 'NBR', 'NDBI', 'Veg.', 'Idrico', 'Urbano', 'Incendio', 'Composito'].map(h => (
                        <th key={h} className="text-left py-2 px-2 font-medium text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.periods.map((p, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 px-2 font-medium text-slate-700 whitespace-nowrap">{p.period}</td>
                        <td className="py-2 px-2 font-mono text-slate-600">{p.ndvi.toFixed(2)}</td>
                        <td className="py-2 px-2 font-mono text-slate-600">{p.ndmi.toFixed(2)}</td>
                        <td className="py-2 px-2 font-mono text-slate-600">{p.nbr.toFixed(2)}</td>
                        <td className="py-2 px-2 font-mono text-slate-600">{p.ndbi.toFixed(2)}</td>
                        <td className="py-2 px-2">{riskBadge(p.vegetationRisk < 25 ? 'basso' : p.vegetationRisk < 50 ? 'medio' : p.vegetationRisk < 75 ? 'alto' : 'critico')}</td>
                        <td className="py-2 px-2">{riskBadge(p.waterRisk < 25 ? 'basso' : p.waterRisk < 50 ? 'medio' : p.waterRisk < 75 ? 'alto' : 'critico')}</td>
                        <td className="py-2 px-2">{riskBadge(p.urbanRisk < 25 ? 'basso' : p.urbanRisk < 50 ? 'medio' : p.urbanRisk < 75 ? 'alto' : 'critico')}</td>
                        <td className="py-2 px-2">{riskBadge(p.fireRisk < 25 ? 'basso' : p.fireRisk < 50 ? 'medio' : p.fireRisk < 75 ? 'alto' : 'critico')}</td>
                        <td className="py-2 px-2"><span className="font-bold text-slate-900">{p.compositeRisk}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RISK × POLIZZA */}
            <div className={`tab-panel tab-panel-section ${activeTab === 'risk' ? '' : 'hidden print:block'}`}>
              {activeTab !== 'risk' && <h3 className="text-base font-bold text-slate-800 mb-4 hidden print:block">Rischio × Polizza</h3>}
              <CompositeRiskPanel analysis={analysis} />
            </div>


            {/* ML SPECIFIC RISKS */}
            <div className={`tab-panel tab-panel-section ${activeTab === 'ml' ? '' : 'hidden print:block'}`}>
              {activeTab !== 'ml' && <h3 className="text-base font-bold text-slate-800 mb-4 hidden print:block">Rischi Specifici ML</h3>}
              <MLRisksPanel analysis={analysis} />
            </div>

            {/* RECOMMENDATIONS */}
            <div className={`tab-panel tab-panel-section ${activeTab === 'recommendations' ? '' : 'hidden print:block'}`}>
              {activeTab !== 'recommendations' && <h3 className="text-base font-bold text-slate-800 mb-4 hidden print:block">Raccomandazioni</h3>}
              <p className="text-sm text-slate-500 mb-4">Azioni raccomandate basate sui risultati dell'analisi</p>
              <div className="space-y-3">
                {analysis.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                    <p className="text-sm text-slate-700 leading-relaxed">{rec}</p>
                  </div>
                ))}
              </div>
              {isMock ? (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700">
                    <strong>Dati simulati:</strong> Le credenziali Copernicus non sono configurate o la chiamata a Sentinel Hub è fallita. Verifica le variabili <code className="bg-amber-100 px-1 rounded">COPERNICUS_CLIENT_ID</code> e <code className="bg-amber-100 px-1 rounded">COPERNICUS_CLIENT_SECRET</code> su Vercel.
                  </p>
                </div>
              ) : (
                <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-emerald-700">
                    <strong>Dati reali Copernicus:</strong> Questa analisi utilizza indici spettrali reali da Sentinel-2 L2A. NDVI, EVI, NDMI, NBR, NDBI e BREI sono stati calcolati sull&apos;area selezionata tramite Sentinel Hub Statistical API.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Modal "esci senza salvare" */}
      <UnsavedExitModal
        open={showExitModal}
        onSaveAndExit={handleSaveAndExit}
        onExitWithout={handleExitWithout}
        onCancel={() => setShowExitModal(false)}
      />

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          header { position: static !important; }
          body { background: white; }
          .tab-nav { display: none !important; }
          .tab-panel { display: block !important; }
          .hidden.print\\:block { display: block !important; }
          .tab-panel-section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 2rem; }
        }
      `}</style>
    </div>
  )
}
