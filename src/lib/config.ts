export const AOI = {
  name: "Central Kalimantan, Indonesia",
  bounds: {
    west: 113,
    south: -3.5,
    east: 114.5,
    north: -2,
  },
  center: [113.75, -2.75] as const,
};

export const GRID_STEP_DEGREES = 0.02;
export const WEATHER_GRID_STEP_DEGREES = 0.25;
export const RISK_RADIUS_KM = 5;
export const HORIZONS = [0, 3, 7] as const;
export type Horizon = (typeof HORIZONS)[number];

export const RISK_CONFIG = {
  dcMin: 200,
  dcMax: 600,
  maxAlerts: 10,
  maxHotspots: 5,
  peatBase: 0.4,
  peatCoverageWeight: 0.6,
  weights: {
    dry: 0.5,
    clear: 0.3,
    hot: 0.2,
  },
  synergy: {
    dryThreshold: 0.6,
    clearThreshold: 0.3,
    multiplier: 1.15,
  },
  alertLookbackDays: 60,
  hotspotLookbackDays: 7,
} as const;

export const DATA_MODE_VALUES = ["snapshot", "live"] as const;
export type DataMode = (typeof DATA_MODE_VALUES)[number];

export const SNAPSHOT_DATE = "2026-10-15";
