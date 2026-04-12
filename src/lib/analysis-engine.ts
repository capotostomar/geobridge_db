/**
 * GeoBridge Mock Risk Analysis Engine v2
 * Indici: NDVI, NDMI, NBR, NDBI, BREI, DOPI, EVI, SAVI, VCI, LST, ERA5 Precipitation
 * ML Risk Model: EFFIS-trained mock, output probabilità 30/90gg per tipo evento
 * Profili polizza: agricultural, property, crop, custom — parametri specifici per tipo
 */

import {
  AnalysisResult, AnalysisRequest, PeriodResult, IndexResult,
  RiskCategory, RiskLevel, SpecificRisk, MLRiskModel,
  PolicySpecificParams, PolicyProfile
} from '@/lib/types'

// ─── Utility ──────────────────────────────────────────────────────────────

function rnd(min: number, max: number, dec = 3) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dec))
}

function seedRnd(seed: number, min: number, max: number, dec = 3) {
  const x = Math.sin(seed) * 10000
  const r = x - Math.floor(x)
  return parseFloat((r * (max - min) + min).toFixed(dec))
}

function clamp(v: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)) }
function pct(v: number) { return Math.round(clamp(v)) }
function scoreToLevel(s: number): RiskLevel {
  if (s < 25) return 'basso'; if (s < 50) return 'medio'; if (s < 75) return 'alto'; return 'critico'
}

// ─── Area profile dal centroide ────────────────────────────────────────────

type AreaProfile = {
  type: 'alpine' | 'padana' | 'appenninica' | 'mediterranean' | 'mixed'
  lat: number; lon: number
  biome: string
  landUse: string   // Corine simulato
  elevation: number // m
  slope: number     // gradi
}

function getAreaProfile(coords: [number, number][]): AreaProfile {
  if (!coords.length) return { type: 'mixed', lat: 42, lon: 12, biome: 'Mixed', landUse: 'Mixed land use (CLC 999)', elevation: 200, slope: 5 }
  const lat = coords.reduce((s, c) => s + c[0], 0) / coords.length
  const lon = coords.reduce((s, c) => s + c[1], 0) / coords.length
  const seed = lat * 100 + lon * 10

  if (lat > 45.5) return {
    type: 'alpine', lat, lon,
    biome: 'Alpine Meadows & Coniferous Forest',
    landUse: 'Forests (CLC 312)',
    elevation: Math.round(seedRnd(seed, 800, 2400, 0)),
    slope: Math.round(seedRnd(seed + 1, 15, 35, 0)),
  }
  if (lat > 44.5) return {
    type: 'padana', lat, lon,
    biome: 'Temperate Agricultural Plain',
    landUse: 'Arable Land (CLC 211)',
    elevation: Math.round(seedRnd(seed, 20, 120, 0)),
    slope: Math.round(seedRnd(seed + 1, 0, 5, 0)),
  }
  if (lat > 41) return {
    type: 'appenninica', lat, lon,
    biome: 'Sub-Mediterranean Mixed Forest',
    landUse: 'Transitional Woodland Shrub (CLC 324)',
    elevation: Math.round(seedRnd(seed, 200, 900, 0)),
    slope: Math.round(seedRnd(seed + 1, 8, 28, 0)),
  }
  return {
    type: 'mediterranean', lat, lon,
    biome: 'Mediterranean Maquis & Garrigue',
    landUse: 'Sclerophyllous Vegetation (CLC 323)',
    elevation: Math.round(seedRnd(seed, 0, 400, 0)),
    slope: Math.round(seedRnd(seed + 1, 2, 20, 0)),
  }
}

// ─── Genera periodi ────────────────────────────────────────────────────────

function generatePeriods(startDate: string, endDate: string, profile: AreaProfile, seed: number): PeriodResult[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const periods: PeriodResult[] = []
  const current = new Date(start)
  let pi = 0

  // VCI reference (min/max NDVI storici per il bioma)
  const ndviHistMin: Record<string, number> = { alpine: 0.05, padana: 0.15, appenninica: 0.10, mediterranean: 0.08, mixed: 0.10 }
  const ndviHistMax: Record<string, number> = { alpine: 0.85, padana: 0.80, appenninica: 0.72, mediterranean: 0.65, mixed: 0.70 }

  while (current <= end) {
    const next = new Date(current)
    next.setMonth(next.getMonth() + 6)
    const month = current.getMonth() + 1
    const isSummer = month >= 5 && month <= 9
    const isWinter = month <= 2 || month >= 11
    const s = seed + pi * 17

    // Base per profilo + stagione
    type Range = [number, number]
    const profileBase: Record<string, Record<string, Range>> = {
      alpine:        { ndvi: isSummer ? [0.55,0.82] : [0.08,0.32], ndmi: [0.30,0.58], nbr: [0.45,0.72], ndbi: [-0.28,-0.02], brei: [0.04,0.22], dopi: [-0.12,0.08], lst: isSummer ? [14,26] : [-4,8], precip: isSummer ? [60,120] : [40,90] },
      padana:        { ndvi: isSummer ? [0.48,0.76] : [0.18,0.44], ndmi: [0.18,0.44], nbr: [0.32,0.60], ndbi: [0.00,0.32],   brei: [0.08,0.28], dopi: [0.04,0.22], lst: isSummer ? [26,38] : [0,12],  precip: isSummer ? [40,90] :  [30,70] },
      appenninica:   { ndvi: isSummer ? [0.38,0.65] : [0.14,0.40], ndmi: [0.08,0.34], nbr: [0.28,0.54], ndbi: [-0.12,0.22],  brei: [0.07,0.27], dopi: [-0.04,0.18], lst: isSummer ? [24,36] : [2,14],  precip: isSummer ? [20,60] :  [50,100] },
      mediterranean: { ndvi: isSummer ? [0.18,0.44] : [0.28,0.54], ndmi: [-0.12,0.22], nbr: [0.18,0.44], ndbi: [0.04,0.36], brei: [0.10,0.34], dopi: [0.08,0.30],  lst: isSummer ? [30,44] : [8,18],  precip: isSummer ? [5,30] :   [40,90] },
      mixed:         { ndvi: [0.28,0.60], ndmi: [0.08,0.38], nbr: [0.28,0.54], ndbi: [-0.06,0.26], brei: [0.06,0.26], dopi: [0.00,0.20], lst: [10,32], precip: [30,80] },
    }
    const base = profileBase[profile.type] || profileBase.mixed

    const ndvi = seedRnd(s+1, base.ndvi[0], base.ndvi[1])
    const ndmi = seedRnd(s+2, base.ndmi[0], base.ndmi[1])
    const nbr  = seedRnd(s+3, base.nbr[0],  base.nbr[1])
    const ndbi = seedRnd(s+4, base.ndbi[0], base.ndbi[1])
    const brei = seedRnd(s+5, base.brei[0], base.brei[1])
    const dopi = seedRnd(s+6, base.dopi[0], base.dopi[1])
    const lst  = seedRnd(s+7, base.lst[0],  base.lst[1], 1)
    const precipitation = seedRnd(s+8, base.precip[0], base.precip[1], 1)

    // EVI = 2.5 * (NIR-Red)/(NIR + 6*Red - 7.5*Blue + 1) → approssimazione da NDVI
    const evi = parseFloat((2.5 * ndvi / (1 + ndvi * 2.4 + 1)).toFixed(3))

    // SAVI = (NIR-Red)/(NIR+Red+L) * (1+L), L=0.5 → ~NDVI*0.85 in zone semi-aride
    const L = 0.5
    const savi = parseFloat(((ndvi * (1 + L)) / (1 + L * (1 - ndvi))).toFixed(3))

    // VCI = (NDVI - NDVImin) / (NDVImax - NDVImin) * 100
    const ndviMin = ndviHistMin[profile.type]
    const ndviMax = ndviHistMax[profile.type]
    const vci = parseFloat(clamp(((ndvi - ndviMin) / (ndviMax - ndviMin)) * 100).toFixed(1))

    // Rischi
    const vegetationRisk = pct((0.72 - ndvi) / 0.72 * 100)
    const waterRisk      = pct((0.38 - ndmi) / 0.70 * 80 + (isWinter ? 8 : 0) + (precipitation < 40 ? 15 : 0))
    const urbanRisk      = pct(ndbi * 100 + 20)
    const fireRisk       = pct(((0.60 - nbr) + (0.60 - ndvi)) / 1.2 * 100 * (isSummer ? 1.35 : 0.55) + (lst > 35 ? 10 : 0))

    const compositeRisk  = pct(vegetationRisk * 0.28 + waterRisk * 0.24 + urbanRisk * 0.20 + fireRisk * 0.28)

    const label = `${current.getFullYear()}-${String(month).padStart(2,'0')} / ${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`

    periods.push({
      period: label, date: current.toISOString(),
      ndvi, ndmi, nbr, ndbi, brei, dopi, evi, savi, vci, lst, precipitation,
      vegetationRisk: clamp(vegetationRisk),
      waterRisk: clamp(waterRisk),
      urbanRisk: clamp(urbanRisk),
      fireRisk: clamp(fireRisk),
      compositeRisk: clamp(compositeRisk),
      riskLevel: scoreToLevel(clamp(compositeRisk)),
    })

    current.setMonth(current.getMonth() + 6)
    pi++
  }
  return periods
}

// ─── Indici riassuntivi (ultimo periodo) ───────────────────────────────────

function generateIndices(periods: PeriodResult[]): IndexResult[] {
  if (!periods.length) return []
  const last = periods[periods.length - 1]
  const prev = periods.length > 1 ? periods[periods.length - 2] : null

  const trend = (cur: number, prv: number | null, thr = 0.03): IndexResult['trend'] => {
    if (!prv) return 'stable'
    const d = cur - prv
    if (Math.abs(d) < thr) return 'stable'
    return d > 0 ? 'improving' : 'degrading'
  }

  return [
    {
      name: 'NDVI', fullName: 'Normalized Difference Vegetation Index', source: 'Sentinel-2 B8/B4',
      value: last.ndvi,
      description: 'Misura densità e salute della vegetazione tramite riflettanza NIR e rosso.',
      interpretation: last.ndvi > 0.5 ? 'Vegetazione densa e in buona salute' : last.ndvi > 0.3 ? 'Vegetazione moderata con possibili stress' : 'Vegetazione scarsa o sotto stress idrico',
      trend: trend(last.ndvi, prev?.ndvi ?? null), trendValue: prev ? parseFloat((last.ndvi - prev.ndvi).toFixed(3)) : 0,
    },
    {
      name: 'EVI', fullName: 'Enhanced Vegetation Index', source: 'Sentinel-2 B8/B4/B2',
      value: last.evi,
      description: 'Versione migliorata di NDVI, meno sensibile all\'atmosfera e alla saturazione in zone dense.',
      interpretation: last.evi > 0.4 ? 'Copertura vegetale elevata, buona biomassa' : last.evi > 0.2 ? 'Copertura vegetale moderata' : 'Copertura vegetale scarsa o suolo nudo',
      trend: trend(last.evi, prev?.evi ?? null), trendValue: prev ? parseFloat((last.evi - prev.evi).toFixed(3)) : 0,
    },
    {
      name: 'SAVI', fullName: 'Soil Adjusted Vegetation Index', source: 'Sentinel-2 B8/B4 (L=0.5)',
      value: last.savi,
      description: 'Corregge l\'influenza del suolo nudo, ideale per zone agricole e semi-aride.',
      interpretation: last.savi > 0.45 ? 'Copertura vegetale buona, suolo ben protetto' : last.savi > 0.25 ? 'Copertura parziale, monitorare erosione' : 'Suolo esposto, rischio erosione elevato',
      trend: trend(last.savi, prev?.savi ?? null), trendValue: prev ? parseFloat((last.savi - prev.savi).toFixed(3)) : 0,
    },
    {
      name: 'VCI', fullName: 'Vegetation Condition Index', source: 'Sentinel-2 (normalizzato su storico)',
      value: last.vci / 100, unit: '%',
      description: 'Confronta NDVI attuale con il range storico del bioma. Rileva siccità e anomalie vegetali.',
      interpretation: last.vci > 60 ? 'Condizioni vegetali superiori alla media storica' : last.vci > 35 ? 'Condizioni moderate, lieve stress' : 'Stress vegetale significativo, possibile siccità',
      trend: trend(last.vci, prev?.vci ?? null, 3), trendValue: prev ? parseFloat((last.vci - prev.vci).toFixed(1)) : 0,
    },
    {
      name: 'NDMI', fullName: 'Normalized Difference Moisture Index', source: 'Sentinel-2 B8A/B11',
      value: last.ndmi,
      description: 'Indica il contenuto idrico della vegetazione e del suolo.',
      interpretation: last.ndmi > 0.3 ? 'Buona umidità, rischio siccità basso' : last.ndmi > 0.1 ? 'Umidità moderata, monitorare' : 'Deficit idrico rilevante, rischio siccità elevato',
      trend: trend(last.ndmi, prev?.ndmi ?? null), trendValue: prev ? parseFloat((last.ndmi - prev.ndmi).toFixed(3)) : 0,
    },
    {
      name: 'LST', fullName: 'Land Surface Temperature', source: 'Landsat-8 Band 10 (TIRS)',
      value: last.lst, unit: '°C',
      description: 'Temperatura superficiale derivata da banda termale Landsat-8. Indicatore di stress termico e isole di calore.',
      interpretation: last.lst > 38 ? 'Temperatura superficiale critica, forte stress termico' : last.lst > 30 ? 'Temperature elevate, monitorare in estate' : 'Temperature nella norma per la stagione',
      trend: trend(last.lst, prev?.lst ?? null, 0.5), trendValue: prev ? parseFloat((last.lst - prev.lst).toFixed(1)) : 0,
    },
    {
      name: 'Precip.', fullName: 'Precipitazioni mensili (ERA5)', source: 'Copernicus ERA5 Reanalysis',
      value: last.precipitation, unit: 'mm/mese',
      description: 'Precipitazioni cumulate mensili da ranalisi ERA5 (Copernicus Climate Data Store).',
      interpretation: last.precipitation > 80 ? 'Precipitazioni abbondanti, rischio alluvione da monitorare' : last.precipitation > 40 ? 'Regime pluviometrico nella norma' : 'Precipitazioni scarse, rischio siccità e incendi',
      trend: trend(last.precipitation, prev?.precipitation ?? null, 5), trendValue: prev ? parseFloat((last.precipitation - prev.precipitation).toFixed(1)) : 0,
    },
    {
      name: 'NBR', fullName: 'Normalized Burn Ratio', source: 'Sentinel-2 B8A/B12',
      value: last.nbr,
      description: 'Rileva aree bruciate e valuta la gravità degli incendi.',
      interpretation: last.nbr > 0.4 ? 'Nessuna traccia di incendi recenti' : last.nbr > 0.2 ? 'Possibili aree con vegetazione stressata o bruciata' : 'Aree probabilmente interessate da incendi',
      trend: trend(last.nbr, prev?.nbr ?? null), trendValue: prev ? parseFloat((last.nbr - prev.nbr).toFixed(3)) : 0,
    },
    {
      name: 'NDBI', fullName: 'Normalized Difference Built-up Index', source: 'Sentinel-2 B11/B8',
      value: last.ndbi,
      description: 'Identifica aree urbanizzate e superfici artificiali.',
      interpretation: last.ndbi > 0.2 ? 'Alta densità di superfici edificate' : last.ndbi > 0 ? 'Mix di aree edificate e naturali' : 'Prevalenza di superfici naturali',
      trend: trend(last.ndbi, prev?.ndbi ?? null), trendValue: prev ? parseFloat((last.ndbi - prev.ndbi).toFixed(3)) : 0,
    },
    {
      name: 'BREI', fullName: 'Bare Rock Exposure Index', source: 'Sentinel-2 B11/B4',
      value: last.brei,
      description: 'Misura l\'esposizione di suolo nudo e roccia affiorante.',
      interpretation: last.brei > 0.25 ? 'Elevata esposizione, rischio erosione' : last.brei > 0.1 ? 'Esposizione moderata' : 'Suolo ben coperto da vegetazione',
      trend: trend(last.brei, prev?.brei ?? null), trendValue: prev ? parseFloat((last.brei - prev.brei).toFixed(3)) : 0,
    },
  ]
}

// ─── Categorie di rischio ──────────────────────────────────────────────────

function generateCategories(periods: PeriodResult[]): RiskCategory[] {
  if (!periods.length) return []
  const avg = (k: keyof PeriodResult) => Math.round(periods.reduce((s, p) => s + (p[k] as number), 0) / periods.length)
  const veg = avg('vegetationRisk'), water = avg('waterRisk'), urban = avg('urbanRisk'), fire = avg('fireRisk')

  return [
    {
      name: 'Rischio Vegetazione', score: veg, level: scoreToLevel(veg),
      description: 'Salute e copertura vegetale, stress idrico e anomalie fenologiche (NDVI, EVI, VCI).',
      factors: veg > 50 ? ['Bassa copertura NDVI/EVI', 'VCI sotto media storica', 'Stress idrico rilevato'] : ['Copertura vegetale adeguata', 'NDVI/EVI nella norma'],
    },
    {
      name: 'Rischio Idrico', score: water, level: scoreToLevel(water),
      description: 'Bilancio idrico, siccità e rischio alluvionale (NDMI, VCI, ERA5 Precipitazioni).',
      factors: water > 50 ? ['Deficit NDMI persistente', 'Precipitazioni ERA5 sotto media', 'VCI basso'] : ['Umidità nella norma', 'Precipitazioni regolari'],
    },
    {
      name: 'Rischio Urbano', score: urban, level: scoreToLevel(urban),
      description: 'Impatto dell\'urbanizzazione, isole di calore e superfici impermeabili (NDBI, LST).',
      factors: urban > 50 ? ['Alta densità NDBI', 'LST elevata', 'Effetto isola di calore'] : ['Bassa densità edificata', 'LST nella norma'],
    },
    {
      name: 'Rischio Incendio', score: fire, level: scoreToLevel(fire),
      description: 'Probabilità di innesco e propagazione incendi boschivi (NBR, NDVI, NDMI, LST, ERA5).',
      factors: fire > 50 ? ['NBR critico', 'Vegetazione secca (NDVI+NDMI bassi)', 'LST elevata', 'Precipitazioni scarse'] : ['NBR nella norma', 'Umidità vegetazione sufficiente'],
    },
  ]
}

// ─── ML Risk Model (mock EFFIS-trained) ───────────────────────────────────

function generateMLModel(
  periods: PeriodResult[], profile: AreaProfile, composite: number
): MLRiskModel {
  if (!periods.length) return {
    modelVersion: 'GeoML-v2.1-EFFIS', biome: profile.biome, landUseCorine: profile.landUse,
    elevation: profile.elevation, slope: profile.slope, trainingData: 'EFFIS 2000-2023 + ERA5',
    specificRisks: [], overallConfidence: 0.72,
  }

  const last = periods[periods.length - 1]
  const isMediterranean = profile.type === 'mediterranean'
  const isAlpine = profile.type === 'alpine'
  const isPadana = profile.type === 'padana'
  const s = profile.lat * 100 + profile.lon * 10

  // Probabilità basate su indici + profilo geografico
  const floodP30 = pct(
    (last.precipitation > 80 ? 35 : last.precipitation > 60 ? 18 : 8) +
    (last.ndmi < 0.1 ? -5 : 0) + (profile.slope < 5 ? 10 : 0) + seedRnd(s+11, 0, 8, 0)
  )
  const floodP90 = pct(floodP30 * 1.4 + seedRnd(s+12, 0, 10, 0))

  const fireP30 = pct(
    (last.lst > 38 ? 45 : last.lst > 32 ? 25 : 10) +
    (last.ndvi < 0.25 ? 15 : 0) + (last.ndmi < 0.1 ? 12 : 0) +
    (isMediterranean ? 15 : 0) + seedRnd(s+13, 0, 8, 0)
  )
  const fireP90 = pct(fireP30 * 1.3 + seedRnd(s+14, 0, 12, 0))

  const droughtP30 = pct(
    (last.vci < 30 ? 40 : last.vci < 50 ? 22 : 8) +
    (last.precipitation < 30 ? 18 : 0) +
    (isMediterranean ? 12 : 0) + seedRnd(s+15, 0, 8, 0)
  )
  const droughtP90 = pct(droughtP30 * 1.5 + seedRnd(s+16, 0, 12, 0))

  const landslideP30 = pct(
    (profile.slope > 20 ? 28 : profile.slope > 10 ? 14 : 4) +
    (last.precipitation > 90 ? 15 : 0) + (isAlpine ? 10 : 0) + seedRnd(s+17, 0, 6, 0)
  )
  const landslideP90 = pct(landslideP30 * 1.35 + seedRnd(s+18, 0, 8, 0))

  const heatP30 = pct(
    (last.lst > 40 ? 50 : last.lst > 35 ? 28 : 10) +
    (isPadana ? 8 : 0) + seedRnd(s+19, 0, 6, 0)
  )
  const heatP90 = pct(heatP30 * 1.2 + seedRnd(s+20, 0, 10, 0))

  const specificRisks: MLRiskModel['specificRisks'] = [
    {
      type: 'flood', label: 'Alluvione',
      probability30d: clamp(floodP30), probability90d: clamp(floodP90),
      severity: scoreToLevel(floodP90),
      confidence: parseFloat(seedRnd(s+21, 0.68, 0.88).toFixed(2)),
      drivers: ['Precipitazioni ERA5', 'NDMI suolo', 'Pendenza area', 'Corine Land Use'],
    },
    {
      type: 'fire', label: 'Incendio',
      probability30d: clamp(fireP30), probability90d: clamp(fireP90),
      severity: scoreToLevel(fireP90),
      confidence: parseFloat(seedRnd(s+22, 0.72, 0.91).toFixed(2)),
      drivers: ['LST Landsat-8', 'NBR Sentinel-2', 'NDVI+NDMI', 'Storico EFFIS'],
    },
    {
      type: 'drought', label: 'Siccità',
      probability30d: clamp(droughtP30), probability90d: clamp(droughtP90),
      severity: scoreToLevel(droughtP90),
      confidence: parseFloat(seedRnd(s+23, 0.70, 0.87).toFixed(2)),
      drivers: ['VCI (anomalia storica)', 'ERA5 precipitazioni', 'NDMI', 'Bioma'],
    },
    {
      type: 'landslide', label: 'Frana',
      probability30d: clamp(landslideP30), probability90d: clamp(landslideP90),
      severity: scoreToLevel(landslideP90),
      confidence: parseFloat(seedRnd(s+24, 0.62, 0.80).toFixed(2)),
      drivers: ['Pendenza (DEM)', 'Precipitazioni cumulate', 'BREI', 'Litologia Corine'],
    },
    {
      type: 'heatwave', label: 'Ondata di calore',
      probability30d: clamp(heatP30), probability90d: clamp(heatP90),
      severity: scoreToLevel(heatP90),
      confidence: parseFloat(seedRnd(s+25, 0.74, 0.90).toFixed(2)),
      drivers: ['LST Landsat-8', 'NDBI', 'ERA5 temperatura', 'Urbanizzazione'],
    },
  ]

  return {
    modelVersion: 'GeoML-v2.1-EFFIS',
    biome: profile.biome,
    landUseCorine: profile.landUse,
    elevation: profile.elevation,
    slope: profile.slope,
    trainingData: 'EFFIS 2000-2023 + ERA5 + Corine LC 2018',
    specificRisks,
    overallConfidence: parseFloat(seedRnd(s+26, 0.70, 0.86).toFixed(2)),
  }
}

// ─── Parametri specifici per profilo polizza ──────────────────────────────

function generatePolicyParams(
  profile: PolicyProfile, periods: PeriodResult[], mlModel: MLRiskModel, composite: number
): PolicySpecificParams {
  const last = periods[periods.length - 1] || {} as PeriodResult
  const fire = mlModel.specificRisks.find(r => r.type === 'fire')
  const flood = mlModel.specificRisks.find(r => r.type === 'flood')
  const drought = mlModel.specificRisks.find(r => r.type === 'drought')
  const landslide = mlModel.specificRisks.find(r => r.type === 'landslide')

  const baseScore = composite
  const premiumBase = (baseScore - 50) * 0.4  // +/- % rispetto a premio standard

  if (profile === 'agricultural') {
    const cropTypes = ['Cereali (frumento, mais)', 'Vite (DOC/DOCG)', 'Olivo', 'Frutta a guscio', 'Foraggere']
    const cropType = cropTypes[Math.floor((last.ndvi || 0.4) * cropTypes.length) % cropTypes.length]
    const phenoStages = ['Semina / Germinazione', 'Crescita vegetativa', 'Fioritura', 'Maturazione', 'Raccolta', 'Riposo vegetativo']
    const phenologyStage = phenoStages[new Date().getMonth() % phenoStages.length]
    const irrigationRisk = pct((1 - (last.ndmi || 0.2)) * 80 + (drought?.probability90d || 20) * 0.3)
    const frostRisk = pct((1 - (last.lst || 15) / 40) * 60 + 10)
    const pestRisk = pct((last.vci || 50) < 40 ? 60 : 30)
    const yieldImpact = parseFloat(((irrigationRisk * 0.4 + pestRisk * 0.3 + frostRisk * 0.3) / 100 * 35).toFixed(1))
    return {
      profile, cropType, irrigationRisk: clamp(irrigationRisk), phenologyStage,
      frostRisk: clamp(frostRisk), pestRisk: clamp(pestRisk), yieldImpact,
      insuranceRelevantScore: baseScore,
      premiumAdjustment: parseFloat(premiumBase.toFixed(1)),
    }
  }

  if (profile === 'crop') {
    const cropType = 'Colture specializzate (orticole, floricole)'
    const irrigationRisk = pct((drought?.probability90d || 20) * 0.8 + (1 - (last.ndmi || 0.2)) * 40)
    const frostRisk = pct(Math.max(0, 30 - (last.lst || 15)) * 3)
    const pestRisk = pct(last.vci || 50)
    const yieldImpact = parseFloat(((irrigationRisk * 0.5 + pestRisk * 0.3 + frostRisk * 0.2) / 100 * 50).toFixed(1))
    return {
      profile, cropType, irrigationRisk: clamp(irrigationRisk), phenologyStage: 'Ciclo continuo',
      frostRisk: clamp(frostRisk), pestRisk: clamp(pestRisk), yieldImpact,
      insuranceRelevantScore: baseScore,
      premiumAdjustment: parseFloat((premiumBase * 1.2).toFixed(1)),
    }
  }

  if (profile === 'property') {
    const structuralRisk = pct((landslide?.probability90d || 10) * 0.6 + (flood?.probability90d || 10) * 0.4)
    const foundationRisk = pct((last.ndmi || 0.2) < 0 ? 60 : (landslide?.probability90d || 10) * 0.5 + 15)
    const floodZones = ['Fascia A (Elevato)', 'Fascia B (Medio)', 'Fascia C (Moderato)', 'Fuori fascia PAI']
    const floodZone = floodZones[Math.min(3, Math.floor((flood?.probability90d || 20) / 25))]
    const seismicZones = ['Zona 1 (alta sismicità)', 'Zona 2 (media)', 'Zona 3 (bassa)', 'Zona 4 (molto bassa)']
    const seismicZone = seismicZones[Math.floor((mlModel.elevation / 800) % 4)]
    return {
      profile, structuralRisk: clamp(structuralRisk), foundationRisk: clamp(foundationRisk),
      floodZone, seismicZone,
      insuranceRelevantScore: baseScore,
      premiumAdjustment: parseFloat((premiumBase * 0.9).toFixed(1)),
    }
  }

  // custom
  return {
    profile,
    insuranceRelevantScore: baseScore,
    premiumAdjustment: parseFloat(premiumBase.toFixed(1)),
  }
}

// ─── Raccomandazioni ───────────────────────────────────────────────────────

function generateRecommendations(
  categories: RiskCategory[], profile: AreaProfile, policyProfile: PolicyProfile,
  mlRisks: SpecificRisk[]
): string[] {
  const recs: string[] = []

  mlRisks.filter(r => r.probability90d > 40).forEach(r => {
    if (r.type === 'flood')     recs.push('Attivare piano di emergenza idrica: rischio alluvione elevato nei prossimi 90 giorni (modello GeoML-EFFIS).')
    if (r.type === 'fire')      recs.push('Sorveglianza antincendio prioritaria: probabilità incendio >40% nei prossimi 90gg. Creare fasce tagliafuoco.')
    if (r.type === 'drought')   recs.push('Rischio siccità significativo: implementare sistemi di irrigazione di riserva e monitoraggio VCI settimanale.')
    if (r.type === 'landslide') recs.push('Rischio frana rilevato: verificare stabilità dei versanti e installare sensori di movimento.')
    if (r.type === 'heatwave')  recs.push('Ondata di calore probabile: pianificare misure di raffreddamento per infrastrutture e colture.')
  })

  categories.filter(c => c.level === 'critico' || c.level === 'alto').forEach(cat => {
    if (cat.name.includes('Vegetazione') && policyProfile !== 'property')
      recs.push('Monitoraggio mensile NDVI/EVI tramite piattaforma Copernicus per rilevamento precoce stress vegetale.')
    if (cat.name.includes('Idrico'))
      recs.push('Installare sensori IoT per umidità del suolo integrati con dati ERA5 in tempo reale.')
    if (cat.name.includes('Incendio') && (profile.type === 'mediterranean' || profile.type === 'appenninica'))
      recs.push('Piano AIB (Antincendio Boschivo) obbligatorio: zona ad alta pericolosità secondo EFFIS.')
  })

  if (policyProfile === 'agricultural' || policyProfile === 'crop')
    recs.push('Considerare polizza multi-rischio agricola con parametri trigger basati su VCI e ERA5.')
  if (policyProfile === 'property')
    recs.push('Verifica conformità PAI (Piano di Assetto Idrogeologico) per la zona catastale identificata.')

  if (!recs.length)
    recs.push('Livelli di rischio nella norma. Mantenere monitoraggio semestrale con dati Sentinel-2.')

  recs.push('Aggiornare l\'analisi con dati satellitari reali Sentinel-2/Landsat-8 per pricing assicurativo di precisione.')
  return [...new Set(recs)].slice(0, 6)
}

// ─── Sommario ──────────────────────────────────────────────────────────────

function generateSummary(
  composite: number, level: RiskLevel, area: number,
  profile: AreaProfile, periods: PeriodResult[], policyProfile: PolicyProfile
): string {
  const areaLabel = area < 1 ? `${(area * 100).toFixed(1)} ha` : `${area.toFixed(2)} km²`
  const profileLabel: Record<string, string> = {
    alpine: 'territorio alpino', padana: 'pianura padana',
    appenninica: 'area appenninica', mediterranean: 'area mediterranea', mixed: 'territorio',
  }
  const policyLabel: Record<PolicyProfile, string> = {
    agricultural: 'agricola', property: 'immobiliare', crop: 'colture specializzate', custom: 'personalizzata',
  }
  const levelDesc: Record<RiskLevel, string> = {
    basso: 'Il territorio presenta condizioni generalmente favorevoli.',
    medio: 'Sono presenti alcune criticità che richiedono monitoraggio periodico.',
    alto: 'Il rischio complessivo è elevato e richiede azioni correttive urgenti.',
    critico: 'Situazione critica — raccomandato intervento immediato e revisione della polizza.',
  }
  return `Analisi multi-temporale su ${periods.length} periodi semestrali del ${profileLabel[profile.type] || 'territorio'} (${areaLabel}) — profilo polizza ${policyLabel[policyProfile]}. Rischio composito: ${composite}/100 (${level.toUpperCase()}). ${levelDesc[level]} Include indici Sentinel-2 (NDVI, EVI, SAVI, VCI, NDMI, NBR, NDBI), temperatura superficiale Landsat-8 (LST) e precipitazioni ERA5 Copernicus. Modello ML GeoML-v2.1 addestrato su dataset EFFIS 2000–2023 con uso del suolo Corine LC 2018 [DATI SIMULATI].`
}

// ─── Entry point ──────────────────────────────────────────────────────────

export async function runMockAnalysis(req: AnalysisRequest): Promise<AnalysisResult> {
  await new Promise(r => setTimeout(r, 2800 + Math.random() * 1200))

  const id = `gb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const profile = getAreaProfile(req.drawnArea.coordinates)
  const seed = req.drawnArea.coordinates.reduce((s, c) => s + c[0] + c[1], 0) * 1000
  const policyProfile: PolicyProfile = req.policyProfile || 'agricultural'

  const periods = generatePeriods(req.startDate, req.endDate, profile, seed)
  const indices = generateIndices(periods)
  const categories = generateCategories(periods)

  const avgComposite = pct(periods.reduce((s, p) => s + p.compositeRisk, 0) / (periods.length || 1))
  const compositeLevel = scoreToLevel(avgComposite)

  const mlModel = generateMLModel(periods, profile, avgComposite)
  const policyParams = generatePolicyParams(policyProfile, periods, mlModel, avgComposite)
  const summary = generateSummary(avgComposite, compositeLevel, req.drawnArea.area, profile, periods, policyProfile)
  const recommendations = generateRecommendations(categories, profile, policyProfile, mlModel.specificRisks)

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
    policyProfile,
    periods,
    indices,
    categories,
    specificRisks: mlModel.specificRisks,
    mlModel,
    policyParams,
    compositeScore: avgComposite,
    compositeLevel,
    summary,
    recommendations,
  }
}
