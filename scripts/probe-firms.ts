import { loadEnvConfig } from "@next/env";
import { AOI } from "../src/lib/config";

loadEnvConfig(process.cwd());

async function main() {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) {
    throw new Error("FIRMS_MAP_KEY is required; no request was sent.");
  }

  const source = process.env.FIRMS_SOURCE ?? "VIIRS_SNPP_NRT";
  const { west, south, east, north } = AOI.bounds;
  const requests = [
    {
      label: "dated five-day window ending yesterday",
      path: `${west},${south},${east},${north}/5/${dateDaysAgo(5)}`,
    },
    {
      label: "dated two-day window preceding the latest five days",
      path: `${west},${south},${east},${north}/2/${dateDaysAgo(7)}`,
    },
  ];
  let failed = false;
  for (const { label, path } of requests) {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${encodeURIComponent(source)}/${path}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const text = await response.text();
    const lines = text.split(/\r?\n/);
    const headers = lines[0]?.split(",") ?? [];
    const dateIndex = headers.indexOf("acq_date");
    const dateCounts = new Map<string, number>();
    if (dateIndex >= 0) {
      for (const line of lines.slice(1)) {
        const date = line.split(",")[dateIndex];
        if (date) dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
      }
    }
    console.info(`\nFIRMS feed: ${source}; ${label}`);
    console.info(`HTTP ${response.status}`);
    console.info(`Observed acquisition dates: ${JSON.stringify(Object.fromEntries(dateCounts))}`);
    console.info(lines.slice(0, 21).join("\n").replaceAll(key, "[REDACTED]"));
    if (lines.length > 21) {
      console.info(`(Response truncated after 20 data rows; ${lines.length - 1} data rows returned.)`);
    }
    if (!response.ok) failed = true;
  }
  if (failed) {
    throw new Error("At least one FIRMS probe window returned a non-success status.");
  }
}

function dateDaysAgo(daysAgo: number) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Pontianak",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

void main().catch((error: unknown) => {
  console.error(
    "FIRMS probe failed.",
    error instanceof Error ? error.message : "Unknown error.",
  );
  process.exitCode = 1;
});
