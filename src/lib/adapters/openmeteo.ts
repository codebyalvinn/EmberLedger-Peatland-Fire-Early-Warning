import { withTtlCache } from "../cache";
import type { WeatherDay } from "../types";

const cacheDurationMs = 60 * 60 * 1_000;

type OpenMeteoLocation = {
  daily_units?: {
    time?: unknown;
    precipitation_sum?: unknown;
    temperature_2m_max?: unknown;
  };
  daily?: {
    time?: unknown;
    precipitation_sum?: unknown;
    temperature_2m_max?: unknown;
  };
};

function parseLocation(
  location: OpenMeteoLocation,
  index: number,
  allowMissingDays: boolean,
): WeatherDay[] {
  const daily = location.daily;
  const units = location.daily_units;
  if (
    !daily ||
    !units ||
    units.time !== "iso8601" ||
    units.precipitation_sum !== "mm" ||
    units.temperature_2m_max !== "°C" ||
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.precipitation_sum) ||
    !Array.isArray(daily.temperature_2m_max)
  ) {
    throw new Error(
      `Open-Meteo location ${index} is missing verified daily fields or units.`,
    );
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
  const days: WeatherDay[] = [];
  let previousDate: string | undefined;
  for (let dayIndex = 0; dayIndex < times.length; dayIndex += 1) {
    const date = times[dayIndex];
    const precipitationValue = precipitation[dayIndex];
    const temperatureValue = temperatures[dayIndex];
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      (previousDate !== undefined && date <= previousDate) ||
      (precipitationValue !== null &&
        (typeof precipitationValue !== "number" ||
          !Number.isFinite(precipitationValue))) ||
      (temperatureValue !== null &&
        (typeof temperatureValue !== "number" ||
          !Number.isFinite(temperatureValue)))
    ) {
      throw new Error(`Open-Meteo returned invalid daily values at location ${index}`);
    }
    previousDate = date;
    if (precipitationValue === null || temperatureValue === null) {
      if (allowMissingDays) continue;
      throw new Error(`Open-Meteo returned missing daily values at location ${index}`);
    }
    days.push({
      date,
      precipitationMm: precipitationValue,
      maxTemperatureC: temperatureValue,
    });
  }
  return days;
}

function parseLocations(
  body: unknown,
  locationCount: number,
  allowMissingDays: boolean,
): WeatherDay[][] {
  const results = Array.isArray(body) ? body : [body];
  if (results.length !== locationCount) {
    throw new Error(
      `Open-Meteo returned ${results.length} locations for ${locationCount} requested nodes`,
    );
  }
  return results.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Open-Meteo result ${index} is not an object`);
    }
    return parseLocation(item as OpenMeteoLocation, index, allowMissingDays);
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
    return new Map(
      parseLocations(body, locations.length, true).map((days, index) => [
        locations[index].id,
        days,
      ]),
    );
  });
}

export async function fetchOpenMeteoArchiveBulk(
  locations: ReadonlyArray<{ id: string; lon: number; lat: number }>,
  startDate: string,
  endDate: string,
): Promise<Map<string, WeatherDay[]>> {
  if (!locations.length) return new Map();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    startDate > endDate
  ) {
    throw new Error("Open-Meteo archive date range is invalid.");
  }
  const latitudes = locations.map(({ lat }) => lat).join(",");
  const longitudes = locations.map(({ lon }) => lon).join(",");
  const params = new URLSearchParams({
    latitude: latitudes,
    longitude: longitudes,
    start_date: startDate,
    end_date: endDate,
    daily: "precipitation_sum,temperature_2m_max",
    timezone: "auto",
  });
  const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;

  return withTtlCache(
    `openmeteo-archive:${latitudes}:${longitudes}:${startDate}:${endDate}`,
    cacheDurationMs,
    async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      if (!response.ok) {
        throw new Error(`Open-Meteo archive request failed with HTTP ${response.status}`);
      }
      const body: unknown = await response.json();
      const locationsDays = parseLocations(body, locations.length, false);
      return new Map(
        locationsDays.map((days, index) => {
          if (days.some(({ date }) => date < startDate || date > endDate)) {
            throw new Error(`Open-Meteo archive returned out-of-range dates at location ${index}`);
          }
          return [locations[index].id, days];
        }),
      );
    },
  );
}
