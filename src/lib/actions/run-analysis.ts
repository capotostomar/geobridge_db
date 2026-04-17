'use server'
/**
 * Server Action: runAnalysis
 *
 * Gira SOLO su Node.js (server-side) — qui process.env funziona,
 * qui le chiamate a Copernicus/Sentinel Hub vengono fatte davvero.
 *
 * Il client (app-shell, dashboard-page) chiama questa funzione con await.
 * Se Copernicus va in errore, l'eccezione risale al client e finisce nel toast.
 */

import { runRealAnalysis } from '@/lib/analysis-engine'
import type { AnalysisRequest, AnalysisResult } from '@/lib/types'

export async function runAnalysis(req: AnalysisRequest): Promise<AnalysisResult> {
  // Qui siamo su Node.js — process.env.COPERNICUS_CLIENT_ID è leggibile
  return runRealAnalysis(req)
}
