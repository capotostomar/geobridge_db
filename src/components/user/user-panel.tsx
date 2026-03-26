'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Bell, History, Settings, LogOut, MapPin, PenLine, Save, CheckCircle, X } from 'lucide-react'

// ─── Tipi ─────────────────────────────────────────────────────────────────
export interface HistoryEntry {
  id: string
  type: 'search' | 'area' | 'save'
  title: string
  time: string
  isNew?: boolean
}

export interface UserSettings {
  unit: 'km2' | 'ha'
  defaultMap: 'street' | 'satellite' | 'topo'
  notifSatellite: boolean
  notifMeteo: boolean
  emailReport: boolean
}

export const DEFAULT_SETTINGS: UserSettings = {
  unit: 'km2',
  defaultMap: 'street',
  notifSatellite: true,
  notifMeteo: true,
  emailReport: false,
}

// ─── Storage helpers ────────────────────────────────────────────────────────
const HIST_KEY = 'gb_history'
const SETT_KEY = 'gb_settings'

export function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]') } catch { return [] }
}

export function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 50)))
}

export function addHistoryEntry(type: HistoryEntry['type'], title: string) {
  const h = loadHistory()
  h.unshift({ id: Date.now().toString(), type, title, time: new Date().toISOString(), isNew: true })
  saveHistory(h)
}

export function loadSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETT_KEY) || '{}') } } catch { return DEFAULT_SETTINGS }
}

export function saveSettings(s: UserSettings) {
  localStorage.setItem(SETT_KEY, JSON.stringify(s))
}

// ─── Utility ───────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Adesso'
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ore fa`
  if (diff < 172800) return 'Ieri'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function initials(email: string) {
  const parts = email.split('@')[0].split(/[\._-]/)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : email.slice(0, 2).toUpperCase()
}

// ─── Toggle switch ─────────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${value ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}

// ─── Notifiche mock ────────────────────────────────────────────────────────
const MOCK_NOTIFS = [
  { id: '1', unread: true, text: 'Nuovo aggiornamento satellite disponibile per la zona Roma Nord.', time: '2 ore fa' },
  { id: '2', unread: true, text: 'Analisi completata per "Zona industriale Milano" — rischio vegetazione: medio.', time: 'Ieri, 14:22' },
  { id: '3', unread: true, text: 'Alert meteo: precipitazioni anomale rilevate nell\'area salvata "Toscana Costa".', time: '2 giorni fa' },
  { id: '4', unread: false, text: 'Benvenuto in GeoBridge! Inizia tracciando un\'area sulla mappa.', time: '3 giorni fa' },
]

// ─── Pannello principale ───────────────────────────────────────────────────
interface UserPanelProps {
  open: boolean
  onClose: () => void
  savedCount: number
  onSettingsChange?: (s: UserSettings) => void
}

export function UserPanel({ open, onClose, savedCount, onSettingsChange }: UserPanelProps) {
  const { user, signOut } = useAuth()
  const [tab, setTab] = useState<'history' | 'notifications' | 'settings'>('history')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [notifs, setNotifs] = useState(MOCK_NOTIFS)
  const [notifsRead, setNotifsRead] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setHistory(loadHistory())
      setSettings(loadSettings())
    }
  }, [open])

  // Segna notifiche come lette dopo 2s
  useEffect(() => {
    if (open && tab === 'notifications' && !notifsRead) {
      const t = setTimeout(() => setNotifsRead(true), 2000)
      return () => clearTimeout(t)
    }
  }, [open, tab, notifsRead])

  // Chiudi cliccando fuori
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  // ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const updateSettings = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
    onSettingsChange?.(next)
  }

  const email = (user as { email?: string })?.email || 'utente@geobridge.it'
  const ini = initials(email)
  const unreadCount = notifsRead ? 0 : notifs.filter(n => n.unread).length
  const searchCount = history.filter(h => h.type === 'search').length

  const histIcon = { search: MapPin, area: PenLine, save: Save }
  const histColor = { search: 'text-blue-500 bg-blue-50', area: 'text-emerald-600 bg-emerald-50', save: 'text-amber-500 bg-amber-50' }

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="absolute right-4 top-[72px] w-[340px] bg-white rounded-2xl shadow-2xl z-30 overflow-hidden"
      style={{ animation: 'panelIn 0.2s cubic-bezier(0.4,0,0.2,1)' }}
    >
      <style>{`@keyframes panelIn{from{opacity:0;transform:scale(.96) translateY(-8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>

      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-5 relative">
        <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all">
          <X className="w-4 h-4" />
        </button>
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-400 flex items-center justify-center text-white font-bold text-lg mb-3">{ini}</div>
        <div className="text-white font-semibold text-base">{email.split('@')[0]}</div>
        <div className="text-white/50 text-xs mt-0.5">{email}</div>
        <div className="flex gap-6 mt-4">
          {[['Ricerche', searchCount], ['Zone salvate', savedCount], ['Giorni', 1]].map(([lbl, val]) => (
            <div key={lbl as string}>
              <div className="text-white font-bold text-lg leading-none">{val}</div>
              <div className="text-white/40 text-[10px] uppercase tracking-wider mt-0.5">{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        {([
          ['history', 'Cronologia'],
          ['notifications', 'Notifiche'],
          ['settings', 'Impostazioni'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2.5 text-xs font-medium transition-all relative ${tab === key ? 'text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {label}
            {key === 'notifications' && unreadCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="max-h-80 overflow-y-auto">

        {/* CRONOLOGIA */}
        {tab === 'history' && (
          <div>
            {history.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nessuna attività recente
              </div>
            ) : history.slice(0, 20).map(h => {
              const Icon = histIcon[h.type] || MapPin
              return (
                <div key={h.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${histColor[h.type]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{h.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{timeAgo(h.time)}</div>
                  </div>
                  {h.isNew && <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0">nuovo</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* NOTIFICHE */}
        {tab === 'notifications' && (
          <div>
            {notifs.map(n => (
              <div key={n.id} className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 ${n.unread && !notifsRead ? 'bg-emerald-50' : ''}`}>
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.unread && !notifsRead ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <div className="flex-1">
                  <div className="text-sm text-slate-800 leading-snug">{n.text}</div>
                  <div className="text-xs text-slate-400 mt-1">{n.time}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* IMPOSTAZIONI */}
        {tab === 'settings' && (
          <div>
            {[
              { label: 'Notifiche satellite', desc: 'Alert su nuove immagini disponibili', key: 'notifSatellite' as const },
              { label: 'Notifiche meteo', desc: 'Alert su eventi meteo anomali nelle tue zone', key: 'notifMeteo' as const },
              { label: 'Report settimanale via email', desc: 'Riepilogo attività ogni lunedì', key: 'emailReport' as const },
            ].map(({ label, desc, key }) => (
              <div key={key} className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
                <div>
                  <div className="text-sm font-medium text-slate-800">{label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                </div>
                <Toggle value={settings[key]} onChange={v => updateSettings({ [key]: v })} />
              </div>
            ))}

            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
              <div>
                <div className="text-sm font-medium text-slate-800">Unità di misura</div>
                <div className="text-xs text-slate-400 mt-0.5">Superficie aree selezionate</div>
              </div>
              <select
                value={settings.unit}
                onChange={e => updateSettings({ unit: e.target.value as 'km2' | 'ha' })}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white outline-none focus:border-emerald-400"
              >
                <option value="km2">km²</option>
                <option value="ha">ettari</option>
              </select>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Mappa predefinita</div>
                <div className="text-xs text-slate-400 mt-0.5">Layer al primo caricamento</div>
              </div>
              <select
                value={settings.defaultMap}
                onChange={e => updateSettings({ defaultMap: e.target.value as UserSettings['defaultMap'] })}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white outline-none focus:border-emerald-400"
              >
                <option value="street">Stradale</option>
                <option value="satellite">Satellite</option>
                <option value="topo">Topografico</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-100">
        <button
          onClick={signOut}
          className="w-full h-9 flex items-center justify-center gap-2 text-sm font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Esci dall'account
        </button>
      </div>
    </div>
  )
}

// ─── Bottone avatar utente ─────────────────────────────────────────────────
interface UserButtonProps {
  onClick: () => void
  unreadNotifs: number
}

export function UserButton({ onClick, unreadNotifs }: UserButtonProps) {
  const { user } = useAuth()
  const email = (user as { email?: string })?.email || ''
  const ini = initials(email || 'GB')

  return (
    <button
      onClick={onClick}
      className="relative w-12 h-12 rounded-full bg-white shadow-md hover:shadow-lg transition-all flex items-center justify-center"
    >
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-400 flex items-center justify-center text-white text-sm font-bold">
        {ini}
      </div>
      {unreadNotifs > 0 && (
        <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />
      )}
    </button>
  )
}
