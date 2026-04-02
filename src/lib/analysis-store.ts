/**
 * GeoBridge — Analysis Store
 *
 * Layer di persistenza unificato che astrae:
 *   - Supabase (modalità produzione, utente autenticato)
 *   - localStorage (modalità demo / fallback offline)
 *
 * Tutti i componenti importano SOLO da questo file,
 * mai direttamente da localStorage o Supabase.
 */

import { createClient, isDemoMode } from '@/lib/supabase/client'
import { AnalysisResult } from '@/lib/types'

// ─── Tipo interno per il record Supabase ──────────────────────────────────

interface SupabaseAnalysis {
  id: string
  user_id: string
  title: string
  address: string | null
  area_km2: number
  area_type: string
  area_geojson: {
    type: 'Feature'
    geometry: { type: string; coordinates: unknown }
    properties: Record<string, unknown>
  }
  start_date: string
  end_date: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  composite_score: number | null
  composite_level: string | null
  summary: string | null
  metadata: Record<string, unknown>
  created_at: string
  completed_at: string | null
  analysis_results?: {
    periods: unknown[]
    indices: unknown[]
    categories: unknown[]
    recommendations: unknown[]
  }[]
}

// ─── Conversione Supabase → AnalysisResult ────────────────────────────────

function fromSupabase(row: SupabaseAnalysis): AnalysisResult {
  const res = row.analysis_results?.[0]
  const coords: [number, number][] = (() => {
    try {
      const geom = row.area_geojson?.geometry
      if (!geom) return []
      if (geom.type === 'Polygon') {
        return (geom.coordinates as number[][][])[0].map(c => [c[1], c[0]] as [number, number])
      }
      return []
    } catch { return [] }
  })()

  return {
    id: row.id,
    status: row.status,
    title: row.title,
    address: row.address ?? undefined,
    area: row.area_km2,
    areaType: row.area_type,
    coordinates: coords,
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    periods: (res?.periods ?? []) as AnalysisResult['periods'],
    indices: (res?.indices ?? []) as AnalysisResult['indices'],
    categories: (res?.categories ?? []) as AnalysisResult['categories'],
    compositeScore: row.composite_score ?? 0,
    compositeLevel: (row.composite_level ?? 'basso') as AnalysisResult['compositeLevel'],
    summary: row.summary ?? '',
    recommendations: (res?.recommendations ?? []) as string[],
    // Metadati extra (analysisMode, ecc.)
    ...row.metadata,
  }
}

// ─── Conversione AnalysisResult → payload Supabase ────────────────────────

function toSupabasePayload(a: AnalysisResult, userId: string) {
  // Costruisce GeoJSON Feature dalla lista di coordinate
  const coordinates = a.coordinates.map(c => [c[1], c[0]]) // lat/lng → lng/lat
  // Chiudi il ring se non è già chiuso
  if (coordinates.length > 0) {
    const first = coordinates[0]; const last = coordinates[coordinates.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first)
  }

  const area_geojson = {
    type: 'Feature' as const,
    geometry: { type: 'Polygon', coordinates: [coordinates] },
    properties: { area_km2: a.area, area_type: a.areaType },
  }

  // Separa i campi noti da quelli extra (es. analysisMode)
  const { id, status, title, address, area, areaType, startDate, endDate,
    createdAt, completedAt, periods, indices, categories, compositeScore,
    compositeLevel, summary, recommendations, coordinates: _c, ...extraMeta } = a

  return {
    analysisRow: {
      id,
      user_id: userId,
      title,
      address: address ?? null,
      area_km2: area,
      area_type: areaType,
      area_geojson,
      start_date: startDate,
      end_date: endDate,
      status,
      composite_score: compositeScore,
      composite_level: compositeLevel,
      summary: summary ?? null,
      metadata: extraMeta,
      created_at: createdAt,
      completed_at: completedAt ?? null,
    },
    resultsRow: {
      analysis_id: id,
      periods,
      indices,
      categories,
      recommendations,
    },
  }
}

// ─── localStorage helpers (demo / fallback) ───────────────────────────────

const LS_KEY = 'gb_analyses'

function lsLoad(): AnalysisResult[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
function lsSave(list: AnalysisResult[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 50)))
}

// ─── API pubblica ─────────────────────────────────────────────────────────

/**
 * Carica tutte le analisi dell'utente corrente.
 * In demo mode usa localStorage.
 */
export async function loadAllAnalyses(userId?: string): Promise<AnalysisResult[]> {
  if (isDemoMode() || !userId) return lsLoad()

  const supabase = createClient()
  const { data, error } = await supabase
    .from('analyses')
    .select(`
      *,
      analysis_results ( periods, indices, categories, recommendations )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[GeoBridge] loadAllAnalyses error:', error.message)
    return lsLoad() // fallback locale
  }

  return (data as SupabaseAnalysis[]).map(fromSupabase)
}

/**
 * Carica una singola analisi per ID.
 */
export async function loadAnalysisById(id: string, userId?: string): Promise<AnalysisResult | null> {
  if (isDemoMode() || !userId) {
    return lsLoad().find(a => a.id === id) ?? null
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('analyses')
    .select(`
      *,
      analysis_results ( periods, indices, categories, recommendations )
    `)
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    // Fallback al localStorage
    return lsLoad().find(a => a.id === id) ?? null
  }

  return fromSupabase(data as SupabaseAnalysis)
}

/**
 * Salva una nuova analisi (sia su Supabase che localStorage come cache).
 * Usa upsert per idempotenza (riesecuzioni sicure).
 */
export async function saveAnalysis(a: AnalysisResult, userId?: string): Promise<void> {
  // Salva sempre in localStorage come cache/fallback
  const list = lsLoad()
  const idx = list.findIndex(x => x.id === a.id)
  if (idx >= 0) list[idx] = a
  else list.unshift(a)
  lsSave(list)

  if (isDemoMode() || !userId) return

  const supabase = createClient()
  const { analysisRow, resultsRow } = toSupabasePayload(a, userId)

  // 1. Upsert della riga principale
  const { error: e1 } = await supabase
    .from('analyses')
    .upsert(analysisRow, { onConflict: 'id' })

  if (e1) { console.error('[GeoBridge] saveAnalysis (analyses):', e1.message); return }

  // 2. Upsert dei risultati (elimina + reinserisci per semplicità)
  await supabase
    .from('analysis_results')
    .delete()
    .eq('analysis_id', a.id)

  const { error: e2 } = await supabase
    .from('analysis_results')
    .insert(resultsRow)

  if (e2) console.error('[GeoBridge] saveAnalysis (results):', e2.message)
}

/**
 * Elimina un'analisi per ID.
 */
export async function deleteAnalysis(id: string, userId?: string): Promise<void> {
  // Rimuovi da localStorage
  lsSave(lsLoad().filter(a => a.id !== id))

  if (isDemoMode() || !userId) return

  const supabase = createClient()
  const { error } = await supabase
    .from('analyses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) console.error('[GeoBridge] deleteAnalysis:', error.message)
}

/**
 * Salva (upsert) la configurazione alert per un'analisi.
 */
export async function saveAlertConfig(config: {
  userId: string
  analysisId: string | null
  email: string
  enabled: boolean
  thresholds: Record<string, number>
  policyWeights: Record<string, unknown>
}): Promise<void> {
  if (isDemoMode()) return

  const supabase = createClient()
  const { error } = await supabase
    .from('alert_configs')
    .upsert({
      user_id: config.userId,
      analysis_id: config.analysisId,
      email: config.email,
      enabled: config.enabled,
      thresholds: config.thresholds,
      policy_weights: config.policyWeights,
    }, { onConflict: 'user_id,analysis_id' })

  if (error) console.error('[GeoBridge] saveAlertConfig:', error.message)
}

/**
 * Carica la configurazione alert dell'utente.
 */
export async function loadAlertConfig(userId: string, analysisId?: string) {
  if (isDemoMode()) return null

  const supabase = createClient()
  let query = supabase
    .from('alert_configs')
    .select('*')
    .eq('user_id', userId)

  if (analysisId) query = query.eq('analysis_id', analysisId)
  else query = query.is('analysis_id', null)

  const { data, error } = await query.single()
  if (error) return null
  return data
}
