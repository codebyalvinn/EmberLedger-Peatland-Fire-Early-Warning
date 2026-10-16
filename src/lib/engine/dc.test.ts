import { describe, expect, it } from "vitest";
import {
  droughtCodeRainStep,
  droughtCodeSeries,
  stepDroughtCode,
} from "./dc";

describe("Drought Code", () => {
  it("applies the tropical rain step near the handoff sanity value", () => {
    expect(droughtCodeRainStep(300, 50)).toBeCloseTo(160, 0);
  });

  it("accumulates 30 dry tropical days near the handoff sanity value", () => {
    const weather = Array.from({ length: 30 }, () => ({
      date: "2026-01-01",
      precipitationMm: 0,
      maxTemperatureC: 32,
    }));
    expect(droughtCodeSeries(weather, 100).at(-1)).toBeCloseTo(309, 0);
  });

  it("rejects non-finite and negative rain input", () => {
    expect(() => stepDroughtCode(100, -1, 30)).toThrow(/finite/);
    expect(() => stepDroughtCode(Number.NaN, 0, 30)).toThrow(/finite/);
  });
});
