import { describe, expect, it } from "vitest";
import { SNAPSHOT_DATE } from "../config";
import type { SourceSnapshot, WeatherDay } from "../types";
import { buildRiskCollection, type GridFeature } from "./snapshot";

function dateBefore(date: string, days: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

describe("risk snapshot horizons", () => {
  it("builds distinct scores for now, +3 days, and +7 days", () => {
    const history: WeatherDay[] = Array.from({ length: 31 }, (_, index) => ({
      date: dateBefore(SNAPSHOT_DATE, 30 - index),
      precipitationMm: 0,
      maxTemperatureC: 32,
    }));
    const forecastDays: WeatherDay[] = Array.from({ length: 7 }, (_, index) => ({
      date: dateBefore(SNAPSHOT_DATE, -(index + 1)),
      precipitationMm: 0,
      maxTemperatureC: 32,
    }));
    const sources: SourceSnapshot = {
      snapshotDate: SNAPSHOT_DATE,
      scenario: true,
      sourceStatus: {
        firms: "test fixture",
        gfw: "test fixture",
        openMeteo: "test fixture",
        overpass: "test fixture",
        peat: "test fixture",
      },
      weatherNodes: [{
        id: "weather-test",
        lon: 113.79,
        lat: -2.78,
        days: history,
        forecastDays,
      }],
      hotspots: { type: "FeatureCollection", features: [] },
      alerts: { type: "FeatureCollection", features: [] },
      villages: [],
      replayDates: [],
    };
    const grid: GridFeature[] = [{
      type: "Feature",
      id: "cell-test",
      properties: { id: "cell-test", lon: 113.79, lat: -2.78 },
      geometry: {
        type: "Polygon",
        coordinates: [[[113.78, -2.79], [113.8, -2.79], [113.8, -2.77], [113.78, -2.79]]],
      },
    }];

    const [now, threeDays, sevenDays] = ([0, 3, 7] as const).map((horizon) =>
      buildRiskCollection(grid, sources, horizon, SNAPSHOT_DATE).features[0]
        .properties,
    );

    expect(now.dc).toBeLessThan(threeDays.dc);
    expect(threeDays.dc).toBeLessThan(sevenDays.dc);
    expect(Math.round(now.risk)).not.toBe(Math.round(threeDays.risk));
    expect(Math.round(threeDays.risk)).not.toBe(Math.round(sevenDays.risk));
  });
});
