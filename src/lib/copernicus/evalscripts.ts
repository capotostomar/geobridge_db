// Evalscript Sentinel Hub per ciascun indice.
// Tutti usano Sentinel-2 L2A (reflettanza superficiale, valori DN 0-10000).
// Output: banda singola FLOAT32 con range tipicamente -1..+1.

export const EVALSCRIPTS: Record<string, string> = {
  // Normalized Difference Vegetation Index
  // Range -1..+1. Valori > 0.6 = vegetazione densa, 0.2-0.6 = prati/coltivi, < 0.2 = suolo nudo
  NDVI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let denom = s.B08 + s.B04;
  if (denom === 0) return [NaN];
  return [(s.B08 - s.B04) / denom];
}`,

  // Normalized Difference Water Index (Gao 1996)
  // Range -1..+1. Valori > 0 = presenza acqua/umidità, < 0 = suolo/vegetazione secca
  NDWI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B08"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let denom = s.B03 + s.B08;
  if (denom === 0) return [NaN];
  return [(s.B03 - s.B08) / denom];
}`,

  // Enhanced Vegetation Index
  // Meno sensibile al suolo rispetto all'NDVI. Range tipico 0..1
  EVI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B04", "B08"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let denom = s.B08 + 6 * s.B04 - 7.5 * s.B02 + 10000;
  if (denom === 0) return [NaN];
  return [2.5 * (s.B08 - s.B04) / denom];
}`,

  // Normalized Burn Ratio
  // Range -1..+1. Valori > 0.1 = vegetazione sana, < -0.1 = area bruciata
  NBR: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08", "B12"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let denom = s.B08 + s.B12;
  if (denom === 0) return [NaN];
  return [(s.B08 - s.B12) / denom];
}`,
};
