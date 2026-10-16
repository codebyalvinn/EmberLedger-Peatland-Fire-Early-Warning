import { AOI } from "../config";
import { withTtlCache } from "../cache";

export type FirmsHotspot = {
  id: string;
  lon: number;
  lat: number;
  date: string;
  confidence: string;
};

const cacheDurationMs = 30 * 60 * 1_000;

export function parseFirmsCsv(text: string): FirmsHotspot[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  if (!headerLine) throw new Error("FIRMS CSV response is empty.");
  const headers = headerLine.split(",").map((value) => value.trim().toLowerCase());
  const latitudeIndex = headers.indexOf("latitude");
  const longitudeIndex = headers.indexOf("longitude");
  const dateIndex = headers.indexOf("acq_date");
  const timeIndex = headers.indexOf("acq_time");
  const satelliteIndex = headers.indexOf("satellite");
  const confidenceIndex = headers.indexOf("confidence");

  if (
    [
      latitudeIndex,
      longitudeIndex,
      dateIndex,
      timeIndex,
      satelliteIndex,
      confidenceIndex,
    ].includes(-1)
  ) {
    throw new Error(`FIRMS CSV header did not match expected documented fields: ${headerLine}`);
  }

  return lines
    .filter(Boolean)
    .map((line, index) => {
      const columns = line.split(",");
      const lat = Number(columns[latitudeIndex]);
      const lon = Number(columns[longitudeIndex]);
      const date = columns[dateIndex];
      const time = columns[timeIndex];
      const satellite = columns[satelliteIndex];
      const confidence = columns[confidenceIndex];
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !/^\d{3,4}$/.test(time) ||
        !satellite ||
        !["l", "n", "h"].includes(confidence)
      ) {
        throw new Error(`FIRMS row ${index + 2} has invalid coordinates`);
      }
      return {
        id: `firms-${date}-${time}-${satellite}-${lat}-${lon}`,
        lon,
        lat,
        date,
        confidence,
      };
    });
}

function dateAtBorneo(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Pontianak",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, count: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + count);
  return result.toISOString().slice(0, 10);
}

async function requestWindow(
  key: string,
  source: string,
  days: number,
  startDate: string,
) {
  const { west, south, east, north } = AOI.bounds;
  const path = `${west},${south},${east},${north}/${days}/${startDate}`;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${encodeURIComponent(source)}/${path}`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new Error("FIRMS request failed before an HTTP response was received.", {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(`FIRMS request failed with HTTP ${response.status}`);
  }
  return parseFirmsCsv(await response.text());
}

export async function fetchFirmsHotspots(
  days = 7,
  endDate = addDays(dateAtBorneo(new Date()), -1),
): Promise<FirmsHotspot[]> {
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    throw new Error("FIRMS day range must be an integer from 1 to 7.");
  }
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) throw new Error("FIRMS_MAP_KEY is not configured");
  const source = process.env.FIRMS_SOURCE ?? "VIIRS_SNPP_NRT";

  return withTtlCache(`firms:${source}:${days}:${endDate}`, cacheDurationMs, async () => {
    const startDate = addDays(endDate, -(days - 1));
    const newerDays = Math.min(days, 5);
    const olderDays = days - newerDays;
    const windows = await Promise.all([
      requestWindow(
        key,
        source,
        newerDays,
        addDays(endDate, -(newerDays - 1)),
      ),
      ...(olderDays ? [requestWindow(key, source, olderDays, startDate)] : []),
    ]);
    const merged = new Map<string, FirmsHotspot>();
    for (const hotspot of windows.flat()) {
      if (hotspot.date >= startDate && hotspot.date <= endDate) {
        merged.set(hotspot.id, hotspot);
      }
    }
    return [...merged.values()].sort(
      (first, second) =>
        first.date.localeCompare(second.date) || first.id.localeCompare(second.id),
    );
  });
}
