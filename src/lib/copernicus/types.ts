// [west, south, east, north] in EPSG:4326
export type BBox = [number, number, number, number];

export type SatelliteIndex = "NDVI" | "NDWI" | "EVI" | "NBR";

export interface SatelliteQuery {
  bbox: BBox;
  dateFrom: string; // "YYYY-MM-DD"
  dateTo: string;   // "YYYY-MM-DD"
  index: SatelliteIndex;
}

export interface DayResult {
  date: string;
  mean: number | null;
  min: number | null;
  max: number | null;
  p25: number | null;
  p75: number | null;
  sampleCount: number;
  noDataCount: number;
}

export interface CopernicusStatisticsResponse {
  index: SatelliteIndex;
  bbox: BBox;
  dateFrom: string;
  dateTo: string;
  results: DayResult[];
}
