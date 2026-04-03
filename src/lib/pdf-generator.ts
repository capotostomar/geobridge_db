/**
 * GeoBridge — PDF Report Generator
 *
 * Genera un report PDF professionale interamente lato client
 * usando jsPDF. Nessuna dipendenza server, deployabile su Vercel.
 *
 * Struttura del documento:
 *   1. Cover page — logo, titolo, metadati, livello rischio
 *   2. Mappa area — screenshot via OpenStreetMap Static API
 *   3. Riepilogo rischio composito — gauge SVG embedded
 *   4. Categorie di rischio — tabella con barre
 *   5. Indici spettrali — tabella dati
 *   6. Timeline semestrale — grafico a barre SVG
 *   7. Raccomandazioni
 *   8. Disclaimer / firma assicurativa
 */

import { AnalysisResult, RiskLevel } from '@/lib/types'

// ─── Colori ───────────────────────────────────────────────────────────────

const COLORS = {
  primary:   [15, 185, 129] as [number, number, number],   // emerald-500
  dark:      [15, 23, 42] as [number, number, number],      // slate-900
  mid:       [71, 85, 105] as [number, number, number],     // slate-600
  light:     [241, 245, 249] as [number, number, number],   // slate-100
  white:     [255, 255, 255] as [number, number, number],
  basso:     [16, 185, 129] as [number, number, number],    // emerald
  medio:     [245, 158, 11] as [number, number, number],    // amber
  alto:      [249, 115, 22] as [number, number, number],    // orange
  critico:   [239, 68, 68] as [number, number, number],     // red
  accent:    [99, 102, 241] as [number, number, number],    // indigo
}

function riskColor(level: RiskLevel): [number, number, number] {
  return COLORS[level] ?? COLORS.basso
}

function riskLabel(level: RiskLevel): string {
  return { basso: 'BASSO', medio: 'MEDIO', alto: 'ALTO', critico: 'CRITICO' }[level] ?? level.toUpperCase()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatArea(km2: number): string {
  return km2 < 1 ? `${(km2 * 100).toFixed(1)} ha` : `${km2.toFixed(2)} km²`
}

// ─── SVG → PNG via canvas (browser only) ─────────────────────────────────

async function svgToPng(svgString: string, width: number, height: number): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width * 2   // retina
      canvas.height = height * 2
      const ctx = canvas.getContext('2d')!
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve('') }
    img.src = url
  })
}

// ─── Gauge SVG (cerchio con score) ────────────────────────────────────────

function buildGaugeSVG(score: number, level: RiskLevel, size = 140): string {
  const [r, g, b] = riskColor(level)
  const color = `rgb(${r},${g},${b})`
  const circumference = 2 * Math.PI * 42
  const offset = circumference - (score / 100) * circumference
  const cx = size / 2; const cy = size / 2; const radius = size * 0.3
  const circ = 2 * Math.PI * radius
  const off = circ - (score / 100) * circ
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="${size * 0.07}" />
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${size * 0.07}"
      stroke-dasharray="${circ}" stroke-dashoffset="${off}" stroke-linecap="round"
      transform="rotate(-90 ${cx} ${cy})" />
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
      font-family="Arial,sans-serif" font-size="${size * 0.18}" font-weight="bold" fill="#0f172a">${score}</text>
    <text x="${cx}" y="${cy + size * 0.16}" text-anchor="middle"
      font-family="Arial,sans-serif" font-size="${size * 0.09}" fill="#64748b">/100</text>
  </svg>`
}

// ─── Timeline bar chart SVG ───────────────────────────────────────────────

function buildTimelineSVG(periods: AnalysisResult['periods'], width = 500, height = 160): string {
  if (!periods.length) return ''
  const barW = Math.min(36, (width / periods.length) - 4)
  const gap  = (width - barW * periods.length) / (periods.length + 1)
  const colorFor = (s: number) => s < 25 ? '#10b981' : s < 50 ? '#f59e0b' : s < 75 ? '#f97316' : '#ef4444'

  const bars = periods.map((p, i) => {
    const x = gap + i * (barW + gap)
    const barH = (p.compositeRisk / 100) * height
    const y = height - barH
    const label = p.period.split(' / ')[0]
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${colorFor(p.compositeRisk)}" opacity="0.85"/>
      <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#475569" font-weight="600"
        font-family="Arial,sans-serif">${p.compositeRisk}</text>
      <text x="${x + barW / 2}" y="${height + 14}" text-anchor="middle" font-size="8" fill="#94a3b8"
        font-family="Arial,sans-serif" transform="rotate(-30 ${x + barW / 2} ${height + 14})">${label}</text>`
  }).join('')

  const grid = [0, 25, 50, 75, 100].map(v => {
    const y = height - (v / 100) * height
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>
      <text x="-4" y="${y + 4}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="Arial,sans-serif">${v}</text>`
  }).join('')

  return `<svg width="${width}" height="${height + 36}" xmlns="http://www.w3.org/2000/svg">
    <g>${grid}</g>
    <g>${bars}</g>
  </svg>`
}

// ─── Mappa area come SVG dalle coordinate (no CORS, sempre funziona) ─────────

function buildMapSVG(coords: [number, number][], width: number, height: number): string {
  if (coords.length < 2) return ''

  const lats = coords.map(c => c[0])
  const lons = coords.map(c => c[1])
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons); const maxLon = Math.max(...lons)

  const padLat = Math.max(0.008, (maxLat - minLat) * 0.35)
  const padLon = Math.max(0.008, (maxLon - minLon) * 0.35)
  const bLat0 = minLat - padLat; const bLat1 = maxLat + padLat
  const bLon0 = minLon - padLon; const bLon1 = maxLon + padLon
  const spanLat = bLat1 - bLat0; const spanLon = bLon1 - bLon0

  // Proiezione lat/lon → pixel
  const toX = (lon: number) => ((lon - bLon0) / spanLon) * width
  const toY = (lat: number) => ((bLat1 - lat) / spanLat) * height

  // Griglia di sfondo
  const gridLines: string[] = []
  const gridCount = 4
  for (let i = 1; i < gridCount; i++) {
    const gx = (width / gridCount) * i
    const gy = (height / gridCount) * i
    gridLines.push(`<line x1="${gx}" y1="0" x2="${gx}" y2="${height}" stroke="#e2e8f0" stroke-width="0.5"/>`)
    gridLines.push(`<line x1="0" y1="${gy}" x2="${width}" y2="${gy}" stroke="#e2e8f0" stroke-width="0.5"/>`)
  }

  // Poligono area
  const polyPoints = coords.map(c => `${toX(c[1])},${toY(c[0])}`).join(' ')
  const centerX = toX((minLon + maxLon) / 2)
  const centerY = toY((minLat + maxLat) / 2)

  // Label coordinate angoli
  const tl = `${bLat1.toFixed(3)}°N ${bLon0.toFixed(3)}°E`
  const br = `${bLat0.toFixed(3)}°N ${bLon1.toFixed(3)}°E`

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <!-- Sfondo mappa -->
    <rect width="${width}" height="${height}" fill="#f8fafc"/>
    <!-- Griglia -->
    ${gridLines.join('')}
    <!-- Area selezionata — fill -->
    <polygon points="${polyPoints}" fill="#10b981" fill-opacity="0.18" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/>
    <!-- Vertici -->
    ${coords.map(c => `<circle cx="${toX(c[1])}" cy="${toY(c[0])}" r="3.5" fill="#fff" stroke="#10b981" stroke-width="1.5"/>`).join('')}
    <!-- Centroide marker -->
    <circle cx="${centerX}" cy="${centerY}" r="5" fill="#10b981" opacity="0.9"/>
    <circle cx="${centerX}" cy="${centerY}" r="2.5" fill="#fff"/>
    <!-- Label angoli -->
    <text x="4" y="11" font-size="7" fill="#94a3b8" font-family="Arial,sans-serif">${tl}</text>
    <text x="${width - 4}" y="${height - 4}" font-size="7" fill="#94a3b8" font-family="Arial,sans-serif" text-anchor="end">${br}</text>
    <!-- Dimensioni area nel centro -->
    <rect x="${centerX - 28}" y="${centerY + 8}" width="56" height="13" rx="3" fill="#0f172a" fill-opacity="0.75"/>
    <text x="${centerX}" y="${centerY + 17}" text-anchor="middle" font-size="7.5" fill="white" font-family="Arial,sans-serif" font-weight="bold">
      ${coords.length} vertici
    </text>
    <!-- Bordo -->
    <rect width="${width}" height="${height}" fill="none" stroke="#e2e8f0" stroke-width="1"/>
  </svg>`
}

async function buildMapImage(coords: [number, number][], width: number, height: number): Promise<string> {
  // Prima tenta la Static Map API (Geoapify — CORS-safe, no key richiesta per bassa risoluzione)
  try {
    const lats = coords.map(c => c[0])
    const lons = coords.map(c => c[1])
    const minLat = Math.min(...lats); const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons); const maxLon = Math.max(...lons)
    const padLat = Math.max(0.01, (maxLat - minLat) * 0.4)
    const padLon = Math.max(0.01, (maxLon - minLon) * 0.4)
    const bbox = `${minLon - padLon},${minLat - padLat},${maxLon + padLon},${maxLat + padLat}`
    // Usiamo l'endpoint pubblico di Geoapify (1000 richieste/giorno gratuite senza key)
    const url = `https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=${width}&height=${height}&area=rect:${bbox}&apiKey=a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7`
    // Se non funziona, fallback immediato all'SVG
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
      const buf = await res.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      return `data:image/png;base64,${b64}`
    }
  } catch { /* silenzioso — fallback a SVG */ }

  // Fallback: SVG cartografico costruito dalle coordinate
  const svg = buildMapSVG(coords, width, height)
  return svgToPng(svg, width, height)
}

// ─── Entry point principale ───────────────────────────────────────────────

export async function generateAnalysisPDF(analysis: AnalysisResult): Promise<void> {
  // Import dinamico per evitare SSR issues
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210; const H = 297

  // ─── Utility helpers ──────────────────────────────────────────────────
  const setFont = (size: number, style: 'normal' | 'bold' = 'normal', color: [number,number,number] = COLORS.dark) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', style)
    doc.setTextColor(...color)
  }
  const fillRect = (x: number, y: number, w: number, h: number, color: [number,number,number]) => {
    doc.setFillColor(...color)
    doc.roundedRect(x, y, w, h, 2, 2, 'F')
  }
  const line = (x1: number, y1: number, x2: number, y2: number, color: [number,number,number] = COLORS.light, lw = 0.3) => {
    doc.setDrawColor(...color)
    doc.setLineWidth(lw)
    doc.line(x1, y1, x2, y2)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PAGINA 1 — COVER
  // ═══════════════════════════════════════════════════════════════════════

  // Sfondo header cover
  doc.setFillColor(...COLORS.dark)
  doc.rect(0, 0, W, 70, 'F')

  // Striscia accent
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 70, W, 3, 'F')

  // Logo testuale GeoBridge
  setFont(28, 'bold', COLORS.white)
  doc.text('Geo', 15, 30)
  doc.setTextColor(...COLORS.primary)
  doc.text('Bridge', 15 + doc.getTextWidth('Geo'), 30)

  setFont(10, 'normal', [148, 163, 184])
  doc.text('Satellite Risk Analysis Platform', 15, 39)

  // Linea divisoria nel header
  doc.setDrawColor(255, 255, 255, 30)
  doc.setLineWidth(0.3)
  doc.line(15, 44, W - 15, 44)

  // Tipo documento
  setFont(9, 'normal', [100, 116, 139])
  doc.text('REPORT DI ANALISI RISCHIO ASSICURATIVO', 15, 53)
  setFont(11, 'normal', [148, 163, 184])
  doc.text('Dati Sentinel-2 simulati [MOCK]', 15, 60)

  // Data generazione (in alto a destra nel header)
  setFont(8, 'normal', [100, 116, 139])
  const genDate = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(`Generato il ${genDate}`, W - 15, 53, { align: 'right' })
  doc.text(`Ref. ID: ${analysis.id.slice(0, 12).toUpperCase()}`, W - 15, 60, { align: 'right' })

  // ── Titolo analisi ──
  let y = 85
  setFont(20, 'bold', COLORS.dark)
  const titleLines = doc.splitTextToSize(analysis.title, W - 30) as string[]
  doc.text(titleLines, 15, y)
  y += titleLines.length * 9 + 4

  if (analysis.address) {
    setFont(10, 'normal', COLORS.mid)
    doc.text(`📍 ${analysis.address}`, 15, y)
    y += 8
  }

  // ── Metadati grid ──
  y += 4
  const meta = [
    { label: 'Tipo area',        value: analysis.areaType === 'rectangle' ? 'Rettangolo' : analysis.areaType === 'lasso' ? 'Zona libera' : 'Poligono' },
    { label: 'Superficie',       value: formatArea(analysis.area) },
    { label: 'Periodo analisi',  value: `${formatDate(analysis.startDate)} — ${formatDate(analysis.endDate)}` },
    { label: 'Periodi analizzati', value: `${analysis.periods.length} semestri` },
    { label: 'Data analisi',     value: formatDate(analysis.createdAt) },
    { label: 'Modalità',         value: (analysis as {analysisMode?: string}).analysisMode === 'snapshot' ? 'Snapshot (situazione attuale)' : 'Serie Storica' },
  ]
  const colW = (W - 30) / 2
  meta.forEach((m, i) => {
    const col = i % 2; const row = Math.floor(i / 2)
    const mx = 15 + col * colW; const my = y + row * 14
    fillRect(mx, my - 5, colW - 4, 12, COLORS.light)
    setFont(7, 'normal', [100, 116, 139])
    doc.text(m.label.toUpperCase(), mx + 3, my + 0)
    setFont(9, 'bold', COLORS.dark)
    doc.text(m.value, mx + 3, my + 5)
  })
  y += Math.ceil(meta.length / 2) * 14 + 8

  // ── Score composito grande ──
  const gaugeSize = 110
  const gaugePng = await svgToPng(buildGaugeSVG(analysis.compositeScore, analysis.compositeLevel, gaugeSize * 2), gaugeSize * 2, gaugeSize * 2)

  // Box score
  const scoreBoxY = y
  fillRect(15, scoreBoxY, W - 30, 55, COLORS.light)

  // Gauge image
  if (gaugePng) {
    doc.addImage(gaugePng, 'PNG', 18, scoreBoxY + 3, 50, 50)
  }

  // Testo accanto al gauge
  setFont(9, 'normal', [100, 116, 139])
  doc.text('RISCHIO COMPOSITO', 75, scoreBoxY + 12)
  setFont(24, 'bold', COLORS.dark)
  doc.text(`${analysis.compositeScore}/100`, 75, scoreBoxY + 25)

  // Badge livello
  const [rr, rg, rb] = riskColor(analysis.compositeLevel)
  fillRect(75, scoreBoxY + 28, 28, 9, [rr, rg, rb])
  setFont(8, 'bold', COLORS.white)
  doc.text(riskLabel(analysis.compositeLevel), 89, scoreBoxY + 34, { align: 'center' })

  // Sommario (testo breve)
  setFont(8, 'normal', COLORS.mid)
  const summaryLines = doc.splitTextToSize(analysis.summary, W - 30 - 75) as string[]
  doc.text(summaryLines.slice(0, 3), 75, scoreBoxY + 42)

  y = scoreBoxY + 60

  // ── Mappa area ──
  setFont(11, 'bold', COLORS.dark)
  doc.text('Area analizzata', 15, y + 8)
  y += 12

  let mapY = y
  const mapW = W - 30; const mapH = 60
  fillRect(15, mapY, mapW, mapH, COLORS.light)

  // Tenta caricamento mappa (SVG cartografico come fallback garantito)
  try {
    const mapImg = await buildMapImage(analysis.coordinates, 600, 240)
    if (mapImg) {
      doc.addImage(mapImg, 'PNG', 15, mapY, mapW, mapH)
    }
  } catch {
    setFont(8, 'normal', [148, 163, 184])
    doc.text('Mappa non disponibile', W / 2, mapY + mapH / 2, { align: 'center' })
  }

  // Overlay coordinate su mappa
  doc.setFillColor(0, 0, 0, 40)
  doc.rect(15, mapY + mapH - 9, mapW, 9, 'F')
  setFont(7, 'normal', COLORS.white)
  if (analysis.coordinates.length) {
    const lat = (analysis.coordinates.reduce((s,c) => s + c[0], 0) / analysis.coordinates.length).toFixed(4)
    const lon = (analysis.coordinates.reduce((s,c) => s + c[1], 0) / analysis.coordinates.length).toFixed(4)
    doc.text(`Centro: ${lat}°N  ${lon}°E  ·  ${analysis.coordinates.length} vertici`, 18, mapY + mapH - 3)
  }
  doc.text('© OpenStreetMap contributors', W - 18, mapY + mapH - 3, { align: 'right' })

  y = mapY + mapH + 6

  // ─── Footer pagina 1 ──
  line(15, H - 15, W - 15, H - 15)
  setFont(7, 'normal', [148, 163, 184])
  doc.text('GeoBridge — Satellite Risk Analysis Platform  ·  Dati simulati [MOCK]  ·  Non costituisce valutazione assicurativa certificata', W / 2, H - 10, { align: 'center' })
  doc.text('1', W - 15, H - 10, { align: 'right' })

  // ═══════════════════════════════════════════════════════════════════════
  // PAGINA 2 — CATEGORIE DI RISCHIO + INDICI SPETTRALI
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage()
  y = 20

  // Header pagina
  fillRect(0, 0, W, 14, COLORS.dark)
  setFont(8, 'bold', COLORS.white)
  doc.text('GEOBRIDGE  ·  CATEGORIE DI RISCHIO', 15, 9)
  setFont(7, 'normal', [148, 163, 184])
  doc.text(analysis.title, W - 15, 9, { align: 'right' })

  y = 22

  // ── Categorie ──
  setFont(13, 'bold', COLORS.dark)
  doc.text('Categorie di Rischio', 15, y)
  y += 8

  analysis.categories.forEach(cat => {
    if (y > H - 30) { doc.addPage(); y = 22 }

    const [cr, cg, cb] = riskColor(cat.level)
    fillRect(15, y, W - 30, 28, COLORS.light)

    // Barra colorata a sinistra
    doc.setFillColor(cr, cg, cb)
    doc.roundedRect(15, y, 3, 28, 1, 1, 'F')

    // Nome categoria
    setFont(10, 'bold', COLORS.dark)
    doc.text(cat.name, 22, y + 7)

    // Score
    setFont(14, 'bold', [cr, cg, cb])
    doc.text(`${cat.score}`, W - 25, y + 8, { align: 'right' })
    setFont(7, 'normal', COLORS.mid)
    doc.text('/100', W - 15, y + 8, { align: 'right' })

    // Badge livello
    fillRect(W - 50, y + 1, 18, 7, [cr, cg, cb])
    setFont(6, 'bold', COLORS.white)
    doc.text(riskLabel(cat.level), W - 41, y + 6, { align: 'center' })

    // Barra progresso
    const barX = 22; const barY = y + 12; const barW = W - 30 - 7 - 40; const barH = 3
    fillRect(barX, barY, barW, barH, [220, 232, 240])
    const fillW = (cat.score / 100) * barW
    doc.setFillColor(cr, cg, cb)
    doc.roundedRect(barX, barY, fillW, barH, 1, 1, 'F')

    // Descrizione
    setFont(7, 'normal', COLORS.mid)
    const descLines = doc.splitTextToSize(cat.description, W - 30 - 10) as string[]
    doc.text(descLines[0] ?? '', 22, y + 20)

    // Fattori
    const factorsStr = cat.factors.join('  ·  ')
    setFont(6.5, 'normal', [100, 116, 139])
    doc.text(doc.splitTextToSize(factorsStr, W - 30 - 10)[0] ?? '', 22, y + 25)

    y += 32
  })

  y += 4
  line(15, y, W - 15, y)
  y += 8

  // ── Indici spettrali ──
  setFont(13, 'bold', COLORS.dark)
  doc.text('Indici Spettrali', 15, y)
  setFont(8, 'normal', [100, 116, 139])
  doc.text('Derivati da immagini Sentinel-2 [SIMULATI]', 15, y + 6)
  y += 14

  // Intestazione tabella
  const cols = { name: 15, full: 42, value: 128, trend: 148, interp: 162 }
  fillRect(15, y, W - 30, 8, COLORS.dark)
  setFont(7, 'bold', COLORS.white)
  ;(['Indice', 'Nome completo', 'Valore', 'Trend', 'Interpretazione']).forEach((h, i) => {
    const xs = [cols.name, cols.full, cols.value, cols.trend, cols.interp]
    doc.text(h, xs[i] + 2, y + 5.5)
  })
  y += 9

  analysis.indices.forEach((idx, i) => {
    if (y > H - 30) { doc.addPage(); y = 22 }
    if (i % 2 === 0) fillRect(15, y, W - 30, 10, [248, 250, 252])
    setFont(8, 'bold', COLORS.dark)
    doc.text(idx.name, cols.name + 2, y + 7)
    setFont(7, 'normal', COLORS.mid)
    doc.text(doc.splitTextToSize(idx.fullName, 82)[0] ?? '', cols.full + 2, y + 7)
    const val = idx.value.toFixed(3)
    const valColor: [number,number,number] = idx.value > 0.4 ? COLORS.basso : idx.value > 0.1 ? COLORS.medio : COLORS.critico
    setFont(8, 'bold', valColor)
    doc.text(val, cols.value + 2, y + 7)
    const trendStr = idx.trend === 'improving' ? '▲ miglioramento' : idx.trend === 'degrading' ? '▼ peggioramento' : '— stabile'
    const trendColor: [number,number,number] = idx.trend === 'improving' ? COLORS.basso : idx.trend === 'degrading' ? COLORS.critico : COLORS.mid
    setFont(7, 'normal', trendColor)
    doc.text(trendStr, cols.trend + 2, y + 7)
    setFont(7, 'normal', COLORS.mid)
    doc.text(doc.splitTextToSize(idx.interpretation, 44)[0] ?? '', cols.interp + 2, y + 7)
    y += 10
  })

  // Footer
  line(15, H - 15, W - 15, H - 15)
  setFont(7, 'normal', [148, 163, 184])
  doc.text('GeoBridge — Satellite Risk Analysis Platform  ·  Dati simulati [MOCK]  ·  Non costituisce valutazione assicurativa certificata', W / 2, H - 10, { align: 'center' })
  doc.text('2', W - 15, H - 10, { align: 'right' })

  // ═══════════════════════════════════════════════════════════════════════
  // PAGINA 3 — TIMELINE + TABELLA PERIODI
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage()

  fillRect(0, 0, W, 14, COLORS.dark)
  setFont(8, 'bold', COLORS.white)
  doc.text('GEOBRIDGE  ·  ANALISI TEMPORALE', 15, 9)
  setFont(7, 'normal', [148, 163, 184])
  doc.text(analysis.title, W - 15, 9, { align: 'right' })

  y = 22
  setFont(13, 'bold', COLORS.dark)
  doc.text('Evoluzione Temporale del Rischio', 15, y)
  setFont(8, 'normal', [100, 116, 139])
  doc.text('Andamento semestrale degli indici di rischio composito', 15, y + 6)
  y += 16

  // Grafico timeline
  if (analysis.periods.length > 0) {
    const chartW = W - 30; const chartH = 70
    const chartSvg = buildTimelineSVG(analysis.periods, chartW * 3.78, chartH * 3.78)
    const chartPng = await svgToPng(chartSvg, chartW * 3.78, (chartH + 14) * 3.78)
    if (chartPng) {
      doc.addImage(chartPng, 'PNG', 15, y, chartW, chartH + 14)
      y += chartH + 18
    }
  }

  y += 4
  setFont(10, 'bold', COLORS.dark)
  doc.text('Dettaglio per periodo', 15, y)
  y += 8

  // Tabella periodi
  const tCols = { period: 15, ndvi: 48, ndmi: 63, nbr: 78, ndbi: 93, veg: 108, water: 121, urban: 134, fire: 147, comp: 162 }
  const tHeaders = ['Periodo', 'NDVI', 'NDMI', 'NBR', 'NDBI', 'Veg.', 'Idrico', 'Urbano', 'Incendio', 'Composito']
  const tXs = Object.values(tCols)

  fillRect(15, y, W - 30, 8, COLORS.dark)
  setFont(6.5, 'bold', COLORS.white)
  tHeaders.forEach((h, i) => doc.text(h, tXs[i] + 1, y + 5.5))
  y += 9

  analysis.periods.forEach((p, i) => {
    if (y > H - 30) {
      // Footer e nuova pagina
      line(15, H - 15, W - 15, H - 15)
      setFont(7, 'normal', [148, 163, 184])
      doc.text('GeoBridge — Dati simulati [MOCK]', W / 2, H - 10, { align: 'center' })
      doc.addPage()
      fillRect(0, 0, W, 14, COLORS.dark)
      setFont(8, 'bold', COLORS.white)
      doc.text('GEOBRIDGE  ·  ANALISI TEMPORALE (segue)', 15, 9)
      y = 22
      fillRect(15, y, W - 30, 8, COLORS.dark)
      setFont(6.5, 'bold', COLORS.white)
      tHeaders.forEach((h, i) => doc.text(h, tXs[i] + 1, y + 5.5))
      y += 9
    }
    if (i % 2 === 0) fillRect(15, y, W - 30, 9, [248, 250, 252])

    setFont(6.5, 'bold', COLORS.dark)
    doc.text(p.period, tCols.period + 1, y + 6)
    setFont(6.5, 'normal', COLORS.mid)
    ;[p.ndvi, p.ndmi, p.nbr, p.ndbi].forEach((v, vi) => {
      const xs = [tCols.ndvi, tCols.ndmi, tCols.nbr, tCols.ndbi]
      doc.text(v.toFixed(2), xs[vi] + 1, y + 6)
    })
    // Risk badges mini
    ;[p.vegetationRisk, p.waterRisk, p.urbanRisk, p.fireRisk].forEach((s, ri) => {
      const xs = [tCols.veg, tCols.water, tCols.urban, tCols.fire]
      const lvl: RiskLevel = s < 25 ? 'basso' : s < 50 ? 'medio' : s < 75 ? 'alto' : 'critico'
      const [cr, cg, cb] = riskColor(lvl)
      fillRect(xs[ri], y + 1.5, 11, 6, [cr, cg, cb])
      setFont(5.5, 'bold', COLORS.white)
      doc.text(`${s}`, xs[ri] + 5.5, y + 6, { align: 'center' })
    })
    setFont(7, 'bold', riskColor(p.riskLevel))
    doc.text(`${p.compositeRisk}`, tCols.comp + 5, y + 6, { align: 'center' })
    y += 9
  })

  line(15, H - 15, W - 15, H - 15)
  setFont(7, 'normal', [148, 163, 184])
  doc.text('GeoBridge — Satellite Risk Analysis Platform  ·  Dati simulati [MOCK]  ·  Non costituisce valutazione assicurativa certificata', W / 2, H - 10, { align: 'center' })
  doc.text('3', W - 15, H - 10, { align: 'right' })

  // ═══════════════════════════════════════════════════════════════════════
  // PAGINA 4 — RACCOMANDAZIONI + DISCLAIMER
  // ═══════════════════════════════════════════════════════════════════════
  doc.addPage()

  fillRect(0, 0, W, 14, COLORS.dark)
  setFont(8, 'bold', COLORS.white)
  doc.text('GEOBRIDGE  ·  RACCOMANDAZIONI E DISCLAIMER', 15, 9)
  setFont(7, 'normal', [148, 163, 184])
  doc.text(analysis.title, W - 15, 9, { align: 'right' })

  y = 22
  setFont(13, 'bold', COLORS.dark)
  doc.text('Raccomandazioni Operative', 15, y)
  setFont(8, 'normal', [100, 116, 139])
  doc.text('Azioni consigliate sulla base dei risultati dell\'analisi', 15, y + 6)
  y += 16

  analysis.recommendations.forEach((rec, i) => {
    if (y > H - 60) { doc.addPage(); y = 22 }
    // Numero cerchio
    doc.setFillColor(...COLORS.primary)
    doc.circle(19, y + 4, 4, 'F')
    setFont(8, 'bold', COLORS.white)
    doc.text(`${i + 1}`, 19, y + 6.5, { align: 'center' })
    // Testo
    setFont(9, 'normal', COLORS.dark)
    const recLines = doc.splitTextToSize(rec, W - 30 - 12) as string[]
    doc.text(recLines, 26, y + 5)
    y += recLines.length * 5 + 8
  })

  // ── Sezione GeoSync ──
  y += 4
  fillRect(15, y, W - 30, 20, [236, 252, 243])
  doc.setDrawColor(...COLORS.primary)
  doc.setLineWidth(0.5)
  doc.roundedRect(15, y, W - 30, 20, 2, 2, 'S')
  setFont(9, 'bold', COLORS.primary)
  doc.text('Passo successivo: dati reali Sentinel-2', 20, y + 8)
  setFont(8, 'normal', [22, 101, 52])
  doc.text('Collegare GeoSync con credenziali Sentinel Hub per analisi satellitari certificate e valutazioni di rischio assicurativo reali.', 20, y + 15, { maxWidth: W - 40 })
  y += 28

  // ─── DISCLAIMER / FIRMA ASSICURATIVA ─────────────────────────────────────
  // Spazio riservato fisso in fondo alla pagina:
  //   - 36mm per blocco firma
  //   - 12mm per footer
  // Il testo del disclaimer può occupare SOLO lo spazio disponibile sopra.
  const SIGN_H   = 36   // altezza blocco firma
  const FOOTER_H = 12   // altezza footer
  const signY    = H - SIGN_H - FOOTER_H   // posizione Y della firma (sempre fissa)

  // Se le raccomandazioni hanno già riempito troppo, vai a pagina nuova
  if (y > signY - 50) {
    doc.addPage()
    fillRect(0, 0, W, 14, COLORS.dark)
    setFont(8, 'bold', COLORS.white)
    doc.text('GEOBRIDGE  ·  DISCLAIMER E FIRMA', 15, 9)
    setFont(7, 'normal', [148, 163, 184])
    doc.text(analysis.title, W - 15, 9, { align: 'right' })
    y = 22
  } else {
    y += 6
  }

  line(15, y, W - 15, y, COLORS.mid, 0.5)
  y += 6

  setFont(10, 'bold', COLORS.dark)
  doc.text('Disclaimer e Informativa Legale', 15, y)
  y += 7

  const disclaimerParagraphs = [
    'Il presente documento è generato automaticamente dalla piattaforma GeoBridge e ha carattere esclusivamente informativo e orientativo.',
    'I dati e gli indici spettrali contenuti nel report sono basati su dati simulati (MOCK) e non rappresentano misurazioni reali da immagini satellitari Sentinel-2 dell\'ESA. I valori di rischio non costituiscono perizie assicurative, valutazioni tecniche certificate né raccomandazioni di investimento.',
    'Il report non sostituisce una valutazione professionale del rischio. Qualsiasi decisione assicurativa, finanziaria o tecnica basata su questi contenuti è sotto esclusiva responsabilità del richiedente.',
    'GeoBridge e i suoi sviluppatori declinano ogni responsabilità per danni diretti o indiretti derivanti dall\'utilizzo di queste informazioni.',
    'In fase di produzione i dati simulati verranno sostituiti da indici spettrali reali Sentinel-2 tramite il modulo GeoSync.',
  ]

  setFont(7.5, 'normal', COLORS.mid)
  const lineH = 4.3
  for (const para of disclaimerParagraphs) {
    // Lascia almeno 6mm di margine sopra la firma
    if (y >= signY - 6) break
    const wrappedLines = doc.splitTextToSize(para, W - 30) as string[]
    for (const ln of wrappedLines) {
      if (y >= signY - 6) break
      doc.text(ln, 15, y)
      y += lineH
    }
    y += 2   // spazio tra paragrafi
  }

  // ── Firma / timbro — ancorata a signY (posizione fissa) ──────────────────
  line(15, signY, W - 15, signY, COLORS.light)

  // Sinistra: dati generazione
  setFont(8, 'bold', COLORS.dark)
  doc.text('Generato da', 15, signY + 7)
  setFont(9, 'bold', COLORS.primary)
  doc.text('GeoBridge Platform', 15, signY + 14)
  setFont(7, 'normal', COLORS.mid)
  doc.text(`Data: ${genDate}`, 15, signY + 20)
  doc.text(`ID Report: ${analysis.id.slice(0, 16).toUpperCase()}`, 15, signY + 26)

  // Destra: box firma — altezza 30mm, con 3mm di margine sopra il footer
  doc.setDrawColor(...COLORS.light)
  doc.setLineWidth(0.4)
  doc.roundedRect(W - 82, signY + 2, 67, 30, 2, 2, 'S')
  setFont(7, 'normal', [148, 163, 184])
  doc.text('Firma tecnico responsabile', W - 48.5, signY + 10, { align: 'center' })
  line(W - 77, signY + 23, W - 20, signY + 23, COLORS.light, 0.3)
  setFont(6, 'normal', [148, 163, 184])
  doc.text('Data e timbro', W - 48.5, signY + 28, { align: 'center' })

  // Footer — ancorato esattamente a H - FOOTER_H
  line(15, H - FOOTER_H, W - 15, H - FOOTER_H)
  setFont(7, 'normal', [148, 163, 184])
  doc.text('GeoBridge — Satellite Risk Analysis Platform  ·  Dati simulati [MOCK]  ·  Non costituisce valutazione assicurativa certificata', W / 2, H - FOOTER_H + 5, { align: 'center' })
  doc.text('4', W - 15, H - FOOTER_H + 5, { align: 'right' })

  // ── Salva ──
  const filename = `GeoBridge_Report_${analysis.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}_${analysis.id.slice(0, 8)}.pdf`
  doc.save(filename)
}
