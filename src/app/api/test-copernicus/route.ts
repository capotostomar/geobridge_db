// v8 - payload minimo assoluto da documentazione SH
import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET() {
  const results: Record<string, unknown> = {}

  const clientId = process.env.COPERNICUS_CLIENT_ID
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Credenziali mancanti' }, { status: 400 })
  }

  // Token
  let token: string
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
    return NextResponse.json({ token: 'FALLITO', detail: tokenData }, { status: 502 })
  }
  token = tokenData.access_token
  results.token = 'OK'

  // Payload esatto dalla documentazione ufficiale Sentinel Hub
  // https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html
  const body = {
    "input": {
      "bounds": {
        "properties": { "crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84" },
        "bbox": [12.44693, 41.870072, 12.541001, 41.917096]
      },
      "data": [{
        "type": "sentinel-2-l2a",
        "dataFilter": {
          "mosaickingOrder": "leastCC"
        }
      }]
    },
    "aggregation": {
      "timeRange": {
        "from": "2020-06-01T00:00:00Z",
        "to": "2020-06-30T00:00:00Z"
      },
      "aggregationInterval": { "of": "P1D" },
      "width": 512,
      "height": 512,
      "evalscript": "//VERSION=3\nfunction setup() {\n  return {\n    input: [{\n      bands: [\n        \"B04\",\n        \"B08\",\n        \"SCL\",\n        \"dataMask\"\n      ]\n    }],\n    output: [\n      {\n        id: \"default\",\n        bands: [\"NDVI\"]\n      },\n      {\n        id: \"dataMask\",\n        bands: 1\n      }\n    ]\n  };\n}\nfunction evaluatePixel(samples) {\n  let ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04);\n  const scl = samples.SCL;\n  let validPixel = 0;\n  if (scl === 4 || scl === 5 || scl === 6 || scl === 7 || scl === 11) { validPixel = 1; }\n  return { default: [ndvi], dataMask: [samples.dataMask && validPixel] };\n}"
    },
    "calculations": {
      "default": {
        "histograms": { "default": { "nBins": 20, "lowEdge": -1.0, "highEdge": 1.0 } },
        "statistics": { "default": { "percentiles": { "k": [25, 50, 75, 90] } } }
      }
    }
  }

  results.payload_sent = body

  const shRes = await fetch('https://sh.dataspace.copernicus.eu/api/v1/statistics', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  const shData = await shRes.json()
  results.sh_status = shRes.status
  results.sh_response = shData

  if (!shRes.ok) {
    return NextResponse.json(results, { status: shRes.status })
  }

  const values = (shData.data ?? []).map((item: any) => ({
    date: item.interval?.from?.slice(0, 10),
    ndvi_mean: item.outputs?.default?.bands?.NDVI?.stats?.mean?.toFixed(4) ?? 'no-data',
  }))

  results.ndvi_values = values
  results.summary = '✅ OK'
  return NextResponse.json(results, { status: 200 })
}
