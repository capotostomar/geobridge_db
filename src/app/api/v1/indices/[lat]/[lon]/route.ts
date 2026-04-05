import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'

// GET /api/v1/indices/[lat]/[lon]?date=YYYY-MM-DD — point indices lookup
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lat: string; lon: string }> }
) {
  const auth = await validateApiKey(req)
  if (!auth.valid) return unauthorizedResponse(auth.error || 'Unauthorized')

  try {
    const { lat: latStr, lon: lonStr } = await params
    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('date') || new Date().toISOString().slice(0, 10)

    const lat = parseFloat(latStr)
    const lon = parseFloat(lonStr)

    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json(
        { error: 'Validation error', message: 'lat and lon must be valid numbers' },
        { status: 400 }
      )
    }

    if (lat < -90 || lat > 90) {
      return NextResponse.json(
        { error: 'Validation error', message: 'latitude must be between -90 and 90' },
        { status: 400 }
      )
    }

    if (lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: 'Validation error', message: 'longitude must be between -180 and 180' },
        { status: 400 }
      )
    }

    const date = new Date(dateStr)
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: 'Validation error', message: 'date must be a valid YYYY-MM-DD string' },
        { status: 400 }
      )
    }

    const month = date.getMonth() + 1
    const isSummer = month >= 5 && month <= 10

    // Generate mock indices based on geographic profile
    let profileType: string
    if (lat > 45) profileType = 'alpine'
    else if (lat > 43) profileType = 'padana'
    else if (lat > 40) profileType = 'appenninica'
    else profileType = 'mediterranean'

    const seed = Math.abs(lat * 1000 + lon * 777 + date.getFullYear() * 31 + month * 13)
    const x = Math.sin(seed) * 10000
    const r = x - Math.floor(x)

    function idxRand(min: number, max: number, offset: number) {
      const sx = Math.sin(seed + offset) * 10000
      const sr = sx - Math.floor(sx)
      return parseFloat((sr * (max - min) + min).toFixed(4))
    }

    const ndvi = idxRand(
      profileType === 'alpine' ? (isSummer ? 0.55 : 0.10) : profileType === 'padana' ? (isSummer ? 0.50 : 0.20) : profileType === 'mediterranean' ? (isSummer ? 0.20 : 0.30) : (isSummer ? 0.40 : 0.15),
      profileType === 'alpine' ? (isSummer ? 0.80 : 0.35) : profileType === 'padana' ? (isSummer ? 0.75 : 0.45) : profileType === 'mediterranean' ? (isSummer ? 0.45 : 0.55) : (isSummer ? 0.65 : 0.40),
      1
    )
    const ndmi = idxRand(-0.10, 0.55, 2)
    const nbr = idxRand(0.20, 0.70, 3)
    const ndbi = idxRand(-0.25, 0.35, 4)
    const brei = idxRand(0.05, 0.35, 5)
    const dopi = idxRand(-0.10, 0.30, 6)

    const vegetationRisk = Math.min(100, Math.round(Math.max(0, (0.7 - ndvi) / 0.7) * 100))
    const waterRisk = Math.min(100, Math.round(Math.max(0, (0.4 - ndmi) / 0.7) * 80))
    const urbanRisk = Math.min(100, Math.round(Math.max(0, ndbi * 100 + 20)))
    const fireRisk = Math.min(100, Math.round(Math.max(0, ((0.6 - nbr) + (0.6 - ndvi)) / 1.2 * 100 * (isSummer ? 1.3 : 0.6))))
    const compositeRisk = Math.min(100, Math.round(vegetationRisk * 0.30 + waterRisk * 0.25 + urbanRisk * 0.20 + fireRisk * 0.25))

    function scoreToLevel(s: number): string {
      if (s < 25) return 'basso'
      if (s < 50) return 'medio'
      if (s < 75) return 'alto'
      return 'critico'
    }

    return NextResponse.json({
      success: true,
      data: {
        type: 'point_indices',
        attributes: {
          latitude: lat,
          longitude: lon,
          date: dateStr,
          profile: profileType,
          season: isSummer ? 'summer' : 'winter',
          indices: {
            NDVI: { value: ndvi, full_name: 'Normalized Difference Vegetation Index', description: 'Vigor vegetale' },
            NDMI: { value: ndmi, full_name: 'Normalized Difference Moisture Index', description: 'Umidità del suolo/canopy' },
            NBR: { value: nbr, full_name: 'Normalized Burn Ratio', description: 'Rischio/incidenza incendi' },
            NDBI: { value: ndbi, full_name: 'Normalized Difference Built-up Index', description: 'Urbanizzazione/suolo artificiale' },
            BREI: { value: brei, full_name: 'Bare Soil Exposure Index', description: 'Suolo nudo/esposizione' },
            DOPI: { value: dopi, full_name: 'Degree of Primary Productivity Index', description: 'Produttività primaria' },
          },
          risk_scores: {
            vegetation: { score: vegetationRisk, level: scoreToLevel(vegetationRisk) },
            water: { score: waterRisk, level: scoreToLevel(waterRisk) },
            urban: { score: urbanRisk, level: scoreToLevel(urbanRisk) },
            fire: { score: fireRisk, level: scoreToLevel(fireRisk) },
            composite: { score: compositeRisk, level: scoreToLevel(compositeRisk) },
          },
        },
      },
    })
  } catch (error) {
    console.error('GET /api/v1/indices error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
