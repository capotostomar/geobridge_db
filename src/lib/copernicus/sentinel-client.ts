/**
 * sentinel-client.ts — Sentinel Hub Statistical API
 * Server-side only. Non importare in componenti "use client".
 *
 * Evalscript: dataMask dichiarato sia in input che come output separato (id: "dataMask")
 * con SCL per filtrare nuvole. Questo è il formato richiesto da Copernicus CDSE.
 */

import { EVALSCRIPTS } from './evalscripts'

// ── Token cache ────────────────────────────────────────────────────────────

let _cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 90_000) {
    return _cachedToken.value
  }

  const clientId = process.env.COPERNICUS_CLIENT_ID
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET non configurate')
  }

  const res = await fetch(
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

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Token fetch fallito (${res.status}): ${txt.slice(0, 200)}`)
  }

  const data = await res.json()
  _cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
  return _cachedToken.value
}

// ── Tipi ──────────────────────────────────────────────────────────────────

export type SHIndex = 'NDVI' | 'NDMI' | 'NBR' | 'NDBI' | 'EVI' | 'BREI'
export type BBoxWsen = [number, number, number, number]

export interface PeriodMean {
  mean: number | null
  validDays: number
  totalDays: number
}

export type IndicesForPeriod = Record<SHIndex, PeriodMean>

// ── Fetch singolo indice ──────────────────────────────────────────────────

async function fetchIndexMean(
  token: string,
  bbox: BBoxWsen,
  dateFrom: string,
  dateTo: string,
  index: SHIndex
): Promise<PeriodMean> {
  const evalscript = EVALSCRIPTS[index]
  if (!evalscript) throw new Error(`Evalscript mancante per ${index}`)

  const payload = {
    input: {
      bounds: {
        properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' },
        bbox,
      },
      data: [{
        type: 'sentinel-2-l2a',
        dataFilter: {
          timeRange: {
            from: `${dateFrom}T00:00:00Z`,
            to: `${dateTo}T23:59:59Z`,
          },
          mosaickingOrder: 'leastCC',
        },
      }],
    },
    aggregation: {
      timeRange: {
        from: `${dateFrom}T00:00:00Z`,
        to: `${dateTo}T23:59:59Z`,
      },
      aggregationInterval: { of: 'P10D' },
      evalscript,
      width: 512,
      height: 512,
    },
    calculations: {
      default: {
        statistics: {
          default: {
            percentiles: { k: [25, 50, 75] },
          },
        },
      },
    },
  }

  console.log(`[SH] ${index} bbox=[${bbox.join(',')}] from=${dateFrom} to=${dateTo}`)

  const res = await fetch('https://sh.dataspace.copernicus.eu/api/v1/statistics', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`SH ${index} ${res.status}: ${txt.slice(0, 400)}`)
  }

  const raw = await res.json()

  // Con evalscript che ha output id "default" con banda "NDVI" (o nome dell'indice)
  // la struttura è: item.outputs.default.bands.[BAND_NAME].stats
  const items: (number | null)[] = (raw.data ?? []).map((item: any) => {
    // Prova prima con il nome dell'indice come banda, poi con B0
    const bands = item?.outputs?.default?.bands ?? {}
    const stats = bands[index]?.stats ?? bands['B0']?.stats ?? {}
    const mean = typeof stats.mean === 'number' && isFinite(stats.mean) ? stats.mean : null
    return mean
  })

  const valid = items.filter((v): v is number => v !== null)
  if (valid.length === 0) return { mean: null, validDays: 0, totalDays: items.length }

  const avg = valid.reduce((s, v) => s + v, 0) / valid.length
  return {
    mean: parseFloat(avg.toFixed(4)),
    validDays: valid.length,
    totalDays: items.length,
  }
}

// ── Fetch tutti gli indici in parallelo ───────────────────────────────────

export async function fetchAllIndicesForPeriod(
  bbox: BBoxWsen,
  dateFrom: string,
  dateTo: string
): Promise<IndicesForPeriod> {
  const token = await getToken()
  const indices: SHIndex[] = ['NDVI', 'NDMI', 'NBR', 'NDBI', 'EVI', 'BREI']

  const results = await Promise.allSettled(
    indices.map((idx) => fetchIndexMean(token, bbox, dateFrom, dateTo, idx))
  )

  const out = {} as IndicesForPeriod
  results.forEach((r, i) => {
    const idx = indices[i]
    if (r.status === 'fulfilled') {
      out[idx] = r.value
    } else {
      console.warn(`[SH] ${idx} failed:`, r.reason?.message ?? r.reason)
      out[idx] = { mean: null, validDays: 0, totalDays: 0 }
    }
  })

  return out
}

export function isCopernicusConfigured(): boolean {
  return !!(process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET)
}
