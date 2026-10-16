import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceSnapshot } from "../src/lib/types";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function dateInBorneo(now: Date) {
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

async function main() {
  const sourceText = await readFile(
    resolve(projectRoot, "public/data/source-snapshot.json"),
    "utf8",
  );
  const sources = JSON.parse(sourceText) as SourceSnapshot;
  const nodes = sources.weatherNodes.slice(0, 2);
  if (!nodes.length) throw new Error("No weather node is available to probe.");

  const endDate = addDays(dateInBorneo(new Date()), -1);
  const startDate = addDays(endDate, -91);
  const params = new URLSearchParams({
    latitude: nodes.map(({ lat }) => lat).join(","),
    longitude: nodes.map(({ lon }) => lon).join(","),
    start_date: startDate,
    end_date: endDate,
    daily: "precipitation_sum,temperature_2m_max",
    timezone: "auto",
  });
  const response = await fetch(
    `https://archive-api.open-meteo.com/v1/archive?${params}`,
    { signal: AbortSignal.timeout(60_000) },
  );
  const text = await response.text();
  console.info(
    `Open-Meteo archive response for ${nodes.map(({ id }) => id).join(", ")} (${startDate}–${endDate})`,
  );
  console.info(`HTTP ${response.status}`);
  console.info(text);
  if (!response.ok) {
    throw new Error(`Open-Meteo archive probe failed with HTTP ${response.status}`);
  }
}

void main().catch((error: unknown) => {
  console.error(
    "Open-Meteo archive probe failed.",
    error instanceof Error ? error.message : "Unknown error.",
  );
  process.exitCode = 1;
});
