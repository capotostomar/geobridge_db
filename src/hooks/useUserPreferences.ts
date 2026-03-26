'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  loadSettings, saveSettings, 
  loadHistory, saveHistory, addHistoryEntry,
  UserSettings, DEFAULT_SETTINGS, HistoryEntry 
} from '@/components/user/user-panel'

export function useUserPreferences() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [initialized, setInitialized] = useState(false)

  // Carica da localStorage al mount
  useEffect(() => {
    setSettings(loadSettings())
    setHistory(loadHistory())
    setInitialized(true)
  }, [])

  // Aggiorna settings
  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  // Aggiungi entry alla history
  const addHistory = useCallback((type: HistoryEntry['type'], title: string) => {
    addHistoryEntry(type, title)
    setHistory(loadHistory()) // reload per aggiornare lo stato
  }, [])

  // Cancella tutta la history
  const clearHistory = useCallback(() => {
    saveHistory([])
    setHistory([])
  }, [])

  return {
    settings,
    history,
    initialized,
    updateSettings,
    addHistory,
    clearHistory,
  }
}
