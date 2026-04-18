/**
 * sentinel-client.ts — Sentinel Hub Statistical API
 * Server-side only. Non importare in componenti "use client".
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

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(
    'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
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

/** BBox in EPSG:4326: [west, south, east, north] */
export type BBoxWsen = [number, number, number, number]

export interface PeriodMean {
  mean: number | null
  validDays: number
  totalDays: number
}

export type IndicesForPeriod = Record<SHIndex, PeriodMean>

// Usiamo width/height fissi in pixel invece di resx/resy.
// Così Sentinel Hub calcola automaticamente la risoluzione
// senza mai superare il limite di 1500 m/px indipendentemente dall'area.
// 256x256 px è più che sufficiente per statistiche aggregate.
const SH_WIDTH_PX  = 256
const SH_HEIGHT_PX = 256

// ── Lettura risposta Statistical API ─────────────────────────────────────
/**
 * Con evalscript a 2 bande (indice + dataMask) la struttura risposta è:
 *   item.outputs.default.bands.B0 → indice
 *   item.outputs.default.bands.B1 → dataMask (ignorato qui, già filtrato da SH)
 */
function extractMean(item: any): number | null {
  const stats = item?.outputs?.default?.bands?.B0?.stats ?? {}
  if (typeof stats.mean !== 'number' || isNaN(stats.mean)) return null
  // SH restituisce NaN come stringa o come numero speciale in alcuni edge case
  if (!isFinite(stats.mean)) return null
  return stats.mean
}

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
        bbox,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [
        {
          dataFilter: {
            timeRange: {
              from: `${dateFrom}T00:00:00Z`,
              to:   `${dateTo}T23:59:59Z`,
            },
            maxCloudCoverage: 50,
          },
          type: 'sentinel-2-l2a',
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${dateFrom}T00:00:00Z`,
        to:   `${dateTo}T23:59:59Z`,
      },
      aggregationInterval: { of: 'P10D' },
      evalscript,
      width: SH_WIDTH_PX,
      height: SH_HEIGHT_PX,
    },
    calculations: {
      default: {
        statistics: {
          default: {},
        },
      },
    },
  }

  console.log(`[SH] ${index} bbox=[${bbox.join(',')}] ${SH_WIDTH_PX}x${SH_HEIGHT_PX}px from=${dateFrom} to=${dateTo}`)

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
  const items: (number | null)[] = (raw.data ?? []).map(extractMean)
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
