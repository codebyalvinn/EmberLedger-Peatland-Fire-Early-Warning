import { AOI } from "@/lib/config";
import { withTtlCache } from "@/lib/cache";
import type { Village } from "@/lib/types";

const cacheDurationMs = 24 * 60 * 60 * 1_000;
const endpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

type OverpassResponse = {
  elements?: Array<{
    id?: number;
    lat?: number;
    lon?: number;
    tags?: Record<string, string>;
  }>;
};

export async function fetchOverpassVillages(): Promise<Village[]> {
  return withTtlCache("overpass:villages", cacheDurationMs, async () => {
    const { west, south, east, north } = AOI.bounds;
    const query = `[out:json][timeout:20];node["place"~"^(village|hamlet)$"](${south},${west},${north},${east});out body;`;
    let lastError: Error | undefined;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
            "user-agent": "EmberLedger/0.1 (peatland fire demo)",
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) {
          lastError = new Error(`Overpass request failed with HTTP ${response.status}`);
          continue;
        }
        const payload = (await response.json()) as OverpassResponse;
        if (!Array.isArray(payload.elements)) {
          throw new Error("Overpass response is missing an elements array");
        }
        return payload.elements.flatMap((element): Village[] => {
          const name = element.tags?.name;
          if (
            !name ||
            !Number.isFinite(element.lon) ||
            !Number.isFinite(element.lat)
          ) {
            return [];
          }
          return [{
            id: `osm-${element.id ?? name}`,
            name,
            lon: element.lon as number,
            lat: element.lat as number,
            source: "OpenStreetMap",
          }];
        });
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error("Overpass request failed");
      }
    }

    throw lastError ?? new Error("All configured Overpass endpoints failed");
  });
}
