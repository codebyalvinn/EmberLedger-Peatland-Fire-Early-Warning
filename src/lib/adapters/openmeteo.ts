import { withTtlCache } from "@/lib/cache";
import type { WeatherDay } from "@/lib/types";

const cacheDurationMs = 60 * 60 * 1_000;

type OpenMeteoLocation = {
  daily?: {
    time?: unknown;
    precipitation_sum?: unknown;
    temperature_2m_max?: unknown;
  };
};

function parseLocation(location: OpenMeteoLocation, index: number): WeatherDay[] {
  const daily = location.daily;
  if (
    !daily ||
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.precipitation_sum) ||
    !Array.isArray(daily.temperature_2m_max)
  ) {
    throw new Error(`Open-Meteo location ${index} is missing expected daily fields`);
  }
  const times = daily.time;
  const precipitation = daily.precipitation_sum;
  const temperatures = daily.temperature_2m_max;
  if (
    times.length !== precipitation.length ||
    times.length !== temperatures.length
  ) {
    throw new Error(`Open-Meteo daily arrays differ in length at location ${index}`);
  }
  return times.map((date, dayIndex) => {
    const precipitationMm = Number(precipitation[dayIndex]);
    const maxTemperatureC = Number(temperatures[dayIndex]);
    if (
      typeof date !== "string" ||
      !Number.isFinite(precipitationMm) ||
      !Number.isFinite(maxTemperatureC)
    ) {
      throw new Error(`Open-Meteo returned invalid daily values at location ${index}`);
    }
    return { date, precipitationMm, maxTemperatureC };
  });
}

export async function fetchOpenMeteoBulk(
  locations: ReadonlyArray<{ id: string; lon: number; lat: number }>,
): Promise<Map<string, WeatherDay[]>> {
  if (!locations.length) return new Map();
  const latitudes = locations.map(({ lat }) => lat).join(",");
  const longitudes = locations.map(({ lon }) => lon).join(",");
  const params = new URLSearchParams({
    latitude: latitudes,
    longitude: longitudes,
    daily: "precipitation_sum,temperature_2m_max",
    past_days: "92",
    forecast_days: "7",
    timezone: "auto",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;

  return withTtlCache(`openmeteo:${latitudes}:${longitudes}`, cacheDurationMs, async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) {
      throw new Error(`Open-Meteo request failed with HTTP ${response.status}`);
    }
    const body: unknown = await response.json();
    const results = Array.isArray(body) ? body : [body];
    if (results.length !== locations.length) {
      throw new Error(
        `Open-Meteo returned ${results.length} locations for ${locations.length} requested nodes`,
      );
    }

    return new Map(
      results.map((item, index) => {
        if (typeof item !== "object" || item === null) {
          throw new Error(`Open-Meteo result ${index} is not an object`);
        }
        return [locations[index].id, parseLocation(item, index)];
      }),
    );
  });
}
