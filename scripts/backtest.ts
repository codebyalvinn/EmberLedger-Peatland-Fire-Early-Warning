import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BacktestMetrics } from "../src/lib/types";

type BacktestCell = {
  id: string;
  peatFrac: number;
  risk: number;
  hotspotDates: string[];
};

type BacktestObservation = {
  asOfDate: string;
  cells: BacktestCell[];
};

type BacktestInput = {
  provenance: string;
  isSynthetic: false;
  observations: BacktestObservation[];
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = resolve(projectRoot, "public/data");
const inputPath = resolve(dataDirectory, "backtest-input.json");
const outputPath = resolve(dataDirectory, "backtest.json");

const unavailable: BacktestMetrics = {
  status: "unavailable",
  methodology:
    "For each weekly as-of date, rank peat cells by risk using only information available on that date; count observed hotspots over the following seven days.",
  limitation:
    "No verified historical FIRMS, GFW alert, peat-boundary, or weather archive was provided. Scenario data is deliberately excluded; no empirical hit rate, lift, precision, or lead time is claimed.",
};

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function validateInput(input: unknown): BacktestInput {
  if (typeof input !== "object" || input === null) {
    throw new Error("Backtest input must be a JSON object.");
  }
  const candidate = input as Partial<BacktestInput>;
  if (
    candidate.isSynthetic !== false ||
    typeof candidate.provenance !== "string" ||
    !candidate.provenance.trim() ||
    !Array.isArray(candidate.observations) ||
    candidate.observations.length < 2
  ) {
    throw new Error(
      "Backtest input must declare isSynthetic=false, provenance, and at least two weekly observations.",
    );
  }

  for (const observation of candidate.observations) {
    if (
      typeof observation.asOfDate !== "string" ||
      !isValidDate(observation.asOfDate) ||
      !Array.isArray(observation.cells) ||
      !observation.cells.length
    ) {
      throw new Error("Each backtest observation needs an ISO date and cells.");
    }
    for (const cell of observation.cells) {
      if (
        typeof cell.id !== "string" ||
        !Number.isFinite(cell.peatFrac) ||
        cell.peatFrac < 0 ||
        cell.peatFrac > 1 ||
        !Number.isFinite(cell.risk) ||
        cell.risk < 0 ||
        cell.risk > 100 ||
        !Array.isArray(cell.hotspotDates) ||
        !cell.hotspotDates.every(
          (date) =>
            typeof date === "string" &&
            isValidDate(date) &&
            date > observation.asOfDate &&
            date <= addDays(observation.asOfDate, 7),
        )
      ) {
        throw new Error(
          `Invalid cell or following-week hotspot dates in observation ${observation.asOfDate}.`,
        );
      }
    }
  }
  return candidate as BacktestInput;
}

function computeMetrics(input: BacktestInput): BacktestMetrics {
  let firedPeatCells = 0;
  let hitInTop20 = 0;
  let hitsAtTop100 = 0;
  let top100Count = 0;
  const firstHighRiskDate = new Map<string, string>();
  const firstHotspotDate = new Map<string, string>();

  const observations = [...input.observations].sort((a, b) =>
    a.asOfDate.localeCompare(b.asOfDate),
  );
  for (const observation of observations) {
    const peatCells = observation.cells
      .filter((cell) => cell.peatFrac > 0)
      .sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id));
    const top20Size = Math.ceil(peatCells.length * 0.2);
    const top20Ids = new Set(peatCells.slice(0, top20Size).map(({ id }) => id));
    const top100 = peatCells.slice(0, 100);
    top100Count += top100.length;
    const fireCellIds = new Set(
      peatCells
        .filter((cell) => cell.hotspotDates.length > 0)
        .map(({ id }) => id),
    );
    firedPeatCells += fireCellIds.size;
    for (const id of fireCellIds) {
      if (top20Ids.has(id)) hitInTop20 += 1;
    }
    for (const cell of top100) {
      if (fireCellIds.has(cell.id)) hitsAtTop100 += 1;
    }

    for (const cell of peatCells) {
      if (
        cell.risk >= 60 &&
        !firstHighRiskDate.has(cell.id)
      ) {
        firstHighRiskDate.set(cell.id, observation.asOfDate);
      }
      for (const hotspotDate of cell.hotspotDates) {
        const current = firstHotspotDate.get(cell.id);
        if (!current || hotspotDate < current) {
          firstHotspotDate.set(cell.id, hotspotDate);
        }
      }
    }
  }

  const leadTimes = [...firstHotspotDate].flatMap(([id, hotspotDate]) => {
    const riskDate = firstHighRiskDate.get(id);
    if (!riskDate || riskDate > hotspotDate) return [];
    return [
      (Date.parse(`${hotspotDate}T00:00:00Z`) -
        Date.parse(`${riskDate}T00:00:00Z`)) /
        86_400_000,
    ];
  }).sort((a, b) => a - b);
  const middle = Math.floor(leadTimes.length / 2);
  const medianLeadTimeDays =
    leadTimes.length === 0
      ? null
      : leadTimes.length % 2
        ? leadTimes[middle]
        : (leadTimes[middle - 1] + leadTimes[middle]) / 2;
  const top20HitRate =
    firedPeatCells > 0 ? hitInTop20 / firedPeatCells : 0;

  return {
    status: "computed",
    methodology: unavailable.methodology,
    limitation:
      `Computed from the supplied verified archive (${input.provenance}). Observed weather does not test forecast skill; incomplete satellite detections and alert latency remain limitations.`,
    metrics: {
      peatCellCount: observations.at(-1)?.cells.filter((cell) => cell.peatFrac > 0).length ?? 0,
      hotspotCellCount: firedPeatCells,
      top20HitRate,
      lift: top20HitRate / 0.2,
      precisionAtTop100: top100Count > 0 ? hitsAtTop100 / top100Count : 0,
      medianLeadTimeDays,
    },
  };
}

async function main() {
  await mkdir(dirname(outputPath), { recursive: true });
  let result = unavailable;
  try {
    const input = validateInput(JSON.parse(await readFile(inputPath, "utf8")) as unknown);
    result = computeMetrics(input);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error && error.code === "ENOENT")
    ) {
      if (error instanceof SyntaxError) {
        throw new Error(`Could not parse ${inputPath}: ${error.message}`);
      }
      throw error;
    }
    console.info(
      `No verified archive at ${inputPath}; empirical backtest metrics will remain unavailable.`,
    );
  }
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.info(`Wrote ${result.status} backtest output to ${outputPath}.`);
}

void main();
