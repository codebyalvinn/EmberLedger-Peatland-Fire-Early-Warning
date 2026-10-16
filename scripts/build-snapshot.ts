import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AOI, HORIZONS, SNAPSHOT_DATE } from "../src/lib/config";
import { readPeatFractionsIfAvailable } from "../src/lib/engine/peat";
import { buildRiskCollection, type GridFeature } from "../src/lib/engine/snapshot";
import type { SnapshotBundle, SourceSnapshot } from "../src/lib/types";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = resolve(projectRoot, "public/data");
const gridPath = resolve(dataDirectory, "grid.geojson");
const sourcePath = resolve(dataDirectory, "source-snapshot.json");
const snapshotPath = resolve(dataDirectory, "snapshot-latest.json");

async function main() {
  const [gridText, sourceText] = await Promise.all([
    readFile(gridPath, "utf8"),
    readFile(sourcePath, "utf8"),
  ]);
  const grid = JSON.parse(gridText) as GeoJSON.FeatureCollection;
  const sources = JSON.parse(sourceText) as SourceSnapshot;
  if (!sources.scenario) {
    throw new Error("Snapshot inputs are not marked as scenario data.");
  }
  const gridFeatures = grid.features as GridFeature[];
  const peatFractions = await readPeatFractionsIfAvailable(
    dataDirectory,
    gridFeatures.map((feature) => feature.properties.id),
  );
  const cells = Object.fromEntries(
    HORIZONS.map((horizon) => {
      const collection = buildRiskCollection(
        gridFeatures,
        sources,
        horizon,
        SNAPSHOT_DATE,
        peatFractions,
      );
      if (
        collection.features.length !== gridFeatures.length ||
        collection.features.some(
          (feature) => feature.properties.horizon !== horizon,
        )
      ) {
        throw new Error(`Risk snapshot +${horizon}d has incomplete or mismatched cells.`);
      }
      const meanRisk =
        collection.features.reduce(
          (total, feature) => total + feature.properties.risk,
          0,
        ) / collection.features.length;
      console.info(
        `Computed +${horizon}d risk grid: ${collection.features.length} cells; mean index ${meanRisk.toFixed(2)}.`,
      );
      return [horizon, collection];
    }),
  ) as SnapshotBundle["cells"];
  if (HORIZONS.some((horizon) => !cells[horizon])) {
    throw new Error(`Risk snapshot must include all horizons: ${HORIZONS.join(", ")}.`);
  }
  const result: SnapshotBundle = {
    snapshotDate: SNAPSHOT_DATE,
    scenario: true,
    cells,
  };

  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(result)}\n`);
  console.info(
    `Wrote ${AOI.name} scenario risk snapshots for horizons ${HORIZONS.map((day) => `+${day}d`).join(", ")} (${gridFeatures.length} cells each).`,
  );
}

void main();
