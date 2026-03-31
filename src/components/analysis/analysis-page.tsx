'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { loadAnalysisById } from '@/lib/analysis-engine'
import { AnalysisResult, PeriodResult, IndexResult, RiskCategory, RiskLevel } from '@/lib/types'
import { loadSettings, POLICY_PRESETS } from '@/components/user/user-panel'
import {
  ArrowLeft, Download, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, Minus, Info, MapPin, Calendar,
  SquareDashedBottom, Satellite, Flame, Droplets, Trees, Building2,
  Camera, Shield, Sliders
} from 'lucide-react'

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
  const colorForScore = (s: number) => {
    if (s < 25) return '#10b981'; if (s < 50) return '#f59e0b'
    if (s < 75) return '#f97316'; return '#ef4444'
  }
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
          const color = colorForScore(p.compositeRisk)
          const label = p.period.split(' / ')[0]
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx={3} fill={color} opacity={0.85} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="600">{p.compositeRisk}</text>
              <text x={x + barW / 2} y={h + 18} textAnchor="middle" fontSize="9" fill="#94a3b8" transform={`rotate(-30, ${x + barW / 2}, ${h + 18})`}>{label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Index card ────────────────────────────────────────────────────────────
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

// ─── Rischio composito per polizza ──────────────────────────────────────────
function CompositeRiskPanel({ analysis }: { analysis: AnalysisResult }) {
  const settings = loadSettings()
  const weights = settings.policyWeights
  const total = weights.flood + weights.fire + weights.drought + weights.urbanHeat

  // Mappa categorie alle metriche
  const vegCat = analysis.categories.find(c => c.name.includes('Vegetazione'))
  const waterCat = analysis.categories.find(c => c.name.includes('Idrico'))
  const urbanCat = analysis.categories.find(c => c.name.includes('Urbano'))
  const fireCat = analysis.categories.find(c => c.name.includes('Incendio'))

  const drought = vegCat?.score ?? 50
  const flood   = waterCat?.score ?? 50
  const urbanHeat = urbanCat?.score ?? 50
  const fire    = fireCat?.score ?? 50

  const compositeScore = total > 0
    ? Math.round((flood * weights.flood + fire * weights.fire + drought * weights.drought + urbanHeat * weights.urbanHeat) / total)
    : analysis.compositeScore

  const compositeLevel: RiskLevel = compositeScore < 25 ? 'basso' : compositeScore < 50 ? 'medio' : compositeScore < 75 ? 'alto' : 'critico'
  const profileLabels: Record<string, string> = {
    agricultural: 'Agricola', property: 'Immobiliare', crop: 'Colture', custom: 'Personalizzato'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-xl">
        <Sliders className="w-4 h-4 text-violet-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-violet-800">Profilo polizza: {profileLabels[weights.profile]}</p>
          <p className="text-[10px] text-violet-600 mt-0.5">
            Alluvione {weights.flood}% · Incendio {weights.fire}% · Siccità {weights.drought}% · Calore {weights.urbanHeat}%
          </p>
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
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-medium text-slate-700">{label}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-slate-900">{value}</span>
              <span className="text-[10px] text-slate-400">peso {weight}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
              <div className="h-full rounded-full" style={{
                width: `${value}%`,
                background: value >= 75 ? '#ef4444' : value >= 50 ? '#f97316' : value >= 25 ? '#f59e0b' : '#10b981'
              }} />
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="text-xs text-slate-500 flex items-start gap-1.5">
          <Shield className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400" />
          Modifica il profilo di polizza nelle Impostazioni → Rischio per personalizzare i pesi del calcolo composito.
        </p>
      </div>
    </div>
  )
}

// ─── Componente principale ─────────────────────────────────────────────────
export function AnalysisPage({ id }: { id: string }) {
  const router = useRouter()
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'indices' | 'timeline' | 'risk' | 'recommendations'>('overview')
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const a = loadAnalysisById(id)
    setAnalysis(a)
    setLoading(false)
  }, [id])

  // Export PDF — tutte le schede
  const handleExportPDF = () => {
    const style = document.createElement('style')
    style.id = '__pdf_print_style'
    style.textContent = `@media print{.tab-panel{display:block!important}.tab-nav{display:none!important}.print\\:hidden{display:none!important}header{position:static!important}body{background:white}.tab-panel-section{break-inside:avoid;page-break-inside:avoid;margin-bottom:2rem}}`
    document.head.appendChild(style)
    window.print()
    setTimeout(() => document.getElementById('__pdf_print_style')?.remove(), 1000)
  }

  // Export JSON strutturato
  const handleExportJSON = () => {
    if (!analysis) return
    const exportData = {
      _meta: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        source: 'GeoBridge — Satellite Risk Analysis Platform',
        dataType: 'mock_simulated',
      },
      id: analysis.id,
      title: analysis.title,
      address: analysis.address,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
      analysisMode: (analysis as unknown as { analysisMode?: string }).analysisMode ?? 'timeseries',
      period: { start: analysis.startDate, end: analysis.endDate },
      area: {
        km2: analysis.area,
        ha: parseFloat((analysis.area * 100).toFixed(2)),
        type: analysis.areaType,
        coordinates: analysis.coordinates,
      },
      compositeRisk: {
        score: analysis.compositeScore,
        level: analysis.compositeLevel,
        summary: analysis.summary,
      },
      categories: analysis.categories.map(c => ({
        name: c.name, score: c.score, level: c.level, description: c.description, factors: c.factors,
      })),
      spectralIndices: analysis.indices.map(i => ({
        name: i.name, fullName: i.fullName, value: i.value,
        trend: i.trend, trendValue: i.trendValue, interpretation: i.interpretation,
      })),
      temporalSeries: analysis.periods.map(p => ({
        period: p.period,
        date: p.date,
        indices: { ndvi: p.ndvi, ndmi: p.ndmi, nbr: p.nbr, ndbi: p.ndbi, brei: p.brei, dopi: p.dopi },
        risks: { vegetation: p.vegetationRisk, water: p.waterRisk, urban: p.urbanRisk, fire: p.fireRisk, composite: p.compositeRisk, level: p.riskLevel },
      })),
      recommendations: analysis.recommendations,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const slug = analysis.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    a.download = `geobridge_${slug}_${analysis.id.slice(0, 8)}.json`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  if (!analysis) {
    return (
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
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analysisMode = (analysis as any).analysisMode as 'snapshot' | 'timeseries' | undefined

  const tabs = [
    { key: 'overview' as const, label: 'Panoramica' },
    { key: 'indices' as const, label: 'Indici Spettrali' },
    { key: 'timeline' as const, label: 'Timeline' },
    { key: 'risk' as const, label: 'Rischio × Polizza' },
    { key: 'recommendations' as const, label: 'Raccomandazioni' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white" ref={printRef}>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 print:static">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={() => router.push('/')} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors print:hidden">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Satellite className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <h1 className="font-bold text-slate-900 text-base truncate">{analysis.title}</h1>
              {riskBadge(analysis.compositeLevel)}
              {analysisMode && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${analysisMode === 'snapshot' ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'}`}>
                  {analysisMode === 'snapshot' ? <><Camera className="w-3 h-3" /> Snapshot</> : <><TrendingUp className="w-3 h-3" /> Serie Storica</>}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Analisi del {formatDate(analysis.createdAt)} · Dati simulati [MOCK]</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-colors">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={handleExportJSON} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-xl transition-colors border border-emerald-200">
              <Download className="w-3.5 h-3.5" /> JSON
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
                  'bg-red-500/20 text-red-300'
                }`}>{analysis.compositeLevel.toUpperCase()}</span>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">{analysis.summary}</p>
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

        {/* TABS — nascosti nel print (mostriamo tutto) */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-100 overflow-x-auto tab-nav">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex-shrink-0 px-5 py-3.5 text-sm font-medium transition-all border-b-2 ${activeTab === t.key ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Contenuto tab — nell'export PDF mostro tutto in sequenza */}
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
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.icon}`}>
                          {categoryIcon(cat.name)}
                        </div>
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
                        {cat.factors.map(f => (
                          <span key={f} className="text-[11px] bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{f}</span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* INDICES */}
            <div className={`tab-panel tab-panel-section ${activeTab === 'indices' ? '' : 'hidden print:block'}`}>
              {activeTab !== 'indices' && <h3 className="text-base font-bold text-slate-800 mb-4 hidden print:block">Indici Spettrali</h3>}
              <p className="text-sm text-slate-500 mb-4">Indici spettrali derivati da immagini Sentinel-2 [SIMULATI]</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {analysis.indices.map(idx => <IndexCard key={idx.name} idx={idx} />)}
              </div>
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500 flex items-start gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" />
                  I valori mostrati sono generati da un motore di simulazione basato su dati geografici e stagionali.
                </p>
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
                    <p className="text-xs text-blue-600 mt-0.5">Questa analisi mostra la situazione attuale. Per visualizzare il trend storico, esegui una nuova analisi di tipo "Serie Storica".</p>
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
              <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-700">
                  <strong>Passo successivo:</strong> Collegare GeoSync con le credenziali Sentinel Hub per sostituire i dati simulati con analisi satellitari reali e ottenere valutazioni di rischio certificabili.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

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
