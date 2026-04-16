/**
 * sentinel-client.ts
 *
 * Client server-side per Sentinel Hub Statistical API.
 * Usato SOLO da codice che gira su Node.js (route API, server actions).
 * Non importare questo file in componenti client ("use client").
 *
 * Flusso:
 *   1. Prende/cacha il token OAuth con client_credentials
 *   2. Per ogni indice richiesto, chiama /api/v1/statistics
 *   3. Aggrega i risultati giornalieri in una media di periodo
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
  /** Media dell'indice nel periodo (null se nessun dato valido) */
  mean: number | null
  /** Numero di giorni con dati validi */
  validDays: number
  /** Numero di giorni totali nel periodo */
  totalDays: number
}

export type IndicesForPeriod = Record<SHIndex, PeriodMean>

// ── Funzione principale ────────────────────────────────────────────────────

/**
 * Fetcha la media di un singolo indice su un'area e un periodo.
 * Usa aggregationInterval P1D (giornaliero) e ne fa la media lato nostro.
 */
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
              to: `${dateTo}T23:59:59Z`,
            },
            maxCloudCoverage: 40, // un po' più permissivo per periodi lunghi
          },
          type: 'sentinel-2-l2a',
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${dateFrom}T00:00:00Z`,
        to: `${dateTo}T23:59:59Z`,
      },
      // P10D = ogni 10 giorni → meno chiamate, meno PU, buona copertura temporale
      aggregationInterval: { of: 'P10D' },
      evalscript,
      resx: 20, // 20m — buon compromesso tra precisione e PU consumati
      resy: 20,
    },
    calculations: {
      default: {
        statistics: {
          default: {},
        },
      },
    },
  }

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
    throw new Error(`SH Statistics ${index} error ${res.status}: ${txt.slice(0, 300)}`)
  }

  const raw = await res.json()
  const items: { mean: number | null }[] = (raw.data ?? []).map((item: any) => {
    const stats = item?.outputs?.default?.bands?.B0?.stats ?? {}
    const mean = typeof stats.mean === 'number' && !isNaN(stats.mean) ? stats.mean : null
    return { mean }
  })

  const valid = items.filter((i) => i.mean !== null)
  if (valid.length === 0) return { mean: null, validDays: 0, totalDays: items.length }

  const avg = valid.reduce((s, i) => s + i.mean!, 0) / valid.length
  return {
    mean: parseFloat(avg.toFixed(4)),
    validDays: valid.length,
    totalDays: items.length,
  }
}

/**
 * Fetcha tutti gli indici per un periodo in parallelo.
 * In caso di errore per un singolo indice, ritorna mean=null (non blocca gli altri).
 */
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
      console.warn(`[SentinelClient] ${idx} failed:`, r.reason?.message)
      out[idx] = { mean: null, validDays: 0, totalDays: 0 }
    }
  })

  return out
}

/**
 * Controlla se le credenziali Copernicus sono configurate.
 * Utile per decidere se usare dati reali o fallback mock.
 */
export function isCopernicusConfigured(): boolean {
  return !!(process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET)
}
