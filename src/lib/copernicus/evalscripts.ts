/**
 * Evalscript Sentinel Hub per tutti gli indici usati dall'analysis engine.
 * Tutti usano Sentinel-2 L2A (reflettanza superficiale, valori DN 0-10000).
 * Output: banda singola FLOAT32, range tipicamente -1..+1.
 *
 * Nota: i valori DN di S2-L2A sono già in unità di reflettanza scalata ×10000.
 * Gli evalscript operano su quei valori raw, quindi non dividiamo per 10000
 * prima del calcolo — i rapporti si cancellano.
 */

export const EVALSCRIPTS: Record<string, string> = {

  // ── NDVI: Normalized Difference Vegetation Index ────────────────────────
  // (NIR - Red) / (NIR + Red)   |  B08=NIR, B04=Red
  // Range tipico -1..+1, vegetazione sana 0.3-0.9
  NDVI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B08 + s.B04;
  if (d === 0) return [NaN];
  return [(s.B08 - s.B04) / d];
}`,

  // ── NDMI: Normalized Difference Moisture Index ──────────────────────────
  // (NIR - SWIR1) / (NIR + SWIR1)   |  B8A=NIR narrow, B11=SWIR1
  // Range -1..+1, umidità vegetazione/suolo: >0.3 buona, <0 deficit
  NDMI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B8A", "B11"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B8A + s.B11;
  if (d === 0) return [NaN];
  return [(s.B8A - s.B11) / d];
}`,

  // ── NBR: Normalized Burn Ratio ──────────────────────────────────────────
  // (NIR - SWIR2) / (NIR + SWIR2)   |  B08=NIR, B12=SWIR2
  // Range -1..+1, aree bruciate < -0.1, vegetazione sana > 0.3
  NBR: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08", "B12"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B08 + s.B12;
  if (d === 0) return [NaN];
  return [(s.B08 - s.B12) / d];
}`,

  // ── NDBI: Normalized Difference Built-up Index ──────────────────────────
  // (SWIR1 - NIR) / (SWIR1 + NIR)   |  B11=SWIR1, B08=NIR
  // Range -1..+1, superfici artificiali >0.1, vegetazione <0
  NDBI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08", "B11"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B11 + s.B08;
  if (d === 0) return [NaN];
  return [(s.B11 - s.B08) / d];
}`,

  // ── EVI: Enhanced Vegetation Index ─────────────────────────────────────
  // 2.5 * (NIR-Red) / (NIR + 6*Red - 7.5*Blue + 10000)
  // Meno soggetto a saturazione dell'NDVI in zone dense
  EVI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B04", "B08"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B08 + 6 * s.B04 - 7.5 * s.B02 + 10000;
  if (d === 0) return [NaN];
  return [2.5 * (s.B08 - s.B04) / d];
}`,

  // ── NDWI: Normalized Difference Water Index ─────────────────────────────
  // (Green - NIR) / (Green + NIR)   |  B03=Green, B08=NIR
  // Range -1..+1, acqua superficiale >0
  NDWI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B08"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B03 + s.B08;
  if (d === 0) return [NaN];
  return [(s.B03 - s.B08) / d];
}`,

  // ── BREI: Bare Rock/soil Exposure Index ─────────────────────────────────
  // (SWIR1 - Red) / (SWIR1 + Red)   |  B11=SWIR1, B04=Red
  // Suolo nudo/roccia affiorante, valori >0.2 esposizione elevata
  BREI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B11"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B11 + s.B04;
  if (d === 0) return [NaN];
  return [(s.B11 - s.B04) / d];
}`,
}
