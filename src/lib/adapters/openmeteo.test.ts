import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTtlCache } from "../cache";
import {
  fetchOpenMeteoArchiveBulk,
  fetchOpenMeteoBulk,
} from "./openmeteo";

describe("Open-Meteo bulk adapter", () => {
  afterEach(() => {
    clearTtlCache();
    vi.unstubAllGlobals();
  });

  it("maps the verified daily response fields to the requested weather node", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            daily_units: {
              time: "iso8601",
              precipitation_sum: "mm",
              temperature_2m_max: "°C",
            },
            daily: {
              time: ["2026-10-15", "2026-10-16"],
              precipitation_sum: [1.25, 0],
              temperature_2m_max: [30.4, 31.2],
            },
          },
        ]),
      ),
    );

    const result = await fetchOpenMeteoBulk([
      { id: "weather-test", lon: 113.75, lat: -2.75 },
    ]);

    expect(result.get("weather-test")).toEqual([
      { date: "2026-10-15", precipitationMm: 1.25, maxTemperatureC: 30.4 },
      { date: "2026-10-16", precipitationMm: 0, maxTemperatureC: 31.2 },
    ]);
  });

  it("omits forecast days with missing measurements for archive gap-filling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          {
            daily_units: {
              time: "iso8601",
              precipitation_sum: "mm",
              temperature_2m_max: "°C",
            },
            daily: {
              time: ["2026-10-15"],
              precipitation_sum: [null],
              temperature_2m_max: [30.4],
            },
          },
        ]),
      ),
    );

    const result = await fetchOpenMeteoBulk([
      { id: "weather-null", lon: 113.75, lat: -2.75 },
    ]);

    expect(result.get("weather-null")).toEqual([]);
  });

  it("requests and parses the verified Open-Meteo archive fields", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://archive-api.open-meteo.com");
      expect(url.searchParams.get("start_date")).toBe("2026-10-14");
      expect(url.searchParams.get("end_date")).toBe("2026-10-15");
      return Response.json({
        daily_units: {
          time: "iso8601",
          precipitation_sum: "mm",
          temperature_2m_max: "°C",
        },
        daily: {
          time: ["2026-10-14", "2026-10-15"],
          precipitation_sum: [0.5, 1],
          temperature_2m_max: [29.1, 30.2],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOpenMeteoArchiveBulk(
      [{ id: "weather-archive", lon: 113.75, lat: -2.75 }],
      "2026-10-14",
      "2026-10-15",
    );

    expect(result.get("weather-archive")).toEqual([
      { date: "2026-10-14", precipitationMm: 0.5, maxTemperatureC: 29.1 },
      { date: "2026-10-15", precipitationMm: 1, maxTemperatureC: 30.2 },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
