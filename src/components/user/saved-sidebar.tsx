'use client'

import { MapPin, PenSquare, Clock, Trash2, X, Layers } from 'lucide-react'
import { Search as SearchType } from '@/lib/types'

interface SavedSidebarProps {
  open: boolean
  onClose: () => void
  searches: SearchType[]
  onFocus: (s: SearchType) => void
  onDelete: (id: string) => void
  unit: 'km2' | 'ha'
}

function formatArea(km2: number | undefined, unit: 'km2' | 'ha') {
  if (!km2) return null
  if (unit === 'ha') return `${(km2 * 100).toFixed(1)} ha`
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 86400) return 'Oggi'
  if (diff < 172800) return 'Ieri'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function SavedSidebar({ open, onClose, searches, onFocus, onDelete, unit }: SavedSidebarProps) {
  return (
    <div
      className={`absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-30 flex flex-col transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-emerald-500" />
          <span className="font-semibold text-slate-900 text-base">Ricerche salvate</span>
          {searches.length > 0 && (
            <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{searches.length}</span>
          )}
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3">
        {searches.length === 0 ? (
          <div className="py-12 text-center">
            <MapPin className="w-10 h-10 mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Nessuna ricerca salvata</p>
            <p className="text-xs text-slate-300 mt-1">Seleziona un'area sulla mappa e salvala</p>
          </div>
        ) : (
          searches.map(s => {
            let area: number | undefined
            if (s.area_geojson) {
              try { area = JSON.parse(s.area_geojson).area } catch {}
            }
            return (
              <div
                key={s.id}
                onClick={() => onFocus(s)}
                className="group relative border border-slate-200 rounded-xl p-3 mb-2 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-all"
              >
                <button
                  onClick={e => { e.stopPropagation(); onDelete(s.id) }}
                  className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 bg-red-100 hover:bg-red-200 flex items-center justify-center text-red-500 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>

                <div className="font-semibold text-sm text-slate-900 pr-7 mb-1.5">{s.title}</div>

                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {s.address && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate max-w-[140px]">{s.address.split(',')[0]}</span>
                    </div>
                  )}
                  {area != null && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <PenSquare className="w-3 h-3 flex-shrink-0" />
                      {formatArea(area, unit)}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {timeAgo(s.created_at)}
                  </div>
                </div>

                {s.description && (
                  <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">{s.description}</p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
