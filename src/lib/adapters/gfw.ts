import { withTtlCache } from "@/lib/cache";

const cacheDurationMs = 6 * 60 * 60 * 1_000;

export async function fetchGfwDatasetCatalogue(): Promise<unknown> {
  const key = process.env.GFW_API_KEY;
  if (!key) throw new Error("GFW_API_KEY is not configured");

  return withTtlCache("gfw:catalogue", cacheDurationMs, async () => {
    const response = await fetch("https://data-api.globalforestwatch.org/datasets", {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`GFW dataset catalogue failed with HTTP ${response.status}`);
    }
    return response.json();
  });
}

export async function fetchGfwAlerts(): Promise<GeoJSON.FeatureCollection> {
  const key = process.env.GFW_API_KEY;
  const alertsUrl = process.env.GFW_ALERTS_GEOJSON_URL;
  if (!key) throw new Error("GFW_API_KEY is not configured");
  if (!alertsUrl) {
    throw new Error(
      "GFW_ALERTS_GEOJSON_URL is not configured; discover and verify the AOI alert query with npm run probe before setting it",
    );
  }

  return withTtlCache("gfw:alerts", cacheDurationMs, async () => {
    const url = new URL(alertsUrl);
    if (url.protocol !== "https:") {
      throw new Error("GFW_ALERTS_GEOJSON_URL must use HTTPS");
    }
    const response = await fetch(url, {
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`GFW alerts request failed with HTTP ${response.status}`);
    }
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("type" in body) ||
      body.type !== "FeatureCollection" ||
      !("features" in body) ||
      !Array.isArray(body.features)
    ) {
      throw new Error("GFW alerts response is not a GeoJSON FeatureCollection");
    }
    return body as GeoJSON.FeatureCollection;
  });
}
