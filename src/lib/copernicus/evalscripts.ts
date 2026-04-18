/**
 * Evalscript Sentinel Hub — Sentinel-2 L2A
 *
 * Regole Statistical API:
 *   - dataMask va dichiarato nell'INPUT (per filtrare pixel nuvolosi/no-data)
 *   - Output: bands:1, sampleType:FLOAT32 (solo il valore dell'indice)
 *   - Se dataMask===0 (pixel non valido) → restituire [NaN] per escluderlo dalle statistiche
 *   - NON restituire dataMask nell'output (causerebbe "Output dataMask requested but missing")
 */

export const EVALSCRIPTS: Record<string, string> = {

  NDVI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return [NaN];
  let d = s.B08 + s.B04;
  return [d === 0 ? 0 : (s.B08 - s.B04) / d];
}`,

  NDMI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B8A", "B11", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return [NaN];
  let d = s.B8A + s.B11;
  return [d === 0 ? 0 : (s.B8A - s.B11) / d];
}`,

  NBR: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08", "B12", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return [NaN];
  let d = s.B08 + s.B12;
  return [d === 0 ? 0 : (s.B08 - s.B12) / d];
}`,

  NDBI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08", "B11", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return [NaN];
  let d = s.B11 + s.B08;
  return [d === 0 ? 0 : (s.B11 - s.B08) / d];
}`,

  EVI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B04", "B08", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return [NaN];
  let d = s.B08 + 6 * s.B04 - 7.5 * s.B02 + 10000;
  return [d === 0 ? 0 : 2.5 * (s.B08 - s.B04) / d];
}`,

  BREI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B11", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return [NaN];
  let d = s.B11 + s.B04;
  return [d === 0 ? 0 : (s.B11 - s.B04) / d];
}`,

}
