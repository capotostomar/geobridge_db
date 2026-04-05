'use client'

import { useState } from 'react'
import { X, MapPin, Clock, Trash2, ChevronRight, Satellite, BarChart2 } from 'lucide-react'
import { AnalysisResult, RiskLevel } from '@/lib/types'
import { ComparisonPanel } from '@/components/comparison/comparison-panel'

interface SavedSidebarProps {
  open: boolean
  onClose: () => void
  analyses: AnalysisResult[]
  onFocus: (a: AnalysisResult) => void
  onOpen: (a: AnalysisResult) => void
  onDelete: (id: string) => void
  unit: 'km2' | 'ha'
}

function formatArea(km2: number, unit: 'km2' | 'ha') {
  if (unit === 'ha') return `${(km2 * 100).toFixed(1)} ha`
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 86400) return 'Oggi'
  if (diff < 172800) return 'Ieri'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })
}

const riskCfg: Record<RiskLevel, { bg: string; text: string }> = {
  basso:   { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  medio:   { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  alto:    { bg: 'bg-orange-100',  text: 'text-orange-700'  },
  critico: { bg: 'bg-red-100',     text: 'text-red-700'     },
}

type SidebarTab = 'analyses' | 'compare'

export function SavedSidebar({ open, onClose, analyses, onFocus, onOpen, onDelete, unit }: SavedSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('analyses')
  const [selectedForComparison, setSelectedForComparison] = useState<Set<string>>(new Set())

  const toggleCompare = (id: string) => {
    setSelectedForComparison(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 4) next.add(id)
      return next
    })
  }

  const comparisonAnalyses = analyses.filter(a => selectedForComparison.has(a.id))

  return (
    <>
      {/* Overlay */}
      {open && <div className="absolute inset-0 bg-slate-900/20 z-29" onClick={onClose} />}

      <div className={`absolute left-0 top-0 bottom-0 w-[320px] bg-white shadow-2xl z-30 flex flex-col transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-emerald-500" />
            <span className="font-bold text-slate-900 text-base">Analisi</span>
            {analyses.length > 0 && (
              <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{analyses.length}</span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 flex-shrink-0">
          <button
            onClick={() => setActiveTab('analyses')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-all border-b-2 flex items-center justify-center gap-1.5 ${activeTab === 'analyses' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Satellite className="w-3.5 h-3.5" /> Tutte le analisi
          </button>
          <button
            onClick={() => setActiveTab('compare')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-all border-b-2 flex items-center justify-center gap-1.5 ${activeTab === 'compare' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <BarChart2 className="w-3.5 h-3.5" /> Confronto
            {selectedForComparison.size > 0 && (
              <span className="w-4 h-4 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {selectedForComparison.size}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── TAB: ANALISI ────────────────────────────────────────── */}
          {activeTab === 'analyses' && (
            <div className="p-3">
              {selectedForComparison.size > 0 && (
                <div className="mb-3 px-2 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-emerald-700 font-medium">{selectedForComparison.size} selezionate per confronto</span>
                  <button onClick={() => setActiveTab('compare')}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                    Vai <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {analyses.length === 0 ? (
                <div className="py-12 text-center">
                  <Satellite className="w-10 h-10 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm text-slate-400">Nessuna analisi eseguita</p>
                  <p className="text-xs text-slate-300 mt-1">Seleziona un'area e avvia l'analisi rischio</p>
                </div>
              ) : (
                analyses.map(a => {
                  const cfg = riskCfg[a.compositeLevel] || riskCfg.basso
                  const isSelected = selectedForComparison.has(a.id)
                  return (
                    <div key={a.id}
                      className={`group relative border rounded-xl p-3 mb-2 transition-all ${isSelected ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'}`}
                    >
                      {/* Delete button */}
                      <button onClick={e => { e.stopPropagation(); onDelete(a.id) }}
                        className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 bg-red-100 hover:bg-red-200 flex items-center justify-center text-red-500 transition-all z-10">
                        <Trash2 className="w-3 h-3" />
                      </button>

                      <div className="font-semibold text-sm text-slate-900 pr-7 mb-1.5 truncate">{a.title}</div>

                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                          {a.compositeLevel?.toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">{a.compositeScore}/100</span>
                        {a.area && <span className="text-xs text-slate-400">{formatArea(a.area, unit)}</span>}
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                        {a.address && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">{a.address.split(',')[0]}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {timeAgo(a.createdAt)}
                        </div>
                      </div>

                      <div className="flex gap-1.5">
                        <button onClick={() => onFocus(a)}
                          className="flex-1 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-lg transition-colors">
                          Mappa
                        </button>
                        <button
                          onClick={() => toggleCompare(a.id)}
                          className={`h-7 px-2.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                          title={selectedForComparison.size >= 4 && !isSelected ? 'Massimo 4 analisi' : ''}
                          disabled={selectedForComparison.size >= 4 && !isSelected}
                        >
                          <BarChart2 className="w-3 h-3" />
                          {isSelected ? '✓' : '+'}
                        </button>
                        <button onClick={() => onOpen(a)}
                          className="flex-1 h-7 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1">
                          Apri <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── TAB: CONFRONTO ──────────────────────────────────────── */}
          {activeTab === 'compare' && (
            <ComparisonPanel
              selected={comparisonAnalyses}
              onRemove={id => setSelectedForComparison(prev => { const n = new Set(prev); n.delete(id); return n })}
              onClear={() => setSelectedForComparison(new Set())}
            />
          )}

        </div>
      </div>
    </>
  )
}
