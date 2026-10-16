import { SNAPSHOT_DATE } from "@/lib/config";
import { fetchGfwAlerts } from "@/lib/adapters/gfw";
import { dataResponse, fallbackMessage, parseMode, readPublicData } from "@/lib/server/data";
import type { EventCollection, SourceSnapshot } from "@/lib/types";

function dateIsRecent(date: string, days: number) {
  const age =
    (Date.parse(`${SNAPSHOT_DATE}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
    86_400_000;
  return Number.isFinite(age) && age >= 0 && age <= days;
}

function pointsFromGfw(collection: GeoJSON.FeatureCollection): EventCollection {
  const features = collection.features.flatMap((feature, index) => {
    if (feature.geometry.type !== "Point") return [];
    const properties = feature.properties ?? {};
    const date = properties.date;
    const confidence = properties.confidence;
    const [lon, lat] = feature.geometry.coordinates;
    if (
      typeof date !== "string" ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat)
    ) {
      throw new Error(
        "Configured GFW GeoJSON points must expose verified date and point-coordinate fields.",
      );
    }
    return [{
      type: "Feature" as const,
      id: `gfw-${index}`,
      properties: {
        id: `gfw-${index}`,
        date,
        confidence: typeof confidence === "string" ? confidence : "unverified",
        source: "Global Forest Watch" as const,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [lon, lat] as [number, number],
      },
    }];
  });
  return { type: "FeatureCollection", features };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get("days") ?? 60);
  const days = Number.isInteger(rawDays) ? Math.max(1, Math.min(120, rawDays)) : 60;
  const requestedMode = parseMode(url.searchParams.get("mode"));
  let body: EventCollection;
  let actualMode: "live" | "snapshot" = "snapshot";
  let fallbackReason = "Snapshot mode selected.";
  let snapshotDate = SNAPSHOT_DATE;

  if (requestedMode === "live") {
    try {
      const gfw = pointsFromGfw(await fetchGfwAlerts());
      body = {
        ...gfw,
        features: gfw.features.filter((feature) =>
          dateIsRecent(feature.properties.date, days),
        ),
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
        ...snapshot.alerts,
        features: snapshot.alerts.features.filter((feature) =>
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
      ...snapshot.alerts,
      features: snapshot.alerts.features.filter((feature) =>
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
