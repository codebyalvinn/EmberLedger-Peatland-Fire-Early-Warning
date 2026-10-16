import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import type { Horizon } from "./config";

export type DemoCellProperties = {
  id: string;
  lon: number;
  lat: number;
  dc: number;
  dry: number;
  clear: number;
  hot: number;
  peatFrac: number;
  alertCount: number;
  hotspotCount: number;
  risk: number;
  dryContribution: number;
  clearContribution: number;
  hotContribution: number;
  synergyContribution: number;
  horizon: Horizon;
  scenario: true;
};

export type RiskFeature = Feature<Polygon, DemoCellProperties>;

export type RiskCollection = FeatureCollection<Polygon, DemoCellProperties>;

export type DemoEventProperties = {
  id: string;
  date: string;
  confidence: string;
  source: "illustrative scenario" | "NASA FIRMS" | "Global Forest Watch";
};

export type EventCollection = FeatureCollection<Point, DemoEventProperties>;

export type Village = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  source: "illustrative scenario" | "OpenStreetMap";
};

export type WeatherDay = {
  date: string;
  precipitationMm: number;
  maxTemperatureC: number;
};

export type WeatherNode = {
  id: string;
  lon: number;
  lat: number;
  days: WeatherDay[];
  forecastDays: WeatherDay[];
};

export type SourceSnapshot = {
  snapshotDate: string;
  scenario: true;
  sourceStatus: {
    firms: string;
    gfw: string;
    openMeteo: string;
    overpass: string;
    peat: string;
  };
  weatherNodes: WeatherNode[];
  hotspots: EventCollection;
  alerts: EventCollection;
  villages: Village[];
  replayDates: string[];
};

export type SnapshotBundle = {
  snapshotDate: string;
  scenario: true;
  cells: Record<Horizon, RiskCollection>;
};

export type ReplayBundle = {
  asOfDate: string;
  scenario: true;
  risk: RiskCollection;
  futureHotspots: EventCollection;
  alerts: EventCollection;
};

export type BacktestMetrics = {
  status: "unavailable" | "computed";
  methodology: string;
  limitation: string;
  metrics?: {
    peatCellCount: number;
    hotspotCellCount: number;
    top20HitRate: number;
    lift: number;
    precisionAtTop100: number;
    medianLeadTimeDays: number | null;
  };
};
