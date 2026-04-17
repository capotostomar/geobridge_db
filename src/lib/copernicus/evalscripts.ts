/**
 * Evalscript Sentinel Hub — Sentinel-2 L2A
 *
 * REGOLE OBBLIGATORIE per Statistical API:
 *   1. setup() deve dichiarare "dataMask" nell'input
 *   2. evaluatePixel deve restituire [valore, dataMask] (2 bande)
 *   3. output deve avere bands: 2 (indice + dataMask)
 *   4. La Statistical API usa dataMask per escludere pixel no-data/cloud
 *
 * Valori DN S2-L2A: reflettanza superficiale ×10000 (0-10000).
 */

export const EVALSCRIPTS: Record<string, string> = {

  NDVI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 2, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B08 + s.B04;
  let val = d === 0 ? 0 : (s.B08 - s.B04) / d;
  return [val, s.dataMask];
}`,

  NDMI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B8A", "B11", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 2, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B8A + s.B11;
  let val = d === 0 ? 0 : (s.B8A - s.B11) / d;
  return [val, s.dataMask];
}`,

  NBR: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08", "B12", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 2, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B08 + s.B12;
  let val = d === 0 ? 0 : (s.B08 - s.B12) / d;
  return [val, s.dataMask];
}`,

  NDBI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08", "B11", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 2, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B11 + s.B08;
  let val = d === 0 ? 0 : (s.B11 - s.B08) / d;
  return [val, s.dataMask];
}`,

  EVI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B04", "B08", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 2, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B08 + 6 * s.B04 - 7.5 * s.B02 + 10000;
  let val = d === 0 ? 0 : 2.5 * (s.B08 - s.B04) / d;
  return [val, s.dataMask];
}`,

  BREI: `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B11", "dataMask"], units: "DN" }],
    output: [{ id: "default", bands: 2, sampleType: "FLOAT32" }]
  };
}
function evaluatePixel(s) {
  let d = s.B11 + s.B04;
  let val = d === 0 ? 0 : (s.B11 - s.B04) / d;
  return [val, s.dataMask];
}`,

}
