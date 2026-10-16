import { describe, expect, it } from "vitest";
import { calculateRisk } from "./risk";

describe("transparent risk index", () => {
  it("returns a peat-weighted score and keeps the component bar additive", () => {
    const result = calculateRisk({
      dc: 500,
      alertCount: 5,
      hotspotCount: 2,
      peatFrac: 1,
    });
    expect(result.risk).toBeGreaterThan(0);
    expect(
      result.dryContribution +
        result.clearContribution +
        result.hotContribution +
        result.synergyContribution,
    ).toBeCloseTo(result.risk);
  });

  it("does not apply clear-then-burn synergy below either threshold", () => {
    const result = calculateRisk({
      dc: 300,
      alertCount: 1,
      hotspotCount: 0,
      peatFrac: 0.5,
    });
    expect(result.synergyApplied).toBe(false);
    expect(result.synergyContribution).toBe(0);
  });

  it("caps input-free maximum at 100 and rejects invalid peat fraction", () => {
    expect(
      calculateRisk({
        dc: 900,
        alertCount: 100,
        hotspotCount: 100,
        peatFrac: 1,
      }).risk,
    ).toBe(100);
    expect(() =>
      calculateRisk({ dc: 300, alertCount: 0, hotspotCount: 0, peatFrac: 1.2 }),
    ).toThrow(/peatFrac/);
  });
});
