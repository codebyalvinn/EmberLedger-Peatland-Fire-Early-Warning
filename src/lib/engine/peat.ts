import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type PeatFractionFile = {
  sourceFile: string;
  samplePointsPerCell: number;
  cells: Array<{ id: string; peatFrac: number }>;
};

export async function readPeatFractionsIfAvailable(
  dataDirectory: string,
  gridCellIds: readonly string[],
): Promise<Map<string, number> | undefined> {
  let content: string;
  try {
    content = await readFile(resolve(dataDirectory, "peat-fraction.json"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  const parsed = JSON.parse(content) as Partial<PeatFractionFile>;
  if (
    typeof parsed.sourceFile !== "string" ||
    parsed.sourceFile !== "peat.geojson" ||
    parsed.samplePointsPerCell !== 9 ||
    !Array.isArray(parsed.cells)
  ) {
    throw new Error("Peat fraction file has an unexpected schema.");
  }
  const fractions = new Map<string, number>();
  for (const cell of parsed.cells) {
    if (
      typeof cell.id !== "string" ||
      !Number.isFinite(cell.peatFrac) ||
      cell.peatFrac < 0 ||
      cell.peatFrac > 1
    ) {
      throw new Error("Peat fraction file contains an invalid cell share.");
    }
    fractions.set(cell.id, cell.peatFrac);
  }
  if (
    fractions.size !== gridCellIds.length ||
    gridCellIds.some((id) => !fractions.has(id))
  ) {
    throw new Error("Peat fractions must include exactly one entry per grid cell.");
  }
  return fractions;
}
