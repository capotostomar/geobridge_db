import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateApiKey, unauthorizedResponse, forbiddenResponse } from '@/lib/api-auth'
import { runMockAnalysis } from '@/lib/analysis-engine'

// POST /api/v1/analyses — crea una nuova analisi (API pubblica)
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req)
  if (!auth.valid) return unauthorizedResponse(auth.error || 'Unauthorized')
  if (auth.permissions !== 'write') return forbiddenResponse('Write permission required')

  try {
    const body = await req.json()
    const { title, coordinates, start_date, end_date, address, area_type, analysis_mode } = body

    if (!title || typeof title !== 'string')
      return NextResponse.json({ error: 'Validation error', message: '"title" is required' }, { status: 400 })

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3)
      return NextResponse.json({ error: 'Validation error', message: '"coordinates" requires at least 3 [lat,lon] points' }, { status: 400 })

    for (let i = 0; i < coordinates.length; i++) {
      const c = coordinates[i]
      if (!Array.isArray(c) || c.length !== 2 || typeof c[0] !== 'number' || typeof c[1] !== 'number')
        return NextResponse.json({ error: 'Validation error', message: `coordinates[${i}] must be [lat, lon]` }, { status: 400 })
      if (c[0] < -90 || c[0] > 90 || c[1] < -180 || c[1] > 180)
        return NextResponse.json({ error: 'Validation error', message: `coordinates[${i}] out of range` }, { status: 400 })
    }

    if (!start_date || !end_date)
      return NextResponse.json({ error: 'Validation error', message: '"start_date" and "end_date" are required (YYYY-MM-DD)' }, { status: 400 })

    const startD = new Date(start_date); const endD = new Date(end_date)
    if (isNaN(startD.getTime()) || isNaN(endD.getTime()))
      return NextResponse.json({ error: 'Validation error', message: 'Invalid date format' }, { status: 400 })
    if (startD >= endD)
      return NextResponse.json({ error: 'Validation error', message: 'start_date must be before end_date' }, { status: 400 })

    // Calcola area approssimativa
    const lats = coordinates.map((c: number[]) => c[0])
    const lons = coordinates.map((c: number[]) => c[1])
    const latSpan = (Math.max(...lats) - Math.min(...lats)) * 111
    const lonSpan = (Math.max(...lons) - Math.min(...lons)) * 111 * Math.cos((Math.max(...lats) + Math.min(...lats)) / 2 * Math.PI / 180)
    const areaKm2 = Math.round(latSpan * lonSpan * 100) / 100

    // Esegui analisi mock
    const result = await runMockAnalysis({
      title,
      address: address || undefined,
      drawnArea: {
        type: area_type || 'polygon',
        coordinates: coordinates.map((c: number[]) => [c[0], c[1]] as [number, number]),
        area: areaKm2,
      },
      startDate: start_date,
      endDate: end_date,
    })

    // Salva su Supabase
    const supabase = await createClient()
    const coordinates_json = JSON.stringify(result.coordinates)
    const geojson = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [result.coordinates.map(c => [c[1], c[0]])] },
      properties: { area_km2: result.area, area_type: result.areaType },
    }

    const { data, error } = await supabase
      .from('analyses')
      .insert({
        id: result.id,
        user_id: '00000000-0000-0000-0000-000000000000', // API user
        title: result.title,
        address: result.address ?? null,
        area_km2: result.area,
        area_type: result.areaType,
        area_geojson: geojson,
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
      .select()
      .single()

    if (error) console.error('[API v1] Supabase insert error:', error.message)

    // Salva anche i risultati
    if (data) {
      await supabase.from('analysis_results').insert({
        analysis_id: result.id,
        periods: result.periods,
        indices: result.indices,
        categories: result.categories,
        recommendations: result.recommendations,
      })
    }

    return NextResponse.json({ success: true, data: serializeV1(result as unknown as Record<string, unknown>) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/v1/analyses error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function serializeV1(r: Record<string, unknown>) {
  return {
    id: r.id,
    type: 'analysis',
    attributes: {
      title: r.title,
      address: r.address,
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


// DEBUG: logga lo stato delle credenziali
console.log('[DEBUG] COPERNICUS_ID:', process.env.COPERNICUS_CLIENT_ID?.slice(0,8) + '...')
console.log('[DEBUG] COPERNICUS_SECRET:', process.env.COPERNICUS_CLIENT_SECRET ? 'SET' : 'MISSING')
console.log('[DEBUG] SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
