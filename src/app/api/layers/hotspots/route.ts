import { SNAPSHOT_DATE } from "@/lib/config";
import { fetchFirmsHotspots } from "@/lib/adapters/firms";
import { dataResponse, fallbackMessage, parseMode, readPublicData } from "@/lib/server/data";
import type { EventCollection, SourceSnapshot } from "@/lib/types";

function dateIsRecent(date: string, days: number) {
  const age =
    (Date.parse(`${SNAPSHOT_DATE}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
    86_400_000;
  return Number.isFinite(age) && age >= 0 && age <= days;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get("days") ?? 7);
  const days = Number.isInteger(rawDays) ? Math.max(1, Math.min(30, rawDays)) : 7;
  const requestedMode = parseMode(url.searchParams.get("mode"));
  let body: EventCollection;
  let actualMode: "live" | "snapshot" = "snapshot";
  let fallbackReason = "Snapshot mode selected.";
  let snapshotDate = SNAPSHOT_DATE;

  if (requestedMode === "live") {
    try {
      const hotspots = await fetchFirmsHotspots(days);
      body = {
        type: "FeatureCollection",
        features: hotspots.map((hotspot) => ({
          type: "Feature" as const,
          id: hotspot.id,
          properties: {
            id: hotspot.id,
            date: hotspot.date,
            confidence: hotspot.confidence,
            source: "NASA FIRMS" as const,
          },
          geometry: {
            type: "Point" as const,
            coordinates: [hotspot.lon, hotspot.lat] as [number, number],
          },
        })),
      };
      actualMode = "live";
      fallbackReason = "";
    } catch (error) {
      fallbackReason = fallbackMessage(error);
      const snapshot = await readPublicData<SourceSnapshot>(
        request,
        "/data/source-snapshot.json",
      );
      body = {
        ...snapshot.hotspots,
        features: snapshot.hotspots.features.filter((feature) =>
          dateIsRecent(feature.properties.date, days),
        ),
      };
      snapshotDate = snapshot.snapshotDate;
    }
  } else {
    const snapshot = await readPublicData<SourceSnapshot>(
      request,
      "/data/source-snapshot.json",
    );
    body = {
      ...snapshot.hotspots,
      features: snapshot.hotspots.features.filter((feature) =>
        dateIsRecent(feature.properties.date, days),
      ),
    };
    snapshotDate = snapshot.snapshotDate;
  }

  return dataResponse(body, {
    mode: actualMode,
    snapshotDate,
    reason: fallbackReason || undefined,
  });
}
