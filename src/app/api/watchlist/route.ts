import { HORIZONS, SNAPSHOT_DATE, type Horizon } from "@/lib/config";
import { rankVillages } from "@/lib/engine/watchlist";
import {
  dataResponse,
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

  const [bundle, sources] = await Promise.all([
    readPublicData<SnapshotBundle>(request, "/data/snapshot-latest.json"),
    readPublicData<SourceSnapshot>(request, "/data/source-snapshot.json"),
  ]);
  const body = rankVillages(
    sources.villages,
    bundle.cells[horizon],
    sources.alerts,
    rawLimit,
  );

  return dataResponse(body, {
    snapshotDate: bundle.snapshotDate || SNAPSHOT_DATE,
    reason:
      parseMode(url.searchParams.get("mode")) === "live"
        ? "Village ranking uses the bundled illustrative risk snapshot."
        : "Snapshot mode selected.",
  });
}
