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

    let query = supabase
      .from('analyses')
      .select(`*, analysis_results ( periods, indices, categories, recommendations, specific_risks, ml_model, policy_params )`)
      .eq('id', id)

    if (auth.userId) query = query.eq('user_id', auth.userId)

    const { data, error } = await query.single()

    if (error || !data) {
      return NextResponse.json({
        error: 'Not found',
        message: `Analysis "${id}" not found.`,
      }, { status: 404 })
    }

    const res = (data.analysis_results as any[])?.[0] ?? {}
    // Ricostruisce le coordinate dalla geometria GeoJSON
    const coords: [number, number][] = (() => {
      try {
        const geom = data.area_geojson?.geometry
        if (geom?.type === 'Polygon') {
          return (geom.coordinates[0] as number[][]).map(c => [c[1], c[0]] as [number, number])
        }
        return []
      } catch { return [] }
    })()

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        type: 'analysis',
        attributes: {
          title: data.title,
          address: data.address ?? null,
          area_km2: data.area_km2,
          area_type: data.area_type,
          coordinates: coords,
          start_date: data.start_date,
          end_date: data.end_date,
          status: data.status,
          composite_score: data.composite_score,
          composite_level: data.composite_level,
          summary: data.summary,
          periods: res.periods ?? [],
          indices: res.indices ?? [],
          categories: res.categories ?? [],
          specific_risks: res.specific_risks ?? [],
          ml_model: res.ml_model ?? null,
          policy_params: res.policy_params ?? null,
          recommendations: res.recommendations ?? [],
        },
        meta: {
          created_at: data.created_at,
          completed_at: data.completed_at,
          source: data.metadata?.source ?? 'app',
        },
      },
    })
  } catch (err) {
    console.error('GET /api/v1/analyses/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
