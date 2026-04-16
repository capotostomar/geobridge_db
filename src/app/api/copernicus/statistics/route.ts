import { NextRequest, NextResponse } from "next/server";
import { EVALSCRIPTS } from "@/lib/copernicus/evalscripts";
import type { SatelliteQuery, DayResult } from "@/lib/copernicus/types";

// ------------------------------------------------------------------ //
// Helper: prende il token dalla route interna                          //
// ------------------------------------------------------------------ //
async function getToken(origin: string): Promise<string> {
  const res = await fetch(`${origin}/api/copernicus/token`, {
    // Disabilita la cache di Next.js fetch per questa chiamata interna
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Token non disponibile");
  const data = await res.json();
  if (!data.access_token) throw new Error("access_token mancante nella risposta");
  return data.access_token;
}

// ------------------------------------------------------------------ //
// POST /api/copernicus/statistics                                      //
// Body: SatelliteQuery                                                 //
// ------------------------------------------------------------------ //
export async function POST(req: NextRequest) {
  const query: SatelliteQuery = await req.json();
  const { bbox, dateFrom, dateTo, index } = query;

  // Validazione base
  if (!bbox || bbox.length !== 4) {
    return NextResponse.json({ error: "bbox non valido" }, { status: 400 });
  }
  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: "dateFrom e dateTo obbligatori" }, { status: 400 });
  }

  const evalscript = EVALSCRIPTS[index];
  if (!evalscript) {
    return NextResponse.json({ error: `Indice ${index} non supportato` }, { status: 400 });
  }

  // Token
  const origin = req.nextUrl.origin;
  let token: string;
  try {
    token = await getToken(origin);
  } catch (e: any) {
    return NextResponse.json({ error: "Autenticazione Copernicus fallita", detail: e.message }, { status: 401 });
  }

  // Payload per Sentinel Hub Statistical API
  const payload = {
    input: {
      bounds: {
        bbox,
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [
        {
          dataFilter: {
            timeRange: {
              from: `${dateFrom}T00:00:00Z`,
              to: `${dateTo}T23:59:59Z`,
            },
            maxCloudCoverage: 30,
          },
          type: "sentinel-2-l2a",
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: `${dateFrom}T00:00:00Z`,
        to: `${dateTo}T23:59:59Z`,
      },
      aggregationInterval: { of: "P1D" }, // 1 punto per giorno
      evalscript,
      resx: 10,  // risoluzione 10m (banda S2 nativa)
      resy: 10,
    },
    calculations: {
      default: {
        statistics: {
          default: {
            percentiles: { k: [25, 75] },
          },
        },
      },
    },
  };

  let shRes: Response;
  try {
    shRes = await fetch("https://sh.dataspace.copernicus.eu/api/v1/statistics", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Impossibile raggiungere Sentinel Hub" },
      { status: 502 }
    );
  }

  if (!shRes.ok) {
    const errText = await shRes.text();
    return NextResponse.json(
      { error: `Sentinel Hub error ${shRes.status}`, detail: errText },
      { status: shRes.status }
    );
  }

  const raw = await shRes.json();

  // Normalizza la risposta — la struttura SH è:
  // raw.data[].interval.from  (timestamp ISO)
  // raw.data[].outputs.default.bands.B0.stats.{mean,min,max,percentiles,sampleCount,noDataCount}
  const results: DayResult[] = (raw.data ?? []).map((item: any) => {
    const stats = item?.outputs?.default?.bands?.B0?.stats ?? {};
    return {
      date: (item?.interval?.from ?? "").split("T")[0],
      mean:         typeof stats.mean === "number" ? stats.mean : null,
      min:          typeof stats.min  === "number" ? stats.min  : null,
      max:          typeof stats.max  === "number" ? stats.max  : null,
      p25:          stats.percentiles?.["25.0"] ?? null,
      p75:          stats.percentiles?.["75.0"] ?? null,
      sampleCount:  stats.sampleCount  ?? 0,
      noDataCount:  stats.noDataCount  ?? 0,
    };
  });

  return NextResponse.json({ index, bbox, dateFrom, dateTo, results });
}
