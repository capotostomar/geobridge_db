export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
}

export interface Search {
  id: string
  user_id: string
  title: string
  description?: string
  address?: string
  latitude?: number
  longitude?: number
  area_geojson?: string
  filters?: string
  created_at: string
  updated_at: string
}

export interface BBox {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

export interface DrawnArea {
  type: 'polygon' | 'rectangle' | 'lasso'
  coordinates: [number, number][]
  area: number // in km²
}

// ─── Analisi di rischio ───────────────────────────────────────────────────

export type RiskLevel = 'basso' | 'medio' | 'alto' | 'critico'

export interface IndexResult {
  name: string        // es. "NDVI"
  fullName: string    // es. "Normalized Difference Vegetation Index"
  value: number       // -1 to 1
  description: string
  interpretation: string
  trend: 'stable' | 'improving' | 'degrading'
  trendValue: number  // delta rispetto al periodo precedente
}

export interface RiskCategory {
  name: string
  score: number       // 0-100
  level: RiskLevel
  description: string
  factors: string[]
}

export interface PeriodResult {
  period: string      // es. "2023-01 / 2023-06"
  date: string
  ndvi: number
  ndmi: number
  nbr: number
  ndbi: number
  brei: number
  dopi: number
  vegetationRisk: number
  waterRisk: number
  urbanRisk: number
  fireRisk: number
  compositeRisk: number
  riskLevel: RiskLevel
}

export interface AnalysisResult {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  title: string
  address?: string
  area: number        // km²
  areaType: string
  coordinates: [number, number][]
  startDate: string
  endDate: string
  createdAt: string
  completedAt?: string
  // Risultati
  periods: PeriodResult[]
  indices: IndexResult[]
  categories: RiskCategory[]
  compositeScore: number
  compositeLevel: RiskLevel
  summary: string
  recommendations: string[]
}

export interface AnalysisRequest {
  title: string
  address?: string
  drawnArea: DrawnArea
  startDate: string
  endDate: string
}
