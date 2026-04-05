/**
 * GeoBridge API — Auto-generated TypeScript SDK
 * Generated from OpenAPI 3.0 specification
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type RiskLevel = 'basso' | 'medio' | 'alto' | 'critico'

export interface SpectralIndex {
  value: number
  full_name: string
  description: string
}

export interface RiskScore {
  score: number
  level: RiskLevel
}

export interface SpectralIndices {
  NDVI: SpectralIndex
  NDMI: SpectralIndex
  NBR: SpectralIndex
  NDBI: SpectralIndex
  BREI: SpectralIndex
  DOPI: SpectralIndex
}

export interface RiskScores {
  vegetation: RiskScore
  water: RiskScore
  urban: RiskScore
  fire: RiskScore
  composite: RiskScore
}

export interface PointIndicesAttributes {
  latitude: number
  longitude: number
  date: string
  profile: 'alpine' | 'padana' | 'appenninica' | 'mediterranean'
  season: 'summer' | 'winter'
  indices: SpectralIndices
  risk_scores: RiskScores
}

export interface PointIndicesData {
  type: 'point_indices'
  attributes: PointIndicesAttributes
}

export interface PointIndicesResponse {
  success: boolean
  data: PointIndicesData
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
  vegetationRisk: number
  waterRisk: number
  urbanRisk: number
  fireRisk: number
  compositeRisk: number
  riskLevel: RiskLevel
}

export interface IndexResult {
  name: string
  fullName: string
  value: number
  description: string
  interpretation: string
  trend: 'stable' | 'improving' | 'degrading'
  trendValue: number
}

export interface RiskCategory {
  name: string
  score: number
  level: RiskLevel
  description: string
  factors: string[]
}

export interface AnalysisAttributes {
  title: string
  address: string | null
  area_km2: number
  area_type: string
  coordinates: number[][]
  start_date: string
  end_date: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  analysis_mode: string
  composite_score: number
  composite_level: RiskLevel
  summary: string
  periods: PeriodResult[]
  indices: IndexResult[]
  categories: RiskCategory[]
  recommendations: string[]
}

export interface AnalysisData {
  id: string
  type: 'analysis'
  attributes: AnalysisAttributes
  meta: {
    created_at: string
    completed_at: string | null
  }
}

export interface AnalysisResponse {
  success: boolean
  data: AnalysisData
}

export interface CreateAnalysisRequest {
  title: string
  coordinates: number[][]
  start_date: string
  end_date: string
  address?: string
  area_type?: 'polygon' | 'rectangle'
  analysis_mode?: 'snapshot' | 'timeseries'
}

export interface ErrorResponse {
  error: string
  message: string
}

// ─── WebSocket events ─────────────────────────────────────────────────────

export interface StreamProgressEvent {
  step: number
  total: number
  message: string
  data: Record<string, unknown> | null
}

export interface StreamCompleteEvent {
  id: string
  title: string
  address: string | null
  area_km2: number
  area_type: string
  coordinates: number[][]
  start_date: string
  end_date: string
  status: 'completed'
  composite_score: number
  composite_level: RiskLevel
  summary: string
  periods: PeriodResult[]
  indices: IndexResult[]
  categories: RiskCategory[]
  recommendations: string[]
  created_at: string
  completed_at: string
}

export interface StreamErrorEvent {
  error: string
}

// ─── Client ────────────────────────────────────────────────────────────────

export interface GeoBridgeClientConfig {
  baseUrl?: string
  apiKey: string
  streamUrl?: string
}

export class GeoBridgeClient {
  private baseUrl: string
  private apiKey: string
  private streamUrl: string

  constructor(config: GeoBridgeClientConfig) {
    this.baseUrl = config.baseUrl || '/api/v1'
    this.apiKey = config.apiKey
    this.streamUrl = config.streamUrl || '/?XTransformPort=3004'
  }

  private headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    }
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers(), ...options?.headers },
    })

    const body = await res.json()

    if (!res.ok) {
      const err = body as ErrorResponse
      throw new GeoBridgeApiError(res.status, err.error, err.message)
    }

    return body as T
  }

  /**
   * POST /api/v1/analyses — Create a new analysis
   */
  async createAnalysis(req: CreateAnalysisRequest): Promise<AnalysisResponse> {
    return this.request<AnalysisResponse>('/analyses', {
      method: 'POST',
      body: JSON.stringify(req),
    })
  }

  /**
   * GET /api/v1/analyses/{id} — Retrieve analysis results
   */
  async getAnalysis(id: string): Promise<AnalysisResponse> {
    return this.request<AnalysisResponse>(`/analyses/${encodeURIComponent(id)}`)
  }

  /**
   * GET /api/v1/indices/{lat}/{lon}?date=YYYY-MM-DD — Point indices
   */
  async getPointIndices(lat: number, lon: number, date?: string): Promise<PointIndicesResponse> {
    let path = `/indices/${lat}/${lon}`
    if (date) path += `?date=${encodeURIComponent(date)}`
    return this.request<PointIndicesResponse>(path)
  }

  /**
   * WebSocket: Subscribe to analysis streaming
   * Returns an object with event handlers and disconnect function
   */
  async streamAnalysis(
    analysisId: string,
    handlers: {
      onProgress?: (event: StreamProgressEvent) => void
      onComplete?: (event: StreamCompleteEvent) => void
      onError?: (event: StreamErrorEvent) => void
    }
  ): Promise<{ disconnect: () => void }> {
    // WebSocket streaming — requires socket.io-client in the consumer app
    // Stub implementation: poll the REST API as fallback
    console.warn('[GeoBridge SDK] streamAnalysis: socket.io-client not bundled. Using polling fallback.')
    let active = true
    const poll = setInterval(async () => {
      try {
        const res = await this.getAnalysis(analysisId)
        if (res.data.attributes.status === 'completed') {
          handlers.onComplete?.({ id: res.data.id, ...res.data.attributes } as unknown as StreamCompleteEvent)
          clearInterval(poll)
        }
      } catch { /* ignore */ }
    }, 2000)
    return {
      disconnect: () => {
        active = false
        clearInterval(poll)
      /* stub — was: socket.disconnect()*/
      },
    }
  }
}

export class GeoBridgeApiError extends Error {
  constructor(
    public status: number,
    public error: string,
    public message: string
  ) {
    super(`${error}: ${message}`)
    this.name = 'GeoBridgeApiError'
  }
}

// ─── Export all types ──────────────────────────────────────────────────────

export type {
  SpectralIndex as SpectralIndexType,
  RiskScore as RiskScoreType,
  SpectralIndices as SpectralIndicesType,
  RiskScores as RiskScoresType,
}
