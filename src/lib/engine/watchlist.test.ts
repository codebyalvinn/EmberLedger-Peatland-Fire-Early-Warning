import { describe, expect, it } from "vitest";
import type { RiskCollection, SourceSnapshot, Village } from "../types";
import { rankVillages } from "./watchlist";

const village: Village = {
  id: "village-1",
  name: "Desa Contoh",
  lon: 113.75,
  lat: -2.75,
  source: "illustrative scenario",
};

function makeRisk(id: string, lon: number, risk: number): RiskCollection["features"][number] {
  return {
    type: "Feature",
    id,
    properties: {
      id,
      lon,
      lat: -2.75,
      dc: 400,
      dry: 0.5,
      clear: 0.5,
      hot: 0,
      peatFrac: 0.8,
      alertCount: 5,
      hotspotCount: 0,
      risk,
      dryContribution: 10,
      clearContribution: risk - 10,
      hotContribution: 0,
      synergyContribution: 0,
      horizon: 0,
      scenario: true,
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[lon, -2.76], [lon + 0.01, -2.76], [lon + 0.01, -2.75], [lon, -2.76]]],
    },
  };
}

describe("village watch-list", () => {
  it("ranks by the maximum risk cell within five kilometres", () => {
    const risk: RiskCollection = {
      type: "FeatureCollection",
      features: [
        makeRisk("cell-low", 113.76, 25),
        makeRisk("cell-high", 113.78, 80),
        makeRisk("cell-far", 114.5, 100),
      ],
    };
    const emptyAlerts: SourceSnapshot["alerts"] = {
      type: "FeatureCollection",
      features: [],
    };
    const ranked = rankVillages([village], risk, emptyAlerts, 10);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].cellId).toBe("cell-high");
    expect(ranked[0].risk).toBe(80);
  });

  it("rejects invalid result limits", () => {
    expect(() =>
      rankVillages(
        [village],
        { type: "FeatureCollection", features: [] },
        { type: "FeatureCollection", features: [] },
        0,
      ),
    ).toThrow(/limit/);
  });
});
