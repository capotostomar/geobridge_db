export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateApiKey, unauthorizedResponse, forbiddenResponse } from '@/lib/api-auth'
import { runRealAnalysis } from '@/lib/analysis-engine'

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

// ─── GET /api/v1/analyses — lista tutte le analisi dell'utente ────────────
export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req)
  if (!auth.valid) return unauthorizedResponse(auth.error || 'Unauthorized')

  const url = new URL(req.url)
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '50'), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  try {
    const supabase = await createClient()

    let query = supabase
      .from('analyses')
      .select('id, title, address, area_km2, area_type, start_date, end_date, status, composite_score, composite_level, summary, created_at, completed_at, metadata', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Filtra per user_id se disponibile dalla API key
    if (auth.userId) query = query.eq('user_id', auth.userId)

    const { data, error, count } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data: (data ?? []).map((row: Record<string, unknown>) => ({
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST /api/v1/analyses — crea una nuova analisi ──────────────────────
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req)
  if (!auth.valid) return unauthorizedResponse(auth.error || 'Unauthorized')
  if (auth.permissions !== 'write') return forbiddenResponse('Write permission required')

  try {
    const body = await req.json()
    const { title, coordinates, start_date, end_date, address, area_type, analysis_mode, use_mock } = body

    if (!title || typeof title !== 'string')
      return NextResponse.json({ error: 'Validation error', message: '"title" is required' }, { status: 400 })
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3)
      return NextResponse.json({ error: 'Validation error', message: '"coordinates" requires at least 3 [lat,lon] points' }, { status: 400 })
    for (let i = 0; i < coordinates.length; i++) {
      const c = coordinates[i]
      if (!Array.isArray(c) || c.length !== 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number')
        return NextResponse.json({ error: 'Validation error', message: `coordinates[${i}] must be [lat, lon]` }, { status: 400 })
    }
    if (!start_date || !end_date)
      return NextResponse.json({ error: 'Validation error', message: '"start_date" and "end_date" are required (YYYY-MM-DD)' }, { status: 400 })
    const startD = new Date(start_date); const endD = new Date(end_date)
    if (isNaN(startD.getTime()) || isNaN(endD.getTime()))
      return NextResponse.json({ error: 'Validation error', message: 'Invalid date format' }, { status: 400 })
    if (startD >= endD)
      return NextResponse.json({ error: 'Validation error', message: 'start_date must be before end_date' }, { status: 400 })

    const lats = coordinates.map((c: number[]) => c[0])
    const lons = coordinates.map((c: number[]) => c[1])
    const latSpan = (Math.max(...lats) - Math.min(...lats)) * 111
    const lonSpan = (Math.max(...lons) - Math.min(...lons)) * 111 * Math.cos((Math.max(...lats) + Math.min(...lats)) / 2 * Math.PI / 180)
    const areaKm2 = Math.round(latSpan * lonSpan * 100) / 100

    const result = await runRealAnalysis({
      title,
      address: address || undefined,
      drawnArea: {
        type: area_type || 'polygon',
        coordinates: coordinates.map((c: number[]) => [c[0], c[1]] as [number, number]),
        area: areaKm2,
      },
      startDate: start_date,
      endDate: end_date,
      useMock: use_mock === true,
    })

    // Salva su Supabase
    const supabase = await createClient()
    const coords = result.coordinates.map(c => [c[1], c[0]])
    if (coords.length > 0) {
      const f = coords[0]; const l = coords[coords.length - 1]
      if (f[0] !== l[0] || f[1] !== l[1]) coords.push(f)
    }

    const { error } = await supabase.from('analyses').insert({
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
      metadata: { analysisMode: analysis_mode || 'timeseries', source: 'api_v1' },
      created_at: result.createdAt,
      completed_at: result.completedAt,
    })

    if (error) console.error('[API v1 POST] Supabase insert error:', error.message)
    else {
      await supabase.from('analysis_results').insert({
        analysis_id: result.id,
        periods: result.periods,
        indices: result.indices,
        categories: result.categories,
        recommendations: result.recommendations,
      })
    }

    return NextResponse.json({ success: true, data: serialize(result as unknown as Record<string, unknown>) }, { status: 201 })
  } catch (err) {
    console.error('POST /api/v1/analyses error:', err)
    return NextResponse.json({ error: 'Internal server error', message: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
