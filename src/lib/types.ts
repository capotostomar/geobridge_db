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
  type: 'polygon' | 'rectangle'
  coordinates: [number, number][]
  area: number // in km²
}

export interface AnalysisResult {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  risk_score?: number
  results?: {
    period: string
    vegetation_risk: number
    water_risk: number
    urban_risk: number
    composite_risk: number
  }[]
}
