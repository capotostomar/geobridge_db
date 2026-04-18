import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // 1️⃣ Verifica credenziali
    const clientId = process.env.COPERNICUS_CLIENT_ID
    const clientSecret = process.env.COPERNICUS_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, error: 'COPERNICUS credentials missing' },
        { status: 500 }
      )
    }

    // 2️⃣ Ottieni token OAuth
    const tokenRes = await fetch(
      'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      }
    )

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new Error(`Token fetch failed: ${tokenRes.status} ${err}`)
    }

    const { access_token } = await tokenRes.json()

    // 3️⃣ Payload identico a quello che ha funzionato con curl
    const payload = {
      input: {
        bounds: {
          bbox: [12.5, 41.9, 12.6, 42.0],
          properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
        },
        data: [
          {
            dataFilter: {
              timeRange: { from: '2025-01-01T00:00:00Z', to: '2025-01-31T23:59:59Z' },
              maxCloudCoverage: 40,
            },
            type: 'sentinel-2-l2a',
          },
        ],
      },
      aggregation: {
        timeRange: { from: '2025-01-01T00:00:00Z', to: '2025-01-31T23:59:59Z' },
        aggregationInterval: { of: 'P10D' },
        // ⚠️ NOTA: gli \n qui sono gestiti correttamente da Next.js (non da Hoppscotch)
        evalscript:
          '//VERSION=3\nfunction setup(){return{input:["B04","B08","dataMask"],output:{bands:2}}}\nfunction evaluatePixel(s){let ndvi=(s.B08-s.B04)/(s.B08+s.B04+1e-10);return[ndvi,s.dataMask]}',
        width: 100,
        height: 100,
      },
      calculations: {
        default: { statistics: { default: {} } },
      },
    }

    // 4️⃣ Chiama Sentinel Hub Statistical API
    const statsRes = await fetch('https://sh.dataspace.copernicus.eu/api/v1/statistics', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!statsRes.ok) {
      const err = await statsRes.text()
      throw new Error(`Sentinel Hub API error: ${statsRes.status} ${err}`)
    }

    const statsData = await statsRes.json()

    return NextResponse.json({
      success: true,
      message: '✅ Copernicus API call successful from Vercel!',
      data: statsData,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[TEST_COPERNICUS] ❌ Failed:', error.message)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
