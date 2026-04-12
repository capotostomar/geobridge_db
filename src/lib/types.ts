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
export type PolicyProfile = 'agricultural' | 'property' | 'crop' | 'custom'

export interface IndexResult {
  name: string
  fullName: string
  value: number
  unit?: string
  description: string
  interpretation: string
  trend: 'stable' | 'improving' | 'degrading'
  trendValue: number
  source?: string
}

export interface RiskCategory {
  name: string
  score: number
  level: RiskLevel
  description: string
  factors: string[]
}

export interface SpecificRisk {
  type: 'flood' | 'landslide' | 'fire' | 'drought' | 'earthquake' | 'heatwave' | 'frost' | 'pest'
  label: string
  probability30d: number
  probability90d: number
  severity: RiskLevel
  confidence: number
  drivers: string[]
}

export interface MLRiskModel {
  modelVersion: string
  biome: string
  landUseCorine: string
  elevation: number
  slope: number
  trainingData: string
  specificRisks: SpecificRisk[]
  overallConfidence: number
}

export interface PolicySpecificParams {
  profile: PolicyProfile
  cropType?: string
  irrigationRisk?: number
  phenologyStage?: string
  frostRisk?: number
  pestRisk?: number
  yieldImpact?: number
  structuralRisk?: number
  foundationRisk?: number
  floodZone?: string
  seismicZone?: string
  insuranceRelevantScore: number
  premiumAdjustment: number
}

export interface PeriodResult {
  period: string
  date: string
  ndvi: number
  ndmi: number
  nbr: number
  ndbi: number
  brei: number
  dopi: number
  evi: number
  savi: number
  vci: number
  lst: number
  precipitation: number
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
  area: number
  areaType: string
  coordinates: [number, number][]
  startDate: string
  endDate: string
  createdAt: string
  completedAt?: string
  policyProfile: PolicyProfile
  periods: PeriodResult[]
  indices: IndexResult[]
  categories: RiskCategory[]
  specificRisks: SpecificRisk[]
  mlModel: MLRiskModel
  policyParams: PolicySpecificParams
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
  policyProfile?: PolicyProfile
}
