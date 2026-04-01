/**
 * GeoBridge — Realtime WebSocket Hook
 *
 * Usa Supabase Realtime per sincronizzare le analisi in tempo reale:
 * - Aggiornamenti di status (pending → processing → completed)
 * - Nuove analisi create da altri device dello stesso utente
 * - Variazioni di score/livello rischio
 *
 * In demo mode il hook è un no-op silenzioso.
 */

'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createClient, isDemoMode } from '@/lib/supabase/client'
import { AnalysisResult } from '@/lib/types'
import { loadAnalysisById } from '@/lib/analysis-store'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface RealtimeOptions {
  userId: string | undefined
  /** Chiamata quando arriva un'analisi nuova o aggiornata */
  onAnalysisUpdate: (analysis: AnalysisResult) => void
  /** Chiamata quando un'analisi viene eliminata */
  onAnalysisDelete: (id: string) => void
}

/**
 * useAnalysisRealtime — sottoscrive ai cambiamenti della tabella analyses
 * per l'utente corrente via Supabase Realtime (WebSocket).
 *
 * Si deiscrive automaticamente quando il componente smonta
 * o quando userId cambia.
 */
export function useAnalysisRealtime({
  userId,
  onAnalysisUpdate,
  onAnalysisDelete,
}: RealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  // Refs stabili per le callback (evita re-subscription su ogni render)
  const onUpdateRef = useRef(onAnalysisUpdate)
  const onDeleteRef = useRef(onAnalysisDelete)
  useEffect(() => { onUpdateRef.current = onAnalysisUpdate }, [onAnalysisUpdate])
  useEffect(() => { onDeleteRef.current = onAnalysisDelete }, [onAnalysisDelete])

  const subscribe = useCallback(() => {
    if (isDemoMode() || !userId) return

    const supabase = createClient()

    // Filtriamo lato Supabase per user_id per sicurezza
    // (la RLS fa già il lavoro, ma il filtro riduce il traffico WebSocket)
    channelRef.current = supabase
      .channel(`analyses:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analyses',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          // Nuova analisi inserita — carica il record completo con i risultati
          const id = (payload.new as { id: string }).id
          const full = await loadAnalysisById(id, userId)
          if (full) onUpdateRef.current(full)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'analyses',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const id = (payload.new as { id: string }).id
          const full = await loadAnalysisById(id, userId)
          if (full) onUpdateRef.current(full)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'analyses',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const id = (payload.old as { id: string }).id
          if (id) onDeleteRef.current(id)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[GeoBridge RT] Subscribed to analyses realtime')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[GeoBridge RT] Channel error — reconnecting in 5s')
          setTimeout(subscribe, 5000)
        }
      })
  }, [userId])

  useEffect(() => {
    subscribe()
    return () => {
      if (channelRef.current) {
        const supabase = createClient()
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [subscribe])
}

/**
 * useAnalysisStatus — polling leggero per aggiornamenti di status
 * su una singola analisi (utile se Realtime non è disponibile).
 * Si ferma automaticamente quando status = 'completed' | 'failed'.
 */
export function useAnalysisStatus(
  analysisId: string | null,
  userId: string | undefined,
  onUpdate: (a: AnalysisResult) => void,
  intervalMs = 3000
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!analysisId || !userId || isDemoMode()) return

    timerRef.current = setInterval(async () => {
      const a = await loadAnalysisById(analysisId, userId)
      if (!a) return
      onUpdate(a)
      if (a.status === 'completed' || a.status === 'failed') {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }, intervalMs)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [analysisId, userId, intervalMs, onUpdate])
}
