'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { History, Bell, Settings, LogOut, FolderKanban, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { SavedSidebar } from '@/components/user/saved-sidebar'
import { loadHistory, loadSettings, saveSettings, UserSettings } from '@/components/user/user-panel'

export function Sidebar({ open, onClose, analyses, unit, onFocus, onOpen, onDelete, onSettingsChange }: any) {
  const { signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('history')
  const [history] = useState(() => loadHistory())
  const [settings, setSettings] = useState(() => loadSettings())
  const [collapsed, setCollapsed] = useState(false)

  if (!open) return null

  const tabs = [
    { id: 'history', label: 'Cronologia', icon: History },
    { id: 'analyses', label: 'Analisi', icon: FolderKanban },
    { id: 'notifications', label: 'Notifiche', icon: Bell },
    { id: 'settings', label: 'Impostazioni', icon: Settings },
  ]

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[9998]" onClick={onClose} />
      <div className={`fixed left-0 top-0 h-full bg-white z-[9999] transition-all ${collapsed ? 'w-16' : 'w-80'}`}>
        <div className="p-4 border-b flex items-center justify-between">
          {!collapsed && <span className="font-bold">GeoBridge</span>}
          <button onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {!collapsed && (
          <>
            <nav className="flex border-b">
              {tabs.map((tab: any) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-3 text-xs ${activeTab === tab.id ? 'text-emerald-600 border-b-2 border-emerald-500' : ''}`}
                >
                  <tab.icon size={14} className="inline mr-1" />
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="p-4 overflow-y-auto h-[calc(100vh-120px)]">
              {activeTab === 'history' && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Attività Recente</h3>
                  {history.slice(0, 20).map((h: any) => (
                    <div key={h.id} className="p-2 hover:bg-slate-50 rounded">
                      <p className="text-sm">{h.title}</p>
                      <p className="text-xs text-slate-400">{new Date(h.time).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'analyses' && (
                <SavedSidebar open analyses={analyses} onFocus={onFocus} onOpen={onOpen} onDelete={onDelete} unit={unit} onClose={() => {}} />
              )}

              {activeTab === 'settings' && (
                <div className="space-y-4">
                  <select 
                    value={settings.unit}
                    onChange={(e) => {
                      const next = { ...settings, unit: e.target.value }
                      setSettings(next)
                      saveSettings(next)
                      onSettingsChange?.(next)
                    }}
                    className="w-full border rounded p-2"
                  >
                    <option value="km2">km²</option>
                    <option value="ha">Ettari</option>
                  </select>
                  <button onClick={async () => { await signOut(); onClose() }} className="w-full text-red-600">
                    <LogOut size={16} className="inline mr-2" /> Esci
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
