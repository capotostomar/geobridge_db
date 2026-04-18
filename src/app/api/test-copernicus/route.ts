// cache-bust: v4
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET() {
  const results: Record<string, unknown> = {}

  const clientId = process.env.COPERNICUS_CLIENT_ID
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET

  results.credentials = {
    COPERNICUS_CLIENT_ID: clientId ? `✅ presente (${clientId.slice(0, 8)}...)` : '❌ MANCANTE',
    COPERNICUS_CLIENT_SECRET: clientSecret ? `✅ presente (${clientSecret.slice(0, 4)}...)` : '❌ MANCANTE',
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json({ ...results, error: 'Credenziali mancanti' }, { status: 400 })
  }

  // Token
  let token: string
  try {
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
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      results.token = { status: '❌ FALLITO', detail: tokenData }
      return NextResponse.json(results, { status: 502 })
    }
    token = tokenData.access_token
    results.token = { status: '✅ OK', expires_in: tokenData.expires_in }
  } catch (e: unknown) {
    results.token = { status: '❌ ERRORE RETE', detail: e instanceof Error ? e.message : String(e) }
    return NextResponse.json(results, { status: 502 })
  }

  // Evalscript — bands:1, NO dataMask nell'output
  const evalscript = '//VERSION=3\nfunction setup() {\n  return {\n    input: [{ bands: ["B04", "B08", "dataMask"], units: "DN" }],\n    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]\n  };\n}\nfunction evaluatePixel(s) {\n  if (s.dataMask === 0) return [NaN];\n  var d = s.B08 + s.B04;\n  return [d === 0 ? 0 : (s.B08 - s.B04) / d];\n}'

  // Mostra l'evalscript esatto che mandiamo
  results.evalscript_sent = evalscript

  const payload = {
    input: {
      bounds: {
        bbox: [12.48, 41.89, 12.51, 41.91],
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [{
        dataFilter: {
          timeRange: { from: '2024-06-01T00:00:00Z', to: '2024-06-30T23:59:59Z' },
          maxCloudCoverage: 80,
        },
        type: 'sentinel-2-l2a',
      }],
    },
    aggregation: {
      timeRange: { from: '2024-06-01T00:00:00Z', to: '2024-06-30T23:59:59Z' },
      aggregationInterval: { of: 'P10D' },
      evalscript,
      width: 256,
      height: 256,
    },
    calculations: { default: { statistics: { default: {} } } },
  }

  // Mostra il payload completo che mandiamo
  results.payload_sent = payload

  const shRes = await fetch('https://sh.dataspace.copernicus.eu/api/v1/statistics', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const shData = await shRes.json()
  results.sh_status = shRes.status
  results.sh_response = shData

  if (!shRes.ok) {
    results.statistics = { status: '❌ FALLITO', httpStatus: shRes.status, error: shData }
    return NextResponse.json(results, { status: shRes.status })
  }

  const ndviValues = (shData.data ?? []).map((item: any) => ({
    date: item.interval?.from?.slice(0, 10),
    ndvi_mean: item.outputs?.default?.bands?.B0?.stats?.mean?.toFixed(4) ?? 'no-data',
    sample_count: item.outputs?.default?.bands?.B0?.stats?.sampleCount ?? 0,
  }))

  results.statistics = { status: '✅ OK', ndvi_values: ndviValues }
  results.summary = '✅ Copernicus funziona'
  return NextResponse.json(results, { status: 200 })
}
