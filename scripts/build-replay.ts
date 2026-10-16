import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HORIZONS, SNAPSHOT_DATE } from "../src/lib/config";
import { readPeatFractionsIfAvailable } from "../src/lib/engine/peat";
import { buildRiskCollection, type GridFeature } from "../src/lib/engine/snapshot";
import type { EventCollection, ReplayBundle, SourceSnapshot } from "../src/lib/types";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = resolve(projectRoot, "public/data");

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function eventsBetween(
  source: EventCollection,
  startExclusive: string,
  endInclusive: string,
): EventCollection {
  return {
    ...source,
    features: source.features.filter((feature) => {
      const date = feature.properties.date;
      return date > startExclusive && date <= endInclusive;
    }),
  };
}

async function main() {
  const [gridText, sourceText] = await Promise.all([
    readFile(resolve(dataDirectory, "grid.geojson"), "utf8"),
    readFile(resolve(dataDirectory, "source-snapshot.json"), "utf8"),
  ]);
  const grid = JSON.parse(gridText) as GeoJSON.FeatureCollection;
  const sources = JSON.parse(sourceText) as SourceSnapshot;
  if (!sources.scenario) {
    throw new Error("Replay generation only accepts explicitly labeled scenario inputs.");
  }
  const dates = [...new Set([...sources.replayDates, SNAPSHOT_DATE])].sort();
  const gridFeatures = grid.features as GridFeature[];
  const peatFractions = await readPeatFractionsIfAvailable(
    dataDirectory,
    gridFeatures.map((feature) => feature.properties.id),
  );
  const replayDirectory = resolve(dataDirectory, "replay");
  await mkdir(replayDirectory, { recursive: true });

  for (const asOfDate of dates) {
    const bundle: ReplayBundle = {
      asOfDate,
      scenario: true,
      risk: buildRiskCollection(
        gridFeatures,
        sources,
        HORIZONS[0],
        asOfDate,
        peatFractions,
      ),
      futureHotspots: eventsBetween(
        sources.hotspots,
        asOfDate,
        addDays(asOfDate, 7),
      ),
      alerts: eventsBetween(
        sources.alerts,
        addDays(asOfDate, -60),
        asOfDate,
      ),
    };
    await writeFile(
      resolve(replayDirectory, `${asOfDate}.json`),
      `${JSON.stringify(bundle)}\n`,
    );
  }

  console.info(
    `Wrote ${dates.length} clearly labeled, illustrative scenario replay snapshots. They are not historical fire-season evidence.`,
  );
}

void main();
