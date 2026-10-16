import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTtlCache } from "../cache";
import { fetchFirmsHotspots, parseFirmsCsv } from "./firms";

const header =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight";

function row(date: string, lon: number) {
  return `-2.75,${lon},367,0.4,0.4,${date},635,N,VIIRS,h,2.0NRT,300,12,D`;
}

describe("NASA FIRMS adapter", () => {
  afterEach(() => {
    clearTtlCache();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parses the observed area CSV columns", () => {
    expect(parseFirmsCsv(`${header}\n${row("2026-10-16", 113.75)}`)).toEqual([
      {
        id: "firms-2026-10-16-635-N--2.75-113.75",
        lon: 113.75,
        lat: -2.75,
        date: "2026-10-16",
        confidence: "h",
      },
    ]);
  });

  it("combines dated five- and two-day requests into a seven-day window", async () => {
    vi.stubEnv("FIRMS_MAP_KEY", "test-map-key");
    vi.stubEnv("FIRMS_SOURCE", "VIIRS_SNPP_NRT");
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        requests.push(url);
        const csv = url.includes("/2/")
          ? `${header}\n${row("2026-10-10", 113.75)}\n${row("2026-10-11", 113.76)}`
          : `${header}\n${row("2026-10-12", 113.77)}\n${row("2026-10-15", 113.78)}`;
        return new Response(csv);
      }),
    );

    const results = await fetchFirmsHotspots(7, "2026-10-16");

    expect(requests).toHaveLength(2);
    expect(requests.some((url) => url.endsWith("/5/2026-10-12"))).toBe(true);
    expect(requests.some((url) => url.endsWith("/2/2026-10-10"))).toBe(true);
    expect(results.map(({ date }) => date)).toEqual([
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-15",
    ]);
  });

  it("rejects response headers that differ from the probed CSV schema", () => {
    expect(() => parseFirmsCsv("lat,lon,date\n-2.75,113.75,2026-10-16"))
      .toThrow("FIRMS CSV header did not match expected documented fields");
  });
});
