import { AOI } from "@/lib/config";
import { withTtlCache } from "@/lib/cache";

export type FirmsHotspot = {
  id: string;
  lon: number;
  lat: number;
  date: string;
  confidence: string;
};

const cacheDurationMs = 30 * 60 * 1_000;

function parseCsv(text: string): FirmsHotspot[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  if (!headerLine || !lines.length) return [];
  const headers = headerLine.split(",").map((value) => value.trim().toLowerCase());
  const latitudeIndex = headers.indexOf("latitude");
  const longitudeIndex = headers.indexOf("longitude");
  const dateIndex = headers.indexOf("acq_date");
  const confidenceIndex = headers.indexOf("confidence");

  if ([latitudeIndex, longitudeIndex, dateIndex, confidenceIndex].includes(-1)) {
    throw new Error(`FIRMS CSV header did not match expected documented fields: ${headerLine}`);
  }

  return lines
    .filter(Boolean)
    .map((line, index) => {
      const columns = line.split(",");
      const lat = Number(columns[latitudeIndex]);
      const lon = Number(columns[longitudeIndex]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error(`FIRMS row ${index + 2} has invalid coordinates`);
      }
      return {
        id: `firms-${columns[dateIndex]}-${index}`,
        lon,
        lat,
        date: columns[dateIndex],
        confidence: columns[confidenceIndex],
      };
    });
}

export async function fetchFirmsHotspots(days = 7): Promise<FirmsHotspot[]> {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) throw new Error("FIRMS_MAP_KEY is not configured");
  const source = process.env.FIRMS_SOURCE ?? "VIIRS_SNPP_NRT";
  const { west, south, east, north } = AOI.bounds;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${encodeURIComponent(source)}/${west},${south},${east},${north}/${days}`;

  return withTtlCache(`firms:${source}:${days}`, cacheDurationMs, async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      throw new Error(`FIRMS request failed with HTTP ${response.status}`);
    }
    return parseCsv(await response.text());
  });
}
