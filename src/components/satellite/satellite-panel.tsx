"use client";

import { useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { BBox, SatelliteIndex, CopernicusStatisticsResponse, DayResult } from "@/lib/copernicus/types";

// ------------------------------------------------------------------ //
// Config indici                                                        //
// ------------------------------------------------------------------ //
const INDEX_CONFIG: Record<SatelliteIndex, {
  label: string;
  description: string;
  unit: string;
  thresholds: { value: number; label: string; color: string }[];
  color: string;
}> = {
  NDVI: {
    label: "NDVI",
    description: "Vegetazione",
    unit: "",
    color: "#34d399",
    thresholds: [
      { value: 0.6, label: "Densa", color: "#059669" },
      { value: 0.3, label: "Moderata", color: "#d97706" },
    ],
  },
  NDWI: {
    label: "NDWI",
    description: "Umidità / Acqua",
    unit: "",
    color: "#60a5fa",
    thresholds: [
      { value: 0, label: "Acqua", color: "#2563eb" },
    ],
  },
  EVI: {
    label: "EVI",
    description: "Vegetazione (enhanced)",
    unit: "",
    color: "#a3e635",
    thresholds: [
      { value: 0.5, label: "Densa", color: "#65a30d" },
      { value: 0.2, label: "Moderata", color: "#ca8a04" },
    ],
  },
  NBR: {
    label: "NBR",
    description: "Bruciature",
    unit: "",
    color: "#fb923c",
    thresholds: [
      { value: 0.1, label: "Sana", color: "#16a34a" },
    ],
  },
};

function getValueColor(index: SatelliteIndex, value: number): string {
  const cfg = INDEX_CONFIG[index];
  if (!cfg.thresholds.length) return "text-white";
  const passed = cfg.thresholds.find((t) => value >= t.value);
  if (!passed) return "text-red-400";
  return passed.color.startsWith("#")
    ? `text-[${passed.color}]`
    : passed.color;
}

function valueBadge(index: SatelliteIndex, value: number): { label: string; className: string } {
  if (index === "NDVI" || index === "EVI") {
    if (value > 0.6) return { label: "Alta densità", className: "bg-emerald-600" };
    if (value > 0.3) return { label: "Moderata", className: "bg-yellow-600" };
    return { label: "Scarsa / Suolo", className: "bg-red-700" };
  }
  if (index === "NDWI") {
    return value > 0
      ? { label: "Presenza acqua", className: "bg-blue-600" }
      : { label: "Suolo/Secco", className: "bg-orange-700" };
  }
  if (index === "NBR") {
    if (value > 0.1) return { label: "Vegetazione sana", className: "bg-emerald-600" };
    if (value > -0.1) return { label: "Stressata", className: "bg-yellow-600" };
    return { label: "Area bruciata", className: "bg-red-700" };
  }
  return { label: "", className: "" };
}

// ------------------------------------------------------------------ //
// Tooltip personalizzato per il chart                                  //
// ------------------------------------------------------------------ //
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-600 rounded-lg p-2 text-xs shadow-xl">
      <div className="font-mono text-slate-300 mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex gap-2 items-center">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-mono text-white">{p.value?.toFixed(3) ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Componente principale                                                //
// ------------------------------------------------------------------ //
interface SatellitePanelProps {
  /** BBox [west, south, east, north] dell'area disegnata sulla mappa. null = nessuna area */
  bbox: BBox | null;
}

const today = () => new Date().toISOString().split("T")[0];
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
};

export default function SatellitePanel({ bbox }: SatellitePanelProps) {
  const [index, setIndex] = useState<SatelliteIndex>("NDVI");
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopernicusStatisticsResponse | null>(null);

  const handleQuery = useCallback(async () => {
    if (!bbox) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/copernicus/statistics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbox, dateFrom, dateTo, index }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [bbox, index, dateFrom, dateTo]);

  const validResults: DayResult[] = result?.results.filter((r) => r.mean !== null) ?? [];

  const avgMean =
    validResults.length > 0
      ? validResults.reduce((s, r) => s + (r.mean ?? 0), 0) / validResults.length
      : null;

  const cfg = INDEX_CONFIG[index];
  const badge = avgMean !== null ? valueBadge(index, avgMean) : null;

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-800 text-white h-full overflow-y-auto">

      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xl">🛰️</span>
        <h2 className="text-base font-semibold">Analisi Satellitare</h2>
        <span className="ml-auto text-[10px] text-slate-500">Sentinel-2 L2A · Copernicus</span>
      </div>

      {/* No bbox warning */}
      {!bbox && (
        <div className="text-sm text-slate-400 bg-slate-700/60 border border-slate-600 rounded-lg p-3">
          ✏️ Disegna un rettangolo o un poligono sulla mappa per attivare l&apos;analisi satellitare.
        </div>
      )}

      {/* Selezione indice */}
      <div>
        <label className="text-xs text-slate-400 mb-1.5 block uppercase tracking-wider">Indice</label>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(INDEX_CONFIG) as SatelliteIndex[]).map((idx) => (
            <button
              key={idx}
              onClick={() => { setIndex(idx); setResult(null); }}
              className={`rounded-lg px-3 py-2 text-left text-sm transition-all ${
                index === idx
                  ? "ring-2 ring-emerald-500 bg-slate-700"
                  : "bg-slate-700/50 hover:bg-slate-700 text-slate-300"
              }`}
            >
              <div className="font-semibold">{INDEX_CONFIG[idx].label}</div>
              <div className="text-xs text-slate-400">{INDEX_CONFIG[idx].description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Dal</label>
          <input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full bg-slate-700 rounded-lg px-2 py-1.5 text-sm text-white border border-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Al</label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={today()}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full bg-slate-700 rounded-lg px-2 py-1.5 text-sm text-white border border-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* BBox display */}
      {bbox && (
        <div className="text-[11px] font-mono text-slate-500 bg-slate-900/50 rounded px-2 py-1 truncate">
          bbox: [{bbox.map((v) => v.toFixed(5)).join(", ")}]
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleQuery}
        disabled={!bbox || loading}
        className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span> Caricamento dati…
          </>
        ) : (
          "Analizza area"
        )}
      </button>

      {/* Errore */}
      {error && (
        <div className="bg-red-900/40 border border-red-600 rounded-lg p-3 text-sm text-red-300">
          <span className="font-semibold">Errore:</span> {error}
        </div>
      )}

      {/* Risultati */}
      {result && (
        <div className="flex flex-col gap-4">

          {/* KPI principale */}
          {avgMean !== null && (
            <div className="bg-slate-900/60 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Media {result.index} nel periodo</div>
              <div className="flex items-end gap-3">
                <span className="text-3xl font-bold font-mono" style={{ color: cfg.color }}>
                  {avgMean.toFixed(3)}
                </span>
                {badge && (
                  <span className={`text-xs px-2 py-0.5 rounded-full text-white mb-1 ${badge.className}`}>
                    {badge.label}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {validResults.length} giorni con dati validi su {result.results.length} totali
              </div>
            </div>
          )}

          {/* Chart area */}
          {validResults.length > 0 && (
            <div className="bg-slate-900/60 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-2">Serie temporale</div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={validResults} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad_${index}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={cfg.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickFormatter={(v) => v.slice(5)} // MM-DD
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => v.toFixed(2)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {/* Banda IQR (p25-p75) */}
                  <Area
                    type="monotone"
                    dataKey="p75"
                    stroke="none"
                    fill={cfg.color}
                    fillOpacity={0.1}
                    name="p75"
                    legendType="none"
                  />
                  <Area
                    type="monotone"
                    dataKey="mean"
                    stroke={cfg.color}
                    strokeWidth={2}
                    fill={`url(#grad_${index})`}
                    dot={validResults.length < 15 ? { r: 2, fill: cfg.color } : false}
                    name="Media"
                  />
                  {cfg.thresholds.map((t) => (
                    <ReferenceLine
                      key={t.value}
                      y={t.value}
                      stroke={t.color}
                      strokeDasharray="4 2"
                      strokeOpacity={0.6}
                      label={{ value: t.label, fontSize: 8, fill: t.color, position: "insideTopRight" }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabella dati grezzi */}
          <div className="bg-slate-900/60 rounded-xl overflow-hidden">
            <div className="text-xs text-slate-400 px-3 py-2 border-b border-slate-700 flex justify-between items-center">
              <span>Dati giornalieri</span>
              <span className="text-slate-600">{validResults.length} righe</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {validResults.length === 0 ? (
                <p className="text-sm text-slate-400 p-3">
                  Nessun dato. Prova ad ampliare il range di date o a scegliere un&apos;area con meno nuvole (copertura max 30%).
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-800">
                    <tr className="text-slate-400">
                      <th className="text-left px-3 py-1.5">Data</th>
                      <th className="text-right px-3 py-1.5">Media</th>
                      <th className="text-right px-3 py-1.5 text-slate-600">Min</th>
                      <th className="text-right px-3 py-1.5 text-slate-600">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validResults.map((r) => (
                      <tr key={r.date} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-3 py-1.5 font-mono text-slate-300">{r.date}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold" style={{ color: cfg.color }}>
                          {r.mean!.toFixed(3)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-500">
                          {r.min?.toFixed(3) ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-500">
                          {r.max?.toFixed(3) ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Info qualità dati */}
          {result.results.length > validResults.length && (
            <div className="text-xs text-slate-500 text-center">
              {result.results.length - validResults.length} giorni esclusi per copertura nuvolosa &gt; 30% o no-data
            </div>
          )}
        </div>
      )}
    </div>
  );
}
