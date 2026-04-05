'use client'

import dynamic from 'next/dynamic'
import { X, Loader2, BarChart2, Trash2 } from 'lucide-react'
import { AnalysisResult, RiskLevel } from '@/lib/types'

const ComparisonMap = dynamic(
  () => import('./comparison-map').then(m => m.ComparisonMap),
  { ssr: false, loading: () => <div className="h-64 bg-slate-100 rounded-xl flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div> }
)
const ComparisonChart = dynamic(
  () => import('./comparison-chart').then(m => m.ComparisonChart),
  { ssr: false, loading: () => <div className="h-48 bg-slate-100 rounded-xl flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div> }
)

export const AREA_COLORS = [
  { name: 'Emerald', hex: '#10b981', bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50' },
  { name: 'Amber',   hex: '#f59e0b', bg: 'bg-amber-500',   border: 'border-amber-500',   text: 'text-amber-700',   light: 'bg-amber-50' },
  { name: 'Rose',    hex: '#f43f5e', bg: 'bg-rose-500',    border: 'border-rose-500',    text: 'text-rose-700',    light: 'bg-rose-50' },
  { name: 'Violet',  hex: '#8b5cf6', bg: 'bg-violet-500',  border: 'border-violet-500',  text: 'text-violet-700',  light: 'bg-violet-50' },
]

function riskBg(level: RiskLevel): string {
  return { basso: 'bg-emerald-100 text-emerald-700', medio: 'bg-amber-100 text-amber-700', alto: 'bg-orange-100 text-orange-700', critico: 'bg-red-100 text-red-700' }[level] ?? 'bg-slate-100 text-slate-700'
}

interface ComparisonPanelProps {
  selected: AnalysisResult[]
  onRemove: (id: string) => void
  onClear: () => void
}

export function ComparisonPanel({ selected, onRemove, onClear }: ComparisonPanelProps) {
  if (selected.length < 2) {
    return (
      <div className="px-5 py-8 text-center text-slate-400">
        <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-xs font-medium">Seleziona 2–4 analisi per confrontarle</p>
        <p className="text-[10px] mt-1 text-slate-300">Usa il tasto "Confronta" nella lista analisi</p>
      </div>
    )
  }

  const indices = ['ndvi', 'ndmi', 'nbr', 'ndbi', 'brei', 'dopi']
  const risks = ['vegetationRisk', 'waterRisk', 'urbanRisk', 'fireRisk', 'compositeRisk']
  const riskLabels: Record<string, string> = {
    vegetationRisk: 'Vegetazione', waterRisk: 'Idrico',
    urbanRisk: 'Urbanizzazione', fireRisk: 'Incendi', compositeRisk: 'Composito'
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header con badges */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {selected.map((a, i) => (
            <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: AREA_COLORS[i % 4].hex + '18', color: AREA_COLORS[i % 4].hex, border: `1px solid ${AREA_COLORS[i % 4].hex}40` }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: AREA_COLORS[i % 4].hex }} />
              {a.title}
              <button onClick={() => onRemove(a.id)} className="hover:opacity-70"><X className="w-2.5 h-2.5" /></button>
            </div>
          ))}
        </div>
        <button onClick={onClear} className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
          <Trash2 className="w-3 h-3" /> Pulisci
        </button>
      </div>

      {/* Mappa overlay */}
      <div className="rounded-xl overflow-hidden border border-slate-200">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-700">Overlay Mappa</p>
        </div>
        <ComparisonMap analyses={selected} colors={AREA_COLORS} />
      </div>

      {/* Tabella indici */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-700">Indici Spettrali (ultimo periodo)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 px-3 font-semibold text-slate-600">Indice</th>
                {selected.map((a, i) => (
                  <th key={a.id} className="text-center py-2 px-2 font-semibold whitespace-nowrap" style={{ color: AREA_COLORS[i % 4].hex }}>
                    {a.title.split(' ').slice(0, 2).join(' ')}
                  </th>
                ))}
                <th className="text-center py-2 px-2 font-semibold text-slate-500">Δ</th>
              </tr>
            </thead>
            <tbody>
              {indices.map(idx => {
                const values = selected.map(a => {
                  const last = a.periods[a.periods.length - 1]
                  return last ? (last as unknown as Record<string, number>)[idx] ?? 0 : 0
                })
                const delta = Math.max(...values) - Math.min(...values)
                return (
                  <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-mono font-bold text-slate-700">{idx.toUpperCase()}</td>
                    {values.map((v, i) => (
                      <td key={i} className="text-center py-2 px-2 tabular-nums font-medium" style={{ color: AREA_COLORS[i % 4].hex }}>{v.toFixed(3)}</td>
                    ))}
                    <td className="text-center py-2 px-2 tabular-nums text-slate-500">{delta.toFixed(3)}</td>
                  </tr>
                )
              })}
              {/* Separatore */}
              <tr><td colSpan={selected.length + 2} className="bg-slate-50 py-1 px-3 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Score di Rischio</td></tr>
              {risks.map(risk => {
                const values = selected.map(a => {
                  const last = a.periods[a.periods.length - 1]
                  return last ? (last as unknown as Record<string, number>)[risk] ?? 0 : 0
                })
                const delta = Math.max(...values) - Math.min(...values)
                const isComposite = risk === 'compositeRisk'
                return (
                  <tr key={risk} className={`border-b border-slate-50 ${isComposite ? 'font-bold bg-slate-50/60' : ''}`}>
                    <td className="py-2 px-3 text-slate-700">{riskLabels[risk]}</td>
                    {values.map((v, i) => (
                      <td key={i} className="text-center py-2 px-2">
                        <span className="tabular-nums font-medium" style={{ color: AREA_COLORS[i % 4].hex }}>{v}</span>
                      </td>
                    ))}
                    <td className="text-center py-2 px-2 text-slate-500 tabular-nums">{delta > 0 ? delta : '—'}</td>
                  </tr>
                )
              })}
              {/* Rischio composito badge */}
              <tr className="border-t-2 border-slate-200">
                <td className="py-2.5 px-3 text-xs font-bold text-slate-800">Livello Rischio</td>
                {selected.map((a, i) => (
                  <td key={i} className="text-center py-2.5 px-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${riskBg(a.compositeLevel)}`}>
                      {a.compositeLevel.toUpperCase()}
                    </span>
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Grafico */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-700">Grafico Comparativo</p>
        </div>
        <div className="p-3">
          <ComparisonChart analyses={selected} colors={AREA_COLORS} />
        </div>
      </div>
    </div>
  )
}
