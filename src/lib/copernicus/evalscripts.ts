// Evalscript Sentinel Hub — Sentinel-2 L2A
// NOTA: dataMask NON va dichiarato né in input né in output per Statistical API
// La API gestisce automaticamente i pixel no-data tramite il filtro maxCloudCoverage

export const EVALSCRIPTS: Record<string, string> = {

  NDVI: [
    '//VERSION=3',
    'function setup() {',
    '  return {',
    '    input: [{ bands: ["B04", "B08"], units: "DN" }],',
    '    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]',
    '  };',
    '}',
    'function evaluatePixel(s) {',
    '  var d = s.B08 + s.B04;',
    '  return [d === 0 ? 0 : (s.B08 - s.B04) / d];',
    '}',
  ].join('\n'),

  NDMI: [
    '//VERSION=3',
    'function setup() {',
    '  return {',
    '    input: [{ bands: ["B8A", "B11"], units: "DN" }],',
    '    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]',
    '  };',
    '}',
    'function evaluatePixel(s) {',
    '  var d = s.B8A + s.B11;',
    '  return [d === 0 ? 0 : (s.B8A - s.B11) / d];',
    '}',
  ].join('\n'),

  NBR: [
    '//VERSION=3',
    'function setup() {',
    '  return {',
    '    input: [{ bands: ["B08", "B12"], units: "DN" }],',
    '    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]',
    '  };',
    '}',
    'function evaluatePixel(s) {',
    '  var d = s.B08 + s.B12;',
    '  return [d === 0 ? 0 : (s.B08 - s.B12) / d];',
    '}',
  ].join('\n'),

  NDBI: [
    '//VERSION=3',
    'function setup() {',
    '  return {',
    '    input: [{ bands: ["B08", "B11"], units: "DN" }],',
    '    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]',
    '  };',
    '}',
    'function evaluatePixel(s) {',
    '  var d = s.B11 + s.B08;',
    '  return [d === 0 ? 0 : (s.B11 - s.B08) / d];',
    '}',
  ].join('\n'),

  EVI: [
    '//VERSION=3',
    'function setup() {',
    '  return {',
    '    input: [{ bands: ["B02", "B04", "B08"], units: "DN" }],',
    '    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]',
    '  };',
    '}',
    'function evaluatePixel(s) {',
    '  var d = s.B08 + 6 * s.B04 - 7.5 * s.B02 + 10000;',
    '  return [d === 0 ? 0 : 2.5 * (s.B08 - s.B04) / d];',
    '}',
  ].join('\n'),

  BREI: [
    '//VERSION=3',
    'function setup() {',
    '  return {',
    '    input: [{ bands: ["B04", "B11"], units: "DN" }],',
    '    output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }]',
    '  };',
    '}',
    'function evaluatePixel(s) {',
    '  var d = s.B11 + s.B04;',
    '  return [d === 0 ? 0 : (s.B11 - s.B04) / d];',
    '}',
  ].join('\n'),

}
