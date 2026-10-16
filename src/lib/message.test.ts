import { describe, expect, it } from "vitest";
import { createAlertMessage } from "./message";
import type { WatchItem } from "./engine/watchlist";

const item: WatchItem = {
  village: {
    id: "village-1",
    name: "Desa Contoh",
    lon: 113.75,
    lat: -2.75,
    source: "illustrative scenario",
  },
  risk: 72,
  topDriver: "clear",
  contributions: { dry: 18, clear: 42, hot: 12 },
  cellId: "cell-1",
  nearestAlertKm: 1.2,
};

describe("deterministic alert templates", () => {
  it("creates an Indonesian message that avoids a fire certainty claim", () => {
    const message = createAlertMessage(item, 7, "id");
    expect(message).toContain("Desa Contoh");
    expect(message).toContain("indikasi pembukaan lahan");
    expect(message).toContain("bukan kepastian kebakaran");
    expect(message).not.toContain("probabilitas");
  });

  it("supports English as a manual API fallback", () => {
    expect(createAlertMessage(item, 0, "en")).toContain("decision support");
  });
});
