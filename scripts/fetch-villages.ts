import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AOI } from "../src/lib/config";
import { fetchOverpassVillages } from "../src/lib/adapters/overpass";
import type { SourceSnapshot } from "../src/lib/types";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "public/data/villages-osm.json");
const sourceSnapshotPath = resolve(projectRoot, "public/data/source-snapshot.json");

async function main() {
  const villages = await fetchOverpassVillages();
  const sourceSnapshot = JSON.parse(
    await readFile(sourceSnapshotPath, "utf8"),
  ) as SourceSnapshot;
  if (!sourceSnapshot.scenario) {
    throw new Error("Source snapshot does not declare scenario inputs.");
  }
  const updatedSnapshot: SourceSnapshot = {
    ...sourceSnapshot,
    villages,
    sourceStatus: {
      ...sourceSnapshot.sourceStatus,
      overpass: `OpenStreetMap Overpass; fetched ${new Date().toISOString()}. Other source inputs remain illustrative.`,
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({
      source: "OpenStreetMap Overpass",
      attribution: "© OpenStreetMap contributors",
      aoi: AOI.name,
      fetchedAt: new Date().toISOString(),
      villages,
    }, null, 2)}\n`,
  );
  await writeFile(sourceSnapshotPath, `${JSON.stringify(updatedSnapshot)}\n`);
  console.info(`Wrote ${villages.length} OSM village points to ${outputPath}.`);
}

main().catch((error: unknown) => {
  console.error(
    "Could not fetch OSM villages. Check Overpass availability; no fallback file was written.",
    error,
  );
  process.exitCode = 1;
});
