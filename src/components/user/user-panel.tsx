'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Bell, History, Settings, LogOut, MapPin, PenLine, Save, CheckCircle, X } from 'lucide-react'

// ─── Tipi ─────────────────────────────────────────────────────────────────
export interface HistoryEntry {
  id: string
  type: 'search' | 'area' | 'save' | 'analysis'
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

// ─── Toggle switch ─────────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 ${value ? 'left-5' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-sm`} />
    </button>
  )
}

// ─── Pannello principale (SEMPLIFICATO - solo funzioni esportate) ───────────
export { loadHistory, saveHistory, addHistoryEntry, loadSettings, saveSettings, timeAgo }
export type { HistoryEntry, UserSettings }
export { DEFAULT_SETTINGS }

// Componente legacy mantenuto per compatibilità (vuoto - usa Sidebar.tsx)
export function UserPanel({ open, onClose, savedCount, onSettingsChange }: {
  open: boolean
  onClose: () => void
  savedCount: number
  onSettingsChange?: (s: UserSettings) => void
}) {
  // Questo componente è deprecato: usa Sidebar.tsx
  if (!open) return null
  return null
}

export function UserButton({ onClick, unreadNotifs }: { onClick: () => void; unreadNotifs: number }) {
  return null // Deprecato: il pulsante hamburger è nella dashboard
}
