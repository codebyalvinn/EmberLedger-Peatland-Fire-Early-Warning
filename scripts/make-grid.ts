import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AOI, GRID_STEP_DEGREES } from "../src/lib/config";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "public/data/grid.geojson");
const { west, east, south, north } = AOI.bounds;
const precision = 8;
const features: GeoJSON.Feature<
  GeoJSON.Polygon,
  { id: string; lon: number; lat: number }
>[] = [];

for (let lat = south; lat < north - 1e-9; lat += GRID_STEP_DEGREES) {
  for (let lon = west; lon < east - 1e-9; lon += GRID_STEP_DEGREES) {
    const row = Math.round((lat - south) / GRID_STEP_DEGREES);
    const column = Math.round((lon - west) / GRID_STEP_DEGREES);
    const id = `cell-${row.toString().padStart(3, "0")}-${column
      .toString()
      .padStart(3, "0")}`;
    const westEdge = Number(lon.toFixed(precision));
    const southEdge = Number(lat.toFixed(precision));
    const eastEdge = Number(Math.min(lon + GRID_STEP_DEGREES, east).toFixed(precision));
    const northEdge = Number(Math.min(lat + GRID_STEP_DEGREES, north).toFixed(precision));

    features.push({
      type: "Feature",
      id,
      properties: {
        id,
        lon: Number(((westEdge + eastEdge) / 2).toFixed(precision)),
        lat: Number(((southEdge + northEdge) / 2).toFixed(precision)),
      },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [westEdge, southEdge],
          [eastEdge, southEdge],
          [eastEdge, northEdge],
          [westEdge, northEdge],
          [westEdge, southEdge],
        ]],
      },
    });
  }
}

async function main() {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({
      type: "FeatureCollection",
      name: "EmberLedger 0.02-degree demo grid",
      features,
    })}\n`,
  );

  console.info(
    `Wrote ${features.length} grid cells (${GRID_STEP_DEGREES} degrees) for ${AOI.name} to ${outputPath}`,
  );
}

void main();
