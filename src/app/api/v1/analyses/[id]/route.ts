import { NextRequest, NextResponse } from 'next/server'
import { loadAnalysisById } from '@/lib/analysis-store'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(req)
  if (!auth.valid) return unauthorizedResponse(auth.error || 'Unauthorized')

  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const analysis = await loadAnalysisById(id)
    if (!analysis) return NextResponse.json({ error: 'Not found', message: `Analysis "${id}" not found` }, { status: 404 })

    return NextResponse.json({
      success: true,
      data: {
        id: analysis.id,
        type: 'analysis',
        attributes: {
          title: analysis.title,
          address: analysis.address,
          area_km2: analysis.area,
          area_type: analysis.areaType,
          coordinates: analysis.coordinates,
          start_date: analysis.startDate,
          end_date: analysis.endDate,
          status: analysis.status,
          composite_score: analysis.compositeScore,
          composite_level: analysis.compositeLevel,
          summary: analysis.summary,
          periods: analysis.periods,
          indices: analysis.indices,
          categories: analysis.categories,
          recommendations: analysis.recommendations,
        },
        meta: { created_at: analysis.createdAt, completed_at: analysis.completedAt },
      },
    })
  } catch (error) {
    console.error('GET /api/v1/analyses/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
