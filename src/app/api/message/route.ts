import { HORIZONS, SNAPSHOT_DATE, type Horizon } from "@/lib/config";
import { createAlertMessage } from "@/lib/message";
import { rankVillages } from "@/lib/engine/watchlist";
import { dataResponse, readPublicData } from "@/lib/server/data";
import type { SnapshotBundle, SourceSnapshot } from "@/lib/types";

type MessageRequest = {
  villageId?: unknown;
  horizon?: unknown;
  lang?: unknown;
};

export async function POST(request: Request) {
  let body: MessageRequest;
  try {
    body = (await request.json()) as MessageRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const horizon = Number(body.horizon);
  if (!HORIZONS.includes(horizon as Horizon)) {
    return Response.json(
      { error: "horizon must be one of 0, 3, or 7 days." },
      { status: 400 },
    );
  }
  if (typeof body.villageId !== "string" || body.villageId.length > 120) {
    return Response.json(
      { error: "villageId must be a string no longer than 120 characters." },
      { status: 400 },
    );
  }
  if (body.lang !== undefined && body.lang !== "id" && body.lang !== "en") {
    return Response.json({ error: "lang must be 'id' or 'en'." }, { status: 400 });
  }

  const [bundle, sources] = await Promise.all([
    readPublicData<SnapshotBundle>(request, "/data/snapshot-latest.json"),
    readPublicData<SourceSnapshot>(request, "/data/source-snapshot.json"),
  ]);
  const ranking = rankVillages(
    sources.villages,
    bundle.cells[horizon as Horizon],
    sources.alerts,
    100,
  );
  const item = ranking.find(({ village }) => village.id === body.villageId);
  if (!item) {
    return Response.json({ error: "Village is not in the current watch-list." }, { status: 404 });
  }

  return dataResponse(
    {
      village: item.village,
      horizon: horizon as Horizon,
      lang: body.lang ?? "id",
      text: createAlertMessage(item, horizon as Horizon, (body.lang as "id" | "en") ?? "id"),
      source: "template",
      dataDisclaimer: "Generated from illustrative snapshot inputs; not an official warning.",
    },
    { snapshotDate: bundle.snapshotDate || SNAPSHOT_DATE },
  );
}
