import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = resolve(projectRoot, "public/data");
const gridPath = resolve(dataDirectory, "grid.geojson");
const peatPath = resolve(dataDirectory, "peat.geojson");
const outputPath = resolve(dataDirectory, "peat-fraction.json");

type Position = [number, number];
type PolygonCoordinates = Position[][];

function pointInRing([x, y]: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Position, polygon: PolygonCoordinates) {
  const [outer, ...holes] = polygon;
  return (
    Boolean(outer) &&
    pointInRing(point, outer) &&
    !holes.some((hole) => pointInRing(point, hole))
  );
}

function validatePolygons(geometry: GeoJSON.Geometry | null): PolygonCoordinates[] {
  if (!geometry) throw new Error("Peat feature has no geometry.");
  if (geometry.type === "Polygon") {
    return [geometry.coordinates as PolygonCoordinates];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates as PolygonCoordinates[];
  }
  throw new Error(`Unsupported peat geometry type ${geometry.type}.`);
}

function isInsideAnyPolygon(point: Position, polygons: PolygonCoordinates[]) {
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

async function main() {
  let peatText: string;
  try {
    peatText = await readFile(peatPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        `Missing ${peatPath}. Add a legally usable peat GeoJSON clipped to the AOI before running this script.`,
      );
    }
    throw error;
  }
  const gridText = await readFile(gridPath, "utf8");
  const peat = JSON.parse(peatText) as GeoJSON.FeatureCollection;
  const grid = JSON.parse(gridText) as GeoJSON.FeatureCollection;
  if (!peat.features.length) throw new Error("Peat GeoJSON contains no features.");
  const peatPolygons = peat.features.flatMap((feature) =>
    validatePolygons(feature.geometry),
  );
  const offsets = [1 / 6, 1 / 2, 5 / 6];
  const cells = grid.features.map((feature) => {
    if (feature.geometry.type !== "Polygon") {
      throw new Error("Risk grid must contain Polygon features.");
    }
    const ring = feature.geometry.coordinates[0];
    const west = ring[0][0];
    const south = ring[0][1];
    const east = ring[2][0];
    const north = ring[2][1];
    let covered = 0;
    for (const yOffset of offsets) {
      for (const xOffset of offsets) {
        const point: Position = [
          west + (east - west) * xOffset,
          south + (north - south) * yOffset,
        ];
        if (isInsideAnyPolygon(point, peatPolygons)) covered += 1;
      }
    }
    const properties = feature.properties;
    const propertyId =
      properties && "id" in properties ? properties.id : undefined;
    const id = propertyId ?? feature.id;
    if (typeof id !== "string") {
      throw new Error("A grid feature is missing its stable string id.");
    }
    return {
      id,
      peatFrac: Number((covered / 9).toFixed(3)),
    };
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify({
      sourceFile: "peat.geojson",
      samplePointsPerCell: 9,
      cells,
    })}\n`,
  );
  console.info(
    `Computed peat coverage for ${cells.length} grid cells using 9 sample points per cell.`,
  );
}

main().catch((error: unknown) => {
  console.error("Could not compute peat fractions.", error);
  process.exitCode = 1;
});
