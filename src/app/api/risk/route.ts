import { HORIZONS, SNAPSHOT_DATE, type Horizon } from "@/lib/config";
import { getLiveRisk } from "@/lib/server/live-risk";
import type { SnapshotBundle } from "@/lib/types";
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

  if (requestedMode === "live") {
    try {
      const live = await getLiveRisk(request, horizon);
      return dataResponse(live.risk, {
        mode: "live",
        snapshotDate: live.snapshotDate,
        liveLayers: "Weather (Open-Meteo forecast + archive), hotspots (NASA FIRMS)",
        simulatedLayers: "clearing alerts, peat coverage",
      });
    } catch (error) {
      const bundle = await readPublicData<SnapshotBundle>(
        request,
        "/data/snapshot-latest.json",
      );
      return dataResponse(bundle.cells[horizon], {
        snapshotDate: bundle.snapshotDate || SNAPSHOT_DATE,
        reason: fallbackMessage(error),
        simulatedLayers: "weather, hotspots, clearing alerts, peat coverage",
      });
    }
  }

  const bundle = await readPublicData<SnapshotBundle>(
    request,
    "/data/snapshot-latest.json",
  );
  return dataResponse(bundle.cells[horizon], {
    snapshotDate: bundle.snapshotDate || SNAPSHOT_DATE,
    reason: "Snapshot mode selected.",
    simulatedLayers: "weather, hotspots, clearing alerts, peat coverage",
  });
}
