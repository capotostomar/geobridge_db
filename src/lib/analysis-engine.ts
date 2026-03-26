/**
 * Mock Risk Analysis Engine
 * Simula le analisi che in produzione vengono eseguite da Sentinel-2 / GeoSync
 * Indici implementati: NDVI, NDMI, NBR, NDBI, BREI, DOPI
 */

import {
  AnalysisResult, AnalysisRequest, PeriodResult, IndexResult,
  RiskCategory, RiskLevel
} from '@/lib/types'

// ─── Utility ──────────────────────────────────────────────────────────────

function rnd(min: number, max: number, decimals = 3) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals))
}

function seedRnd(seed: number, min: number, max: number) {
  const x = Math.sin(seed) * 10000
  const r = x - Math.floor(x)
  return parseFloat((r * (max - min) + min).toFixed(3))
}

function scoreToLevel(score: number): RiskLevel {
  if (score < 25) return 'basso'
  if (score < 50) return 'medio'
  if (score < 75) return 'alto'
  return 'critico'
}

// Genera un profilo coerente basato sulle coordinate (simula bioma reale)
function getAreaProfile(coords: [number, number][]) {
  if (!coords.length) return { type: 'mixed', lat: 42, lon: 12 }
  const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length
  const lon = coords.reduce((s, c) => s + c[1], 0) / coords.length
  
  // Italia: profilo basato sulla latitudine
  if (lat > 45) return { type: 'alpine', lat, lon }       // Nord / Alpi
  if (lat > 43) return { type: 'padana', lat, lon }       // Pianura padana
  if (lat > 40) return { type: 'appenninica', lat, lon }  // Centro / Appennini
  return { type: 'mediterranean', lat, lon }               // Sud / Mediterraneo
}

// ─── Genera periodi temporali ──────────────────────────────────────────────

function generatePeriods(startDate: string, endDate: string, profile: { type: string, lat: number }, seed: number): PeriodResult[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const periods: PeriodResult[] = []
  
  const current = new Date(start)
  let periodIdx = 0
  
  while (current <= end) {
    const next = new Date(current)
    next.setMonth(next.getMonth() + 6)
    
    const month = current.getMonth() + 1
    const isSummer = month >= 5 && month <= 9
    const isWinter = month <= 2 || month >= 11
    
    // Base values per profilo geografico e stagione
    const profileBase: Record<string, Record<string, [number, number]>> = {
      alpine:      { ndvi: isSummer ? [0.55, 0.80] : [0.10, 0.35], ndmi: [0.30, 0.55], nbr: [0.45, 0.70], ndbi: [-0.25, 0.00], brei: [0.05, 0.25], dopi: [-0.10, 0.10] },
      padana:      { ndvi: isSummer ? [0.50, 0.75] : [0.20, 0.45], ndmi: [0.20, 0.45], nbr: [0.35, 0.60], ndbi: [0.00, 0.30],  brei: [0.10, 0.30], dopi: [0.05, 0.20] },
      appenninica: { ndvi: isSummer ? [0.40, 0.65] : [0.15, 0.40], ndmi: [0.10, 0.35], nbr: [0.30, 0.55], ndbi: [-0.10, 0.20], brei: [0.08, 0.28], dopi: [-0.05, 0.15] },
      mediterranean:{ ndvi: isSummer ? [0.20, 0.45] : [0.30, 0.55], ndmi: [-0.10, 0.20], nbr: [0.20, 0.45], ndbi: [0.05, 0.35], brei: [0.12, 0.35], dopi: [0.10, 0.30] },
      mixed:       { ndvi: [0.30, 0.60], ndmi: [0.10, 0.40], nbr: [0.30, 0.55], ndbi: [-0.05, 0.25], brei: [0.08, 0.28], dopi: [0.00, 0.20] },
    }
    
    const base = profileBase[profile.type] || profileBase.mixed
    const s = seed + periodIdx * 17
    
    const ndvi = seedRnd(s + 1, base.ndvi[0], base.ndvi[1])
    const ndmi = seedRnd(s + 2, base.ndmi[0], base.ndmi[1])
    const nbr  = seedRnd(s + 3, base.nbr[0], base.nbr[1])
    const ndbi = seedRnd(s + 4, base.ndbi[0], base.ndbi[1])
    const brei = seedRnd(s + 5, base.brei[0], base.brei[1])
    const dopi = seedRnd(s + 6, base.dopi[0], base.dopi[1])
    
    // Calcolo rischi (0-100)
    // NDVI basso → rischio vegetazione alto
    const vegetationRisk = Math.round(Math.max(0, (0.7 - ndvi) / 0.7) * 100)
    // NDMI basso → rischio idrico alto
    const waterRisk = Math.round(Math.max(0, (0.4 - ndmi) / 0.7) * 80 + (isWinter ? 10 : 0))
    // NDBI alto → rischio urbano/surriscaldamento
    const urbanRisk = Math.round(Math.max(0, ndbi * 100 + 20))
    // NBR basso + NDVI basso → rischio incendio alto
    const fireRisk = Math.round(Math.max(0, ((0.6 - nbr) + (0.6 - ndvi)) / 1.2 * 100 * (isSummer ? 1.3 : 0.6)))
    
    const compositeRisk = Math.round((vegetationRisk * 0.30 + waterRisk * 0.25 + urbanRisk * 0.20 + fireRisk * 0.25))
    const clampedComposite = Math.min(100, compositeRisk)
    
    const periodLabel = `${current.getFullYear()}-${String(month).padStart(2,'0')} / ${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2,'0')}`
    
    periods.push({
      period: periodLabel,
      date: current.toISOString(),
      ndvi, ndmi, nbr, ndbi, brei, dopi,
      vegetationRisk: Math.min(100, vegetationRisk),
      waterRisk: Math.min(100, waterRisk),
      urbanRisk: Math.min(100, urbanRisk),
      fireRisk: Math.min(100, fireRisk),
      compositeRisk: clampedComposite,
      riskLevel: scoreToLevel(clampedComposite),
    })
    
    current.setMonth(current.getMonth() + 6)
    periodIdx++
  }
  
  return periods
}

// ─── Genera indici riassuntivi (media sull'ultimo periodo) ─────────────────

function generateIndices(periods: PeriodResult[]): IndexResult[] {
  if (!periods.length) return []
  
  const last = periods[periods.length - 1]
  const prev = periods.length > 1 ? periods[periods.length - 2] : null
  
  const trend = (current: number, previous: number | null): IndexResult['trend'] => {
    if (!previous) return 'stable'
    const delta = current - previous
    if (Math.abs(delta) < 0.03) return 'stable'
    return delta > 0 ? 'improving' : 'degrading'
  }
  
  return [
    {
      name: 'NDVI',
      fullName: 'Normalized Difference Vegetation Index',
      value: last.ndvi,
      description: 'Misura la densità e la salute della vegetazione.',
      interpretation: last.ndvi > 0.5 ? 'Vegetazione densa e sana' : last.ndvi > 0.3 ? 'Vegetazione moderata con possibili stress' : 'Vegetazione scarsa o sotto stress idrico',
      trend: trend(last.ndvi, prev?.ndvi ?? null),
      trendValue: prev ? parseFloat((last.ndvi - prev.ndvi).toFixed(3)) : 0,
    },
    {
      name: 'NDMI',
      fullName: 'Normalized Difference Moisture Index',
      value: last.ndmi,
      description: 'Indica il contenuto idrico della vegetazione e del suolo.',
      interpretation: last.ndmi > 0.3 ? 'Buona umidità, rischio siccità basso' : last.ndmi > 0.1 ? 'Umidità moderata, monitorare' : 'Deficit idrico rilevante, rischio siccità elevato',
      trend: trend(last.ndmi, prev?.ndmi ?? null),
      trendValue: prev ? parseFloat((last.ndmi - prev.ndmi).toFixed(3)) : 0,
    },
    {
      name: 'NBR',
      fullName: 'Normalized Burn Ratio',
      value: last.nbr,
      description: 'Rileva aree bruciate e valuta la gravità degli incendi.',
      interpretation: last.nbr > 0.4 ? 'Nessuna traccia di incendi recenti' : last.nbr > 0.2 ? 'Possibili aree con vegetazione stressata o bruciata lievemente' : 'Aree probabilmente interessate da incendi o forte stress termico',
      trend: trend(last.nbr, prev?.nbr ?? null),
      trendValue: prev ? parseFloat((last.nbr - prev.nbr).toFixed(3)) : 0,
    },
    {
      name: 'NDBI',
      fullName: 'Normalized Difference Built-up Index',
      value: last.ndbi,
      description: 'Identifica aree urbanizzate e superfici artificiali.',
      interpretation: last.ndbi > 0.2 ? 'Alta densità di superfici edificate' : last.ndbi > 0 ? 'Mix di aree edificate e naturali' : 'Prevalenza di superfici naturali o vegetate',
      trend: trend(last.ndbi, prev?.ndbi ?? null),
      trendValue: prev ? parseFloat((last.ndbi - prev.ndbi).toFixed(3)) : 0,
    },
    {
      name: 'BREI',
      fullName: 'Bare Rock Exposure Index',
      value: last.brei,
      description: 'Misura l\'esposizione di suolo nudo e roccia affiorante.',
      interpretation: last.brei > 0.25 ? 'Elevata esposizione di suolo nudo, rischio erosione' : last.brei > 0.1 ? 'Esposizione moderata' : 'Suolo ben coperto da vegetazione',
      trend: trend(last.brei, prev?.brei ?? null),
      trendValue: prev ? parseFloat((last.brei - prev.brei).toFixed(3)) : 0,
    },
    {
      name: 'DOPI',
      fullName: 'Drought and Overheating Potential Index',
      value: last.dopi,
      description: 'Stima il rischio combinato di siccità e surriscaldamento superficiale.',
      interpretation: last.dopi > 0.2 ? 'Rischio di siccità e stress termico significativo' : last.dopi > 0.05 ? 'Condizioni moderate, da monitorare in estate' : 'Condizioni termiche e idriche favorevoli',
      trend: trend(last.dopi, prev?.dopi ?? null),
      trendValue: prev ? parseFloat((last.dopi - prev.dopi).toFixed(3)) : 0,
    },
  ]
}

// ─── Genera categorie di rischio ───────────────────────────────────────────

function generateCategories(periods: PeriodResult[]): RiskCategory[] {
  if (!periods.length) return []
  
  const avgScore = (key: keyof PeriodResult) =>
    Math.round(periods.reduce((s, p) => s + (p[key] as number), 0) / periods.length)
  
  const vegScore    = avgScore('vegetationRisk')
  const waterScore  = avgScore('waterRisk')
  const urbanScore  = avgScore('urbanRisk')
  const fireScore   = avgScore('fireRisk')
  
  return [
    {
      name: 'Rischio Vegetazione',
      score: vegScore,
      level: scoreToLevel(vegScore),
      description: 'Valuta la salute e la copertura vegetale dell\'area, includendo stress idrico e anomalie fenologiche.',
      factors: vegScore > 50
        ? ['Bassa copertura NDVI', 'Stress idrico rilevato (NDMI)', 'Stagionalità anomala']
        : ['Copertura vegetale adeguata', 'Indici NDVI nella norma'],
    },
    {
      name: 'Rischio Idrico',
      score: waterScore,
      level: scoreToLevel(waterScore),
      description: 'Analizza il bilancio idrico, la presenza di corpi d\'acqua e il rischio di siccità o alluvioni.',
      factors: waterScore > 50
        ? ['Deficit NDMI persistente', 'DOPI elevato', 'Periodo critico stagionale']
        : ['Umidità nella norma', 'Nessun deficit idrico rilevante'],
    },
    {
      name: 'Rischio Urbano',
      score: urbanScore,
      level: scoreToLevel(urbanScore),
      description: 'Misura l\'impatto dell\'urbanizzazione sul territorio e il rischio da isola di calore.',
      factors: urbanScore > 50
        ? ['Alta densità NDBI', 'Superfici impermeabili prevalenti', 'Effetto isola di calore']
        : ['Bassa densità edificata', 'Buon equilibrio verde-costruito'],
    },
    {
      name: 'Rischio Incendio',
      score: fireScore,
      level: scoreToLevel(fireScore),
      description: 'Stima la probabilità di innesco e propagazione di incendi boschivi basandosi su NBR, NDVI e DOPI.',
      factors: fireScore > 50
        ? ['NBR critico', 'Vegetazione secca (NDVI + NDMI bassi)', 'Condizioni climatiche favorevoli all\'innesco']
        : ['NBR nella norma', 'Umidità sufficiente della vegetazione'],
    },
  ]
}

// ─── Genera raccomandazioni ────────────────────────────────────────────────

function generateRecommendations(categories: RiskCategory[], profile: { type: string }): string[] {
  const recs: string[] = []
  
  categories.forEach(cat => {
    if (cat.level === 'critico' || cat.level === 'alto') {
      if (cat.name.includes('Vegetazione')) {
        recs.push('Implementare monitoraggio periodico della copertura vegetale con frequenza mensile.')
        recs.push('Valutare interventi di riforestazione o recupero nelle aree con NDVI critico.')
      }
      if (cat.name.includes('Idrico')) {
        recs.push('Attivare piano di emergenza idrica per le stagioni critiche.')
        recs.push('Installare sensori IoT per il monitoraggio real-time dell\'umidità del suolo.')
      }
      if (cat.name.includes('Urbano')) {
        recs.push('Progettare infrastrutture verdi per ridurre l\'effetto isola di calore.')
        recs.push('Incrementare la permeabilità del suolo nelle aree edificate.')
      }
      if (cat.name.includes('Incendio')) {
        recs.push('Attivare sorveglianza antincendio nel periodo giugno-settembre.')
        recs.push('Creare viali tagliafuoco nelle aree boschive ad alto rischio.')
      }
    }
  })
  
  if (!recs.length) {
    recs.push('I livelli di rischio sono generalmente nella norma. Continuare il monitoraggio semestrale.')
    recs.push('Mantenere la copertura vegetale esistente per preservare gli indici favorevoli.')
  }
  
  recs.push('Aggiornare questa analisi con dati Sentinel-2 reali per una valutazione di precisione assicurativa.')
  
  return [...new Set(recs)].slice(0, 6)
}

// ─── Genera sommario testuale ──────────────────────────────────────────────

function generateSummary(composite: number, level: RiskLevel, area: number, profile: { type: string }, periods: PeriodResult[]): string {
  const areaLabel = area < 1 ? `${(area * 100).toFixed(1)} ha` : `${area.toFixed(2)} km²`
  const periodCount = periods.length
  
  const profileLabel: Record<string, string> = {
    alpine: 'territorio alpino',
    padana: 'pianura padana',
    appenninica: 'area appenninica',
    mediterranean: 'area mediterranea',
    mixed: 'territorio misto',
  }
  
  const levelDesc: Record<RiskLevel, string> = {
    basso: 'Il territorio presenta condizioni generalmente favorevoli.',
    medio: 'Sono presenti alcune criticità che richiedono monitoraggio.',
    alto: 'Il rischio complessivo è elevato e richiede azioni correttive.',
    critico: 'Situazione critica: raccomandato intervento immediato.',
  }
  
  return `L'analisi multi-temporale su ${periodCount} periodi semestrali dell'${profileLabel[profile.type] || 'area'} (${areaLabel}) restituisce un indice di rischio composito pari a ${composite}/100 (${level.toUpperCase()}). ${levelDesc[level]} L'analisi è basata su indici spettrali derivati da dati Sentinel-2 [SIMULATI] e include la valutazione di vulnerabilità vegetale, idrica, urbana e da incendio.`
}

// ─── Entry point principale ────────────────────────────────────────────────

export async function runMockAnalysis(req: AnalysisRequest): Promise<AnalysisResult> {
  // Simula elaborazione con delay realistico
  await new Promise(r => setTimeout(r, 2800 + Math.random() * 1200))
  
  const id = `analysis_${Date.now()}`
  const profile = getAreaProfile(req.drawnArea.coordinates)
  const seed = req.drawnArea.coordinates.reduce((s, c) => s + c[0] + c[1], 0) * 1000
  
  const periods = generatePeriods(req.startDate, req.endDate, profile, seed)
  const indices = generateIndices(periods)
  const categories = generateCategories(periods)
  
  const avgComposite = Math.round(periods.reduce((s, p) => s + p.compositeRisk, 0) / (periods.length || 1))
  const compositeLevel = scoreToLevel(avgComposite)
  const summary = generateSummary(avgComposite, compositeLevel, req.drawnArea.area, profile, periods)
  const recommendations = generateRecommendations(categories, profile)
  
  return {
    id,
    status: 'completed',
    title: req.title,
    address: req.address,
    area: req.drawnArea.area,
    areaType: req.drawnArea.type,
    coordinates: req.drawnArea.coordinates,
    startDate: req.startDate,
    endDate: req.endDate,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    periods,
    indices,
    categories,
    compositeScore: avgComposite,
    compositeLevel,
    summary,
    recommendations,
  }
}

// ─── Persistenza ──────────────────────────────────────────────────────────

const ANALYSIS_KEY = 'gb_analyses'

export function saveAnalysis(a: AnalysisResult) {
  const list = loadAllAnalyses()
  list.unshift(a)
  localStorage.setItem(ANALYSIS_KEY, JSON.stringify(list.slice(0, 20)))
}

export function loadAllAnalyses(): AnalysisResult[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(ANALYSIS_KEY) || '[]') } catch { return [] }
}

export function loadAnalysisById(id: string): AnalysisResult | null {
  return loadAllAnalyses().find(a => a.id === id) ?? null
}
