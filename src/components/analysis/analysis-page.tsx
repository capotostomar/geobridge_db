"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";

export default function AnalysisPage({ analysis }: { analysis: any }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMap = useRef<any>(null);

  const [loading, setLoading] = useState(false);

  // -----------------------------
  // 🗺️ INIT MAPPA LEAFLET
  // -----------------------------
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const map = L.map(mapRef.current).setView(
      [analysis.lat || 41.9, analysis.lng || 12.5],
      13
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);

    if (analysis.lat && analysis.lng) {
      L.marker([analysis.lat, analysis.lng]).addTo(map);
    }

    leafletMap.current = map;
  }, [analysis]);

  // -----------------------------
  // 📸 SCREENSHOT MAPPA
  // -----------------------------
  const captureMap = async (): Promise<string | null> => {
    if (!mapRef.current) return null;

    const html2canvas = (await import("html2canvas")).default;

    const canvas = await html2canvas(mapRef.current, {
      useCORS: true,
    });

    return canvas.toDataURL("image/png");
  };

  // -----------------------------
  // 📊 GENERA SVG GRAFICO
  // -----------------------------
  const generateChartSVG = () => {
    const values = analysis?.metrics || [10, 30, 20, 50];

    const bars = values
      .map((v: number, i: number) => {
        const height = v * 2;
        const x = i * 60 + 20;
        const y = 200 - height;

        return `<rect x="${x}" y="${y}" width="40" height="${height}" fill="#2563eb" />`;
      })
      .join("");

    return `
      <svg width="400" height="200">
        ${bars}
      </svg>
    `;
  };

  // -----------------------------
  // 📄 EXPORT PDF
  // -----------------------------
  const handleExportPdf = async () => {
    if (!analysis?.id) return;

    try {
      setLoading(true);

      const mapImage = await captureMap();
      const svgChart = generateChartSVG();

      const res = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analysisId: analysis.id,
          mapImage,
          svgChart,
        }),
      });

      if (!res.ok) throw new Error("Errore PDF");

      const blob = await res.blob();

      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${analysis.id}.pdf`;
      a.click();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Errore nella generazione del PDF");
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="p-6 space-y-6">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Analisi GeoBridge</h1>

        <button
          onClick={handleExportPdf}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Generazione..." : "Export PDF"}
        </button>
      </div>

      {/* MAPPA */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-semibold mb-2">Mappa area</h2>
        <div
          ref={mapRef}
          className="w-full h-[400px] rounded-lg overflow-hidden"
        />
      </div>

      {/* DATI */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-semibold mb-2">Dati analisi</h2>

        <table className="w-full text-sm">
          <tbody>
            {Object.entries(analysis || {}).map(([key, value]) => (
              <tr key={key} className="border-b">
                <td className="py-2 font-medium">{key}</td>
                <td className="py-2">{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* GRAFICO */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-semibold mb-2">Grafico</h2>
        <div
          dangerouslySetInnerHTML={{ __html: generateChartSVG() }}
        />
      </div>
    </div>
  );
}
