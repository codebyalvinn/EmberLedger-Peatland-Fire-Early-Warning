import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceSnapshot } from "../src/lib/types";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const sourceText = await readFile(
    resolve(projectRoot, "public/data/source-snapshot.json"),
    "utf8",
  );
  const sources = JSON.parse(sourceText) as SourceSnapshot;
  const nodes = sources.weatherNodes;
  if (!nodes.length) throw new Error("No weather nodes are available to probe.");

  const params = new URLSearchParams({
    latitude: nodes.map(({ lat }) => lat).join(","),
    longitude: nodes.map(({ lon }) => lon).join(","),
    daily: "precipitation_sum,temperature_2m_max",
    past_days: "92",
    forecast_days: "7",
    timezone: "auto",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  console.info(`Requesting actual Open-Meteo response for ${nodes.length} grid nodes.`);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  const text = await response.text();
  console.info(`HTTP ${response.status}`);
  console.info(text);
  if (!response.ok) {
    throw new Error(`Open-Meteo probe failed with HTTP ${response.status}`);
  }
}

void main().catch((error: unknown) => {
  console.error("Open-Meteo probe failed.", error);
  process.exitCode = 1;
});
