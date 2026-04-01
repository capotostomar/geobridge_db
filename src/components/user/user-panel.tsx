'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  Bell, History, Settings, LogOut, MapPin, PenLine, Save, X,
  ChevronDown, ChevronUp, AlertTriangle, Shield, Flame, Droplets,
  Trees, Building2, Sliders, BookOpen, Satellite
} from 'lucide-react'

// ─── Tipi ─────────────────────────────────────────────────────────────────
export interface HistoryEntry {
  id: string
  type: 'search' | 'area' | 'save' | 'analysis'
  title: string
  time: string
  isNew?: boolean
}

export interface AlertThresholds {
  enabled: boolean
  email: string
  flood: number
  fire: number
  drought: number
  urbanHeat: number
  composite: number
}

export interface PolicyWeights {
  profile: 'agricultural' | 'property' | 'crop' | 'custom'
  flood: number
  fire: number
  drought: number
  urbanHeat: number
}

export interface UserSettings {
  unit: 'km2' | 'ha'
  defaultMap: 'street' | 'satellite' | 'topo'
  notifSatellite: boolean
  notifMeteo: boolean
  emailReport: boolean
  alertThresholds: AlertThresholds
  policyWeights: PolicyWeights
}

export const POLICY_PRESETS: Record<string, Omit<PolicyWeights, 'profile'>> = {
  agricultural: { drought: 40, flood: 30, fire: 20, urbanHeat: 10 },
  property:     { flood: 40, fire: 30, urbanHeat: 20, drought: 10 },
  crop:         { drought: 50, flood: 25, fire: 25, urbanHeat: 0 },
  custom:       { flood: 25, fire: 25, drought: 25, urbanHeat: 25 },
}

export const DEFAULT_SETTINGS: UserSettings = {
  unit: 'km2',
  defaultMap: 'street',
  notifSatellite: true,
  notifMeteo: true,
  emailReport: false,
  alertThresholds: { enabled: false, email: '', flood: 60, fire: 70, drought: 65, urbanHeat: 55, composite: 70 },
  policyWeights: { profile: 'agricultural', ...POLICY_PRESETS.agricultural },
}

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
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : email.slice(0, 2).toUpperCase()
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${value ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}

/* ─── Section accordion ────────────────────────────────────────────────────
 * Ogni sezione del pannello è un accordion indipendente:
 * - titolo sempre visibile con freccia
 * - contenuto che si espande/comprime con animazione
 * - tutte aperte di default al primo render
 */
function Section({
  title, icon: Icon, badge, defaultOpen = true, accent, children
}: {
  title: string
  icon: React.ElementType
  badge?: React.ReactNode
  defaultOpen?: boolean
  accent?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors ${accent ?? ''}`}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${accent ? 'bg-white/20' : 'bg-slate-100'}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="flex-1 text-sm font-semibold text-slate-800">{title}</span>
        {badge}
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        }
      </button>
      {open && (
        <div className="pb-1">
          {children}
        </div>
      )}
    </div>
  )
}

const MOCK_NOTIFS = [
  { id: '1', unread: true, text: 'Nuovo aggiornamento satellite disponibile per la zona Roma Nord.', time: '2 ore fa' },
  { id: '2', unread: true, text: 'Analisi completata per "Zona industriale Milano" — rischio vegetazione: medio.', time: 'Ieri, 14:22' },
  { id: '3', unread: true, text: 'Alert meteo: precipitazioni anomale rilevate nell\'area "Toscana Costa".', time: '2 giorni fa' },
  { id: '4', unread: false, text: 'Benvenuto in GeoBridge! Inizia tracciando un\'area sulla mappa.', time: '3 giorni fa' },
]

interface UserPanelProps {
  open: boolean
  onClose: () => void
  savedCount: number
  onSettingsChange?: (s: UserSettings) => void
  onOpenSaved?: () => void
}

export function UserPanel({ open, onClose, savedCount, onSettingsChange, onOpenSaved }: UserPanelProps) {
  const { user, signOut } = useAuth()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [notifs, setNotifs] = useState(MOCK_NOTIFS)
  const [notifsRead, setNotifsRead] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) { setHistory(loadHistory()); setSettings(loadSettings()) }
  }, [open])

  useEffect(() => {
    if (open && !notifsRead) {
      const t = setTimeout(() => setNotifsRead(true), 3000)
      return () => clearTimeout(t)
    }
  }, [open, notifsRead])

  /* Chiudi cliccando fuori */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  /* Chiudi con ESC */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const updateSettings = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next); saveSettings(next); onSettingsChange?.(next)
  }
  const updateAlerts = (patch: Partial<AlertThresholds>) => updateSettings({ alertThresholds: { ...settings.alertThresholds, ...patch } })
  const updatePolicy = (patch: Partial<PolicyWeights>) => updateSettings({ policyWeights: { ...settings.policyWeights, ...patch } })
  const setPreset = (profile: PolicyWeights['profile']) => updateSettings({ policyWeights: { profile, ...POLICY_PRESETS[profile] } })

  const email = (user as { email?: string })?.email || 'utente@geobridge.it'
  const ini = initials(email)
  const unreadCount = notifsRead ? 0 : notifs.filter(n => n.unread).length
  const searchCount = history.filter(h => h.type === 'search').length

  const histIcon: Record<string, React.ElementType> = { search: MapPin, area: PenLine, save: Save, analysis: Satellite }
  const histColor: Record<string, string> = {
    search: 'text-blue-500 bg-blue-50', area: 'text-emerald-600 bg-emerald-50',
    save: 'text-amber-500 bg-amber-50', analysis: 'text-violet-500 bg-violet-50',
  }
  const profileLabels: Record<string, string> = { agricultural: 'Agricola', property: 'Immobiliare', crop: 'Colture', custom: 'Personalizzato' }

  if (!open) return null

  return (
    <>
      {/* Overlay scuro dietro il pannello */}
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px] z-30"
        onClick={onClose}
      />

      {/* Drawer — scorre da sinistra, larghezza fissa, altezza viewport, scroll interno */}
      <div
        ref={panelRef}
        className="fixed left-0 top-0 bottom-0 w-[340px] max-w-[92vw] bg-white shadow-2xl z-40 flex flex-col"
        style={{ animation: 'drawerIn 0.22s cubic-bezier(0.4,0,0.2,1)' }}
      >
        <style>{`
          @keyframes drawerIn {
            from { opacity: 0; transform: translateX(-24px); }
            to   { opacity: 1; transform: translateX(0); }
          }
        `}</style>

        {/* ── HEADER PROFILO ────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-5 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-400 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                {ini}
              </div>
              <div>
                <div className="text-white font-semibold text-sm leading-tight">{email.split('@')[0]}</div>
                <div className="text-white/50 text-xs mt-0.5">{email}</div>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stats rapide */}
          <div className="flex gap-5 mt-4 pt-4 border-t border-white/10">
            {[['Ricerche', searchCount], ['Analisi', savedCount], ['Giorni attivo', 1]].map(([lbl, val]) => (
              <div key={lbl as string}>
                <div className="text-white font-bold text-base leading-none">{val}</div>
                <div className="text-white/40 text-[10px] uppercase tracking-wide mt-0.5">{lbl}</div>
              </div>
            ))}
          </div>

          {/* Link analisi salvate */}
          {onOpenSaved && (
            <button onClick={onOpenSaved}
              className="mt-3 w-full flex items-center justify-between px-3 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-white/80 text-xs transition-colors">
              <span className="flex items-center gap-2"><BookOpen className="w-3.5 h-3.5" /> Vedi tutte le analisi</span>
              <span className="text-white/40">→</span>
            </button>
          )}
        </div>

        {/* ── CORPO SCROLLABILE — tutte le sezioni impilate ─────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* CRONOLOGIA */}
          <Section title="Cronologia" icon={History} defaultOpen={true}>
            {history.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs px-5">
                <History className="w-7 h-7 mx-auto mb-2 opacity-20" />
                Nessuna attività recente
              </div>
            ) : history.slice(0, 15).map(h => {
              const Icon = histIcon[h.type] || MapPin
              return (
                <div key={h.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 transition-colors">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${histColor[h.type]}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-800 truncate">{h.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{timeAgo(h.time)}</div>
                  </div>
                  {h.isNew && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0">nuovo</span>}
                </div>
              )
            })}
          </Section>

          {/* NOTIFICHE */}
          <Section
            title="Notifiche"
            icon={Bell}
            defaultOpen={true}
            badge={unreadCount > 0
              ? <span className="w-5 h-5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center flex-shrink-0">{unreadCount}</span>
              : undefined
            }
          >
            {notifs.map(n => (
              <div key={n.id} className={`flex items-start gap-3 px-5 py-3 border-b border-slate-50 last:border-0 ${n.unread && !notifsRead ? 'bg-emerald-50/60' : ''}`}>
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.unread && !notifsRead ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <div className="flex-1">
                  <div className="text-xs text-slate-700 leading-snug">{n.text}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{n.time}</div>
                </div>
              </div>
            ))}
          </Section>

          {/* ALERT SOGLIE */}
          <Section title="Alert Soglie" icon={AlertTriangle} defaultOpen={false}
            badge={settings.alertThresholds.enabled
              ? <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />
              : undefined}
          >
            <div className="px-5 py-3 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Attiva alert email</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Notifiche al superamento delle soglie</div>
                </div>
                <Toggle value={settings.alertThresholds.enabled} onChange={v => updateAlerts({ enabled: v })} />
              </div>

              {settings.alertThresholds.enabled && (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-slate-500 block mb-1">Email destinatario</label>
                    <input type="email" value={settings.alertThresholds.email}
                      onChange={e => updateAlerts({ email: e.target.value })}
                      placeholder="nome@azienda.it"
                      className="w-full h-8 border border-slate-200 rounded-lg px-2.5 text-xs outline-none focus:border-emerald-400 transition-all" />
                  </div>

                  <div className="space-y-3">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Soglie di allerta (0–100)</div>
                    {[
                      { key: 'flood' as const, label: 'Alluvione', icon: Droplets, color: 'text-blue-500' },
                      { key: 'fire' as const, label: 'Incendio', icon: Flame, color: 'text-orange-500' },
                      { key: 'drought' as const, label: 'Siccità', icon: Trees, color: 'text-amber-500' },
                      { key: 'urbanHeat' as const, label: 'Calore urbano', icon: Building2, color: 'text-red-400' },
                      { key: 'composite' as const, label: 'Rischio composito', icon: Shield, color: 'text-violet-500' },
                    ].map(({ key, label, icon: Icon, color }) => (
                      <div key={key} className="flex items-center gap-2.5">
                        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-slate-700">{label}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              settings.alertThresholds[key] >= 75 ? 'bg-red-100 text-red-600' :
                              settings.alertThresholds[key] >= 55 ? 'bg-amber-100 text-amber-600' :
                              'bg-emerald-100 text-emerald-600'}`}>≥ {settings.alertThresholds[key]}</span>
                          </div>
                          <input type="range" min={10} max={100} step={5}
                            value={settings.alertThresholds[key]}
                            onChange={e => updateAlerts({ [key]: Number(e.target.value) })}
                            className="w-full accent-emerald-500 h-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Section>

          {/* RISCHIO × POLIZZA */}
          <Section title="Rischio × Polizza" icon={Sliders} defaultOpen={false}>
            <div className="px-5 py-3 space-y-4">
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Configura i pesi del rischio composito in base al tipo di polizza.
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { key: 'agricultural' as const, label: 'Agricola', emoji: '🌾' },
                  { key: 'property' as const, label: 'Immobiliare', emoji: '🏠' },
                  { key: 'crop' as const, label: 'Colture', emoji: '🌱' },
                  { key: 'custom' as const, label: 'Custom', emoji: '⚙️' },
                ].map(({ key, label, emoji }) => (
                  <button key={key} onClick={() => setPreset(key)}
                    className={`flex items-center gap-1.5 p-2 rounded-xl border-2 text-xs font-medium transition-all ${
                      settings.policyWeights.profile === key
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    <span>{emoji}</span>{label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {[
                  { key: 'flood' as const, label: 'Alluvione', icon: Droplets, color: 'text-blue-500' },
                  { key: 'fire' as const, label: 'Incendio', icon: Flame, color: 'text-orange-500' },
                  { key: 'drought' as const, label: 'Siccità', icon: Trees, color: 'text-amber-500' },
                  { key: 'urbanHeat' as const, label: 'Calore urbano', icon: Building2, color: 'text-red-400' },
                ].map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className="flex items-center gap-2.5">
                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-slate-700">{label}</span>
                        <span className="text-[10px] font-bold text-slate-700">{settings.policyWeights[key]}%</span>
                      </div>
                      <input type="range" min={0} max={100} step={5}
                        value={settings.policyWeights[key]}
                        onChange={e => updatePolicy({ [key]: Number(e.target.value), profile: 'custom' })}
                        className="w-full accent-emerald-500 h-1" />
                    </div>
                  </div>
                ))}

                {/* Totale */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-medium text-slate-600">Totale pesi</span>
                  <span className={`text-xs font-bold ${
                    (settings.policyWeights.flood + settings.policyWeights.fire + settings.policyWeights.drought + settings.policyWeights.urbanHeat) === 100
                      ? 'text-emerald-600' : 'text-red-500'}`}>
                    {settings.policyWeights.flood + settings.policyWeights.fire + settings.policyWeights.drought + settings.policyWeights.urbanHeat}%
                  </span>
                </div>
              </div>
            </div>
          </Section>

          {/* IMPOSTAZIONI */}
          <Section title="Impostazioni" icon={Settings} defaultOpen={false}>
            <div>
              {[
                { label: 'Notifiche satellite', desc: 'Alert su nuove immagini disponibili', key: 'notifSatellite' as const },
                { label: 'Notifiche meteo', desc: 'Alert su eventi anomali nelle tue zone', key: 'notifMeteo' as const },
                { label: 'Report settimanale via email', desc: 'Riepilogo ogni lunedì', key: 'emailReport' as const },
              ].map(({ label, desc, key }) => (
                <div key={key} className="flex items-center justify-between px-5 py-3 border-b border-slate-50">
                  <div>
                    <div className="text-xs font-medium text-slate-800">{label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{desc}</div>
                  </div>
                  <Toggle value={settings[key]} onChange={v => updateSettings({ [key]: v })} />
                </div>
              ))}

              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-50">
                <div>
                  <div className="text-xs font-medium text-slate-800">Unità di misura</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Superficie aree</div>
                </div>
                <select value={settings.unit} onChange={e => updateSettings({ unit: e.target.value as 'km2' | 'ha' })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white outline-none focus:border-emerald-400">
                  <option value="km2">km²</option>
                  <option value="ha">ettari</option>
                </select>
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-xs font-medium text-slate-800">Mappa predefinita</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Layer al caricamento</div>
                </div>
                <select value={settings.defaultMap} onChange={e => updateSettings({ defaultMap: e.target.value as UserSettings['defaultMap'] })}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white outline-none focus:border-emerald-400">
                  <option value="street">Stradale</option>
                  <option value="satellite">Satellite</option>
                  <option value="topo">Topologia</option>
                </select>
              </div>
            </div>
          </Section>

        </div>

        {/* ── FOOTER — sempre visibile ─────────────────────────────────── */}
        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={signOut}
            className="w-full h-9 flex items-center justify-center gap-2 text-sm font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
            <LogOut className="w-4 h-4" /> Esci dall'account
          </button>
        </div>
      </div>
    </>
  )
}
