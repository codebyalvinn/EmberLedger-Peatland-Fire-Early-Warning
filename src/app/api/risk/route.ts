import { HORIZONS, SNAPSHOT_DATE, type Horizon } from "@/lib/config";
import { fetchFirmsHotspots } from "@/lib/adapters/firms";
import { fetchGfwAlerts } from "@/lib/adapters/gfw";
import { fetchOpenMeteoBulk } from "@/lib/adapters/openmeteo";
import { fetchOverpassVillages } from "@/lib/adapters/overpass";
import type { SnapshotBundle, SourceSnapshot } from "@/lib/types";
import {
  dataResponse,
  fallbackMessage,
  parseMode,
  readPublicData,
} from "@/lib/server/data";

function parseHorizon(value: string | null): Horizon | null {
  const horizon = Number(value);
  return HORIZONS.includes(horizon as Horizon) ? (horizon as Horizon) : null;
}

async function verifyLiveInputs(request: Request) {
  const missing = [
    ["FIRMS_MAP_KEY", process.env.FIRMS_MAP_KEY],
    ["GFW_API_KEY", process.env.GFW_API_KEY],
    ["GFW_ALERTS_GEOJSON_URL", process.env.GFW_ALERTS_GEOJSON_URL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Live risk is unavailable; configure ${missing.join(", ")}.`);
  }

  const sources = await readPublicData<SourceSnapshot>(
    request,
    "/data/source-snapshot.json",
  );
  await Promise.all([
    fetchFirmsHotspots(7),
    fetchGfwAlerts(),
    fetchOpenMeteoBulk(sources.weatherNodes),
    fetchOverpassVillages(),
  ]);
  throw new Error(
    "Live scoring remains disabled until an AOI-verified peat mask and validated source fields are configured.",
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedMode = parseMode(url.searchParams.get("mode"));
  const horizon = parseHorizon(url.searchParams.get("horizon"));
  if (horizon === null) {
    return Response.json(
      { error: "horizon must be one of 0, 3, or 7 days." },
      { status: 400 },
    );
  }

  let fallbackReason = "Snapshot mode selected.";
  if (requestedMode === "live") {
    try {
      await verifyLiveInputs(request);
    } catch (error) {
      fallbackReason = fallbackMessage(error);
    }
  }

  const bundle = await readPublicData<SnapshotBundle>(
    request,
    "/data/snapshot-latest.json",
  );
  return dataResponse(bundle.cells[horizon], {
    snapshotDate: bundle.snapshotDate || SNAPSHOT_DATE,
    reason: fallbackReason,
  });
}
