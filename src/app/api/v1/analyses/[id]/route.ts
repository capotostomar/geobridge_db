import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(req)
  if (!auth.valid) return unauthorizedResponse(auth.error || 'Unauthorized')

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    const supabase = await createClient()

    // Query SOLO su analyses — stessa tabella che funziona nella GET lista
    // Senza join su analysis_results che potrebbe non esistere
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('id', id)
      .limit(1)

    if (error) {
      return NextResponse.json({
        error: 'Not found',
        message: `Analysis "${id}" not found.`,
        debug: error.message,
        debug_code: error.code,
      }, { status: 404 })
    }

    // .limit(1) restituisce array — prende il primo elemento
    const row = Array.isArray(data) ? data[0] : data

    if (!row) {
      return NextResponse.json({
        error: 'Not found',
        message: `Analysis "${id}" not found.`,
      }, { status: 404 })
    }

    // Ricostruisce le coordinate dalla geometria GeoJSON se presente
    const coords: [number, number][] = (() => {
      try {
        const geom = row.area_geojson?.geometry
        if (geom?.type === 'Polygon') {
          return (geom.coordinates[0] as number[][]).map(c => [c[1], c[0]] as [number, number])
        }
        return []
      } catch { return [] }
    })()

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        type: 'analysis',
        attributes: {
          title: row.title,
          address: row.address ?? null,
          area_km2: row.area_km2,
          area_type: row.area_type,
          coordinates: coords,
          start_date: row.start_date,
          end_date: row.end_date,
          status: row.status,
          composite_score: row.composite_score,
          composite_level: row.composite_level,
          summary: row.summary,
          // Dati dettagliati se salvati in metadata
          periods: row.metadata?.periods ?? [],
          indices: row.metadata?.indices ?? [],
          categories: row.metadata?.categories ?? [],
          recommendations: row.metadata?.recommendations ?? [],
        },
        meta: {
          created_at: row.created_at,
          completed_at: row.completed_at,
          source: row.metadata?.source ?? 'app',
        },
      },
    })
  } catch (err) {
    console.error('GET /api/v1/analyses/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
