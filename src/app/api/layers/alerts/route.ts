import { SNAPSHOT_DATE } from "@/lib/config";
import { dataResponse, parseMode, readPublicData } from "@/lib/server/data";
import type { EventCollection, SourceSnapshot } from "@/lib/types";

function dateIsRecent(date: string, days: number) {
  const age =
    (Date.parse(`${SNAPSHOT_DATE}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
    86_400_000;
  return Number.isFinite(age) && age >= 0 && age <= days;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get("days") ?? 60);
  const days = Number.isInteger(rawDays) ? Math.max(1, Math.min(120, rawDays)) : 60;
  const requestedMode = parseMode(url.searchParams.get("mode"));
  const snapshot = await readPublicData<SourceSnapshot>(
    request,
    "/data/source-snapshot.json",
  );
  const body: EventCollection = {
    ...snapshot.alerts,
    features: snapshot.alerts.features.filter((feature) =>
      dateIsRecent(feature.properties.date, days),
    ),
  };

  return dataResponse(body, {
    snapshotDate: snapshot.snapshotDate || SNAPSHOT_DATE,
    reason:
      requestedMode === "live"
        ? "Clearing alerts are simulated until a verified GFW export is configured."
        : "Snapshot mode selected.",
    simulatedLayers: "clearing alerts",
  });
}
