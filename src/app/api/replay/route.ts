import { SNAPSHOT_DATE } from "@/lib/config";
import { dataResponse, readPublicData } from "@/lib/server/data";
import type { ReplayBundle } from "@/lib/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asOfDate = url.searchParams.get("asof") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return Response.json(
      { error: "asof must be an ISO date in YYYY-MM-DD format." },
      { status: 400 },
    );
  }

  try {
    const bundle = await readPublicData<ReplayBundle>(
      request,
      `/data/replay/${asOfDate}.json`,
    );
    return dataResponse(bundle, {
      snapshotDate: bundle.asOfDate,
      reason: "Illustrative scenario replay; not historical fire-season evidence.",
    });
  } catch (error) {
    return dataResponse(
      {
        error:
          error instanceof Error
            ? `No replay snapshot is available for ${asOfDate}.`
            : "No replay snapshot is available for the selected date.",
      },
      {
        snapshotDate: SNAPSHOT_DATE,
        reason: "Choose one of the bundled illustrative replay dates.",
        status: 404,
      },
    );
  }
}
