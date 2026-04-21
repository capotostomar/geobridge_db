// src/app/api/v1/analyses/route.ts
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
// ✅ IMPORTANTE: Usa il client standard di Supabase per bypassare la RLS
import { createClient } from '@supabase/supabase-js' 
import { validateApiKey, unauthorizedResponse, forbiddenResponse } from '@/lib/api-auth'
import { runRealAnalysis } from '@/lib/analysis-engine'
import { 
  CreateAnalysisRequestSchema, 
  AnalysisResponseSchema 
} from '@/lib/api-docs/openapi'

// ─── Helper per creare un client Admin (bypassa RLS) ──────────────────────
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Chiave con permessi completi
  )
}

// ─── Serializza in formato JSON:API ───────────────────────────────────────
function serialize(r: Record<string, unknown>) {
  return {
    id: r.id,
    type: 'analysis',
    attributes: {
      title: r.title,
      address: r.address ?? null,
      area_km2: r.area,
      area_type: r.areaType,
      coordinates: r.coordinates,
      start_date: r.startDate,
      end_date: r.endDate,
      status: r.status,
      composite_score: r.compositeScore,
      composite_level: r.compositeLevel,
      summary: r.summary,
      periods: r.periods,
      indices: r.indices,
      categories: r.categories,
      recommendations: r.recommendations,
    },
    meta: { created_at: r.createdAt, completed_at: r.completedAt },
  }
}

// ─── GET /api/v1/analyses — lista tutte le analisi ───────────────────────
export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req)
  if (!auth.valid) return unauthorizedResponse(auth.error || 'Unauthorized')

  const url = new URL(req.url)
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '50'), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  try {
    // ✅ Usa il client Admin per bypassare la RLS di Supabase
    const supabase = getAdminClient()

    let query = supabase
      .from('analyses')
      .select('id, title, address, area_km2, area_type, start_date, end_date, status, composite_score, composite_level, summary, created_at, completed_at, metadata', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // ✅ LA SICUREZZA È QUI: Filtriamo manualmente per user_id
    // Anche se il DB ci darebbe tutto, noi mostriamo solo ciò che spetta all'utente della API Key
    if (auth.userId) {
      query = query.eq('user_id', auth.userId)
    }

    const { data, error, count } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
       (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        type: 'analysis',
        attributes: {
          title: row.title,
          address: row.address ?? null,
          area_km2: row.area_km2,
          area_type: row.area_type,
          start_date: row.start_date,
          end_date: row.end_date,
          status: row.status,
          composite_score: row.composite_score,
          composite_level: row.composite_level,
          summary: row.summary,
        },
        meta: { created_at: row.created_at, completed_at: row.completed_at },
      })),
      meta: {
        total: count ?? 0,
        limit,
        offset,
        returned: (data ?? []).length,
      },
    })
  } catch (err) {
    console.error('GET /api/v1/analyses error:', err)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: err instanceof Error ? err.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// ─── POST /api/v1/analyses — crea una nuova analisi ──────────────────────
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req)
  if (!auth.valid) return unauthorizedResponse(auth.error || 'Unauthorized')
  if (auth.permissions !== 'write') return forbiddenResponse('Write permission required')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }

  const validation = CreateAnalysisRequestSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { 
        error: 'Validation error', 
        message: 'Request body does not match expected schema',
        details: validation.error.flatten()
      },
      { status: 400 }
    )
  }

  const { title, coordinates, start_date, end_date, address, area_type, analysis_mode, use_mock } = validation.data

  try {
    const lats = coordinates.map((c: [number, number]) => c[0])
    const lons = coordinates.map((c: [number, number]) => c[1])
    const latSpan = (Math.max(...lats) - Math.min(...lats)) * 111
    const lonSpan = (Math.max(...lons) - Math.min(...lons)) * 111 * Math.cos(
      (Math.max(...lats) + Math.min(...lats)) / 2 * Math.PI / 180
    )
    const areaKm2 = Math.round(latSpan * lonSpan * 100) / 100

    const result = await runRealAnalysis({
      title,
      address: address || undefined,
      drawnArea: {
        type: area_type || 'polygon',
        coordinates: coordinates.map((c) => [c[0], c[1]] as [number, number]),
        area: areaKm2,
      },
      startDate: start_date,
      endDate: end_date,
      useMock: use_mock === true,
    })

    // ✅ Usa il client Admin anche per scrivere
    const supabase = getAdminClient()
    
    const coords = result.coordinates.map((c: [number, number]) => [c[1], c[0]])
    if (coords.length > 0) {
      const first = coords[0]
      const last = coords[coords.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first)
    }

    const { error: insertError } = await supabase.from('analyses').insert({
      id: result.id,
      user_id: auth.userId ?? '00000000-0000-0000-0000-000000000000',
      title: result.title,
      address: result.address ?? null,
      area_km2: result.area,
      area_type: result.areaType,
      area_geojson: {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: { area_km2: result.area, area_type: result.areaType },
      },
      start_date,
      end_date,
      status: 'completed',
      composite_score: result.compositeScore,
      composite_level: result.compositeLevel,
      summary: result.summary,
      meta { analysisMode: analysis_mode || 'timeseries', source: 'api_v1' },
      created_at: result.createdAt,
      completed_at: result.completedAt,
    })

    if (insertError) {
      console.error('[API v1 POST] Supabase insert error:', insertError.message)
    } else {
      await supabase.from('analysis_results').insert({
        analysis_id: result.id,
        periods: result.periods,
        indices: result.indices,
        categories: result.categories,
        recommendations: result.recommendations,
      })
    }

    return NextResponse.json(
      { success: true,  serialize(result as unknown as Record<string, unknown>) },
      { status: 201 }
    )

  } catch (err) {
    console.error('POST /api/v1/analyses error:', err)
    return NextResponse.json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
