'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { 
  History, Bell, Settings, LogOut, 
  FolderKanban, X, ChevronLeft, ChevronRight, Menu
} from 'lucide-react'
import { SavedSidebar } from '@/components/user/saved-sidebar'
import { 
  loadHistory, loadSettings, saveSettings, 
  UserSettings, HistoryEntry 
} from '@/components/user/user-panel'

interface SidebarProps {
  open: boolean
  onClose: () => void
  analyses: any[]
  unit: 'km2' | 'ha'
  onFocus: (a: any) => void
  onOpen: (a: any) => void
  onDelete: (id: string) => void
  onSettingsChange?: (s: UserSettings) => void
}

type Tab = 'history' | 'analyses' | 'notifications' | 'settings'

export function Sidebar({ 
  open, onClose, analyses, unit, onFocus, onOpen, onDelete, onSettingsChange 
}: SidebarProps) {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('history')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<UserSettings>(loadSettings())
  const [collapsed, setCollapsed] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Carica history quando il panel si apre
  useEffect(() => {
    if (open) {
      setHistory(loadHistory())
      setSettings(loadSettings())
    }
  }, [open])

  // Chiudi cliccando fuori
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  // ESC per chiudere
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const tabs = [
    { id: 'history' as const, label: 'Cronologia', icon: History },
    { id: 'analyses' as const, label: 'Analisi', icon: FolderKanban },
    { id: 'notifications' as const, label: 'Notifiche', icon: Bell },
    { id: 'settings' as const, label: 'Impostazioni', icon: Settings },
  ] as const

  const handleLogout = async () => {
    await signOut()
    onClose()
  }

  const updateSettings = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
    onSettingsChange?.(next)
  }

  function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000
    if (diff < 60) return 'Adesso'
    if (diff < 3600) return `${Math.floor(diff / 60)} min fa`
    if (diff < 86400) return `${Math.floor(diff / 3600)} ore fa`
    if (diff < 172800) return 'Ieri'
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  }

  if (!open) return null

  return (
    <div 
      ref={panelRef}
      className={`fixed left-0 top-0 h-full bg-white border-r border-slate-200 shadow-lg z-50 transition-all duration-300 flex ${collapsed ? 'w-16' : 'w-80'}`}
    >
      
      {/* Header con toggle collapse */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        {!collapsed && <span className="font-bold text-slate-800">GeoBridge</span>}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          title={collapsed ? 'Espandi' : 'Comprimi'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        <button 
          onClick={onClose} 
          className="p-1.5 hover:bg-slate-100 rounded-lg ml-auto"
          title="Chiudi"
        >
          <X size={18} />
        </button>
      </div>

      {!collapsed ? (
        <>
          {/* Tabs di navigazione */}
          <nav className="flex border-b border-slate-200">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === tab.id 
                    ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/50' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Contenuto tab */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* CRONOLOGIA */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">Attività Recente</h3>
                {history.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Nessuna attività</p>
                ) : (
                  history.slice(0, 20).map(h => {
                    const Icon = h.type === 'search' ? Menu : h.type === 'area' ? FolderKanban : Bell
                    return (
                      <div key={h.id} className="flex items-start gap-3 p-2.5 hover:bg-slate-50 rounded-lg transition-colors">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 truncate">{h.title}</p>
                          <p className="text-xs text-slate-400">{timeAgo(h.time)}</p>
                        </div>
                        {h.isNew && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">nuovo</span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* ANALISI */}
            {activeTab === 'analyses' && (
              <SavedSidebar 
                open={true} 
                onClose={() => {}} 
                analyses={analyses} 
                onFocus={onFocus} 
                onOpen={onOpen} 
                onDelete={onDelete} 
                unit={unit} 
              />
            )}

            {/* NOTIFICHE */}
            {activeTab === 'notifications' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700">Notifiche</h3>
                <div className="space-y-2">
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <p className="text-sm text-slate-700">🛰️ Nuove immagini Sentinel-2 disponibili per Roma Nord</p>
                    <p className="text-xs text-slate-400 mt-1">2 ore fa</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-sm text-slate-700">⚠️ Alert meteo: precipitazioni anomale in Toscana</p>
                    <p className="text-xs text-slate-400 mt-1">Ieri</p>
                  </div>
                </div>
              </div>
            )}

            {/* IMPOSTAZIONI */}
            {activeTab === 'settings' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-700">Preferenze</h3>
                
                <div className="space-y-3">
                  <label className="text-xs text-slate-600">Unità di misura</label>
                  <select 
                    value={settings.unit}
                    onChange={(e) => updateSettings({ unit: e.target.value as 'km2'|'ha' })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="km2">km²</option>
                    <option value="ha">Ettari</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <label className="text-xs text-slate-600">Mappa predefinita</label>
                  <select 
                    value={settings.defaultMap}
                    onChange={(e) => updateSettings({ defaultMap: e.target.value as UserSettings['defaultMap'] })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="street">Stradale</option>
                    <option value="satellite">Satellite</option>
                    <option value="topo">Topografica</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input 
                      type="checkbox" 
                      checked={settings.notifSatellite}
                      onChange={(e) => updateSettings({ notifSatellite: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                    />
                    Notifiche satellite
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input 
                      type="checkbox" 
                      checked={settings.notifMeteo}
                      onChange={(e) => updateSettings({ notifMeteo: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                    />
                    Notifiche meteo
                  </label>
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 text-sm text-red-600 hover:bg-red-50 px-3 py-2.5 rounded-lg transition-colors"
                  >
                    <LogOut size={16} />
                    Esci dall'account
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Sidebar collassata: solo icone */
        <div className="flex flex-col items-center py-4 gap-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setCollapsed(false) }}
              className={`p-2.5 rounded-lg transition-colors ${
                activeTab === tab.id ? 'bg-emerald-100 text-emerald-600' : 'text-slate-500 hover:bg-slate-100'
              }`}
              title={tab.label}
            >
              <tab.icon size={20} />
            </button>
          ))}
          <div className="flex-1" />
          <button 
            onClick={handleLogout}
            className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Esci"
          >
            <LogOut size={20} />
          </button>
        </div>
      )}
    </div>
  )
}
