import { HORIZONS, SNAPSHOT_DATE, type Horizon } from "@/lib/config";
import { rankVillages } from "@/lib/engine/watchlist";
import { getLiveRisk } from "@/lib/server/live-risk";
import {
  dataResponse,
  fallbackMessage,
  parseMode,
  readPublicData,
} from "@/lib/server/data";
import type { SnapshotBundle, SourceSnapshot } from "@/lib/types";

function parseHorizon(value: string | null): Horizon | null {
  const horizon = Number(value);
  return HORIZONS.includes(horizon as Horizon) ? (horizon as Horizon) : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const horizon = parseHorizon(url.searchParams.get("horizon"));
  const rawLimit = Number(url.searchParams.get("limit") ?? 10);
  if (horizon === null) {
    return Response.json(
      { error: "horizon must be one of 0, 3, or 7 days." },
      { status: 400 },
    );
  }
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    return Response.json(
      { error: "limit must be an integer between 1 and 100." },
      { status: 400 },
    );
  }

  const requestedMode = parseMode(url.searchParams.get("mode"));
  const [bundle, sources] = await Promise.all([
    readPublicData<SnapshotBundle>(request, "/data/snapshot-latest.json"),
    readPublicData<SourceSnapshot>(request, "/data/source-snapshot.json"),
  ]);
  if (requestedMode === "live") {
    try {
      const live = await getLiveRisk(request, horizon);
      return dataResponse(
        rankVillages(sources.villages, live.risk, sources.alerts, rawLimit),
        {
          mode: "live",
          snapshotDate: live.snapshotDate,
          liveLayers: "Weather (Open-Meteo), hotspots (NASA FIRMS)",
          simulatedLayers: "clearing alerts, peat coverage",
        },
      );
    } catch (error) {
      return dataResponse(
        rankVillages(sources.villages, bundle.cells[horizon], sources.alerts, rawLimit),
        {
          snapshotDate: bundle.snapshotDate || SNAPSHOT_DATE,
          reason: `Live watch-list unavailable; using the snapshot (${fallbackMessage(error)})`,
          simulatedLayers: "weather, hotspots, clearing alerts, peat coverage",
        },
      );
    }
  }
  const body = rankVillages(
    sources.villages,
    bundle.cells[horizon],
    sources.alerts,
    rawLimit,
  );

  return dataResponse(body, {
    snapshotDate: bundle.snapshotDate || SNAPSHOT_DATE,
    reason: "Snapshot mode selected.",
    simulatedLayers: "weather, hotspots, clearing alerts, peat coverage",
  });
}
