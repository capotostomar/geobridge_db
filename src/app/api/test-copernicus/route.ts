import { NextResponse } from 'next/server'

export const maxDuration = 60

export async function GET() {
  const results: Record<string, unknown> = {}

  // ── Step 1: credenziali presenti? ──────────────────────────────────────
  const clientId = process.env.COPERNICUS_CLIENT_ID
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET

  results.credentials = {
    COPERNICUS_CLIENT_ID: clientId ? `✅ presente (${clientId.slice(0, 8)}...)` : '❌ MANCANTE',
    COPERNICUS_CLIENT_SECRET: clientSecret ? `✅ presente (${clientSecret.slice(0, 4)}...)` : '❌ MANCANTE',
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json({ ...results, error: 'Credenziali mancanti — aggiungi le env vars su Vercel' }, { status: 400 })
  }

  // ── Step 2: token OAuth ────────────────────────────────────────────────
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
      results.token = { status: '❌ FALLITO', httpStatus: tokenRes.status, detail: tokenData }
      return NextResponse.json(results, { status: 502 })
    }
    token = tokenData.access_token
    results.token = {
      status: '✅ OK',
      expires_in: tokenData.expires_in,
      token_preview: token.slice(0, 20) + '...',
    }
  } catch (e: unknown) {
    results.token = { status: '❌ ERRORE RETE', detail: e instanceof Error ? e.message : String(e) }
    return NextResponse.json(results, { status: 502 })
  }

  // ── Step 3: chiamata Statistics API su bbox piccola (Roma centro) ──────
  // Bbox piccola = pochi PU consumati (~0.1 PU)
  const bbox = [12.48, 41.89, 12.51, 41.91] // Roma centro, ~2x2 km

  const evalscript = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 2, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B08 + s.B04;
  let val = d === 0 ? 0 : (s.B08 - s.B04) / d;
  return [val, s.dataMask];
}`

  const payload = {
    input: {
      bounds: {
        bbox,
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

  try {
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

    if (!shRes.ok) {
      results.statistics = {
        status: '❌ FALLITO',
        httpStatus: shRes.status,
        error: shData,
      }
      return NextResponse.json(results, { status: shRes.status })
    }

    // Estrai i valori NDVI dai periodi restituiti
    const ndviValues = (shData.data ?? []).map((item: any) => ({
      date: item.interval?.from?.slice(0, 10),
      ndvi_mean: item.outputs?.default?.bands?.B0?.stats?.mean?.toFixed(4) ?? 'no-data',
      sample_count: item.outputs?.default?.bands?.B0?.stats?.sampleCount ?? 0,
    }))

    results.statistics = {
      status: '✅ OK',
      bbox,
      periodo: 'giugno 2024',
      periodi_restituiti: ndviValues.length,
      ndvi_values: ndviValues,
      raw_response_keys: Object.keys(shData),
    }

  } catch (e: unknown) {
    results.statistics = {
      status: '❌ ERRORE RETE',
      detail: e instanceof Error ? e.message : String(e),
    }
    return NextResponse.json(results, { status: 502 })
  }

  // ── Riepilogo ──────────────────────────────────────────────────────────
  results.summary = '✅ Tutto OK — Copernicus funziona correttamente'
  return NextResponse.json(results, { status: 200 })
}
