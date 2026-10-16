import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AOI, SNAPSHOT_DATE, WEATHER_GRID_STEP_DEGREES } from "../src/lib/config";
import type { SourceSnapshot, WeatherDay } from "../src/lib/types";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = resolve(projectRoot, "public/data");
const gridPath = resolve(dataDirectory, "grid.geojson");
const snapshotPath = resolve(dataDirectory, "source-snapshot.json");
const demoVillageNames = [
  "Desa Rawa Makmur",
  "Desa Gambut Lestari",
  "Desa Sei Kahayan",
  "Desa Tanjung Harapan",
  "Desa Rimba Bakti",
  "Desa Muara Pelita",
  "Desa Teluk Sentosa",
  "Desa Sukamaju Pesisir",
  "Desa Sumber Kahuripan",
  "Desa Bukit Mekar",
] as const;

function dateBeforeSnapshot(daysBefore: number) {
  const date = new Date(`${SNAPSHOT_DATE}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysBefore);
  return date.toISOString().slice(0, 10);
}

function randomFactory(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

async function main() {
  const gridText = await readFile(gridPath, "utf8");
  const grid = JSON.parse(gridText) as GeoJSON.FeatureCollection;
  if (!grid.features.length) {
    throw new Error("Grid is empty. Run npm run grid before creating demo data.");
  }

  const { west, east, south, north } = AOI.bounds;
  const weatherNodes = [];
  let nodeIndex = 0;
  for (let lat = south + WEATHER_GRID_STEP_DEGREES / 2; lat < north; lat += WEATHER_GRID_STEP_DEGREES) {
    for (let lon = west + WEATHER_GRID_STEP_DEGREES / 2; lon < east; lon += WEATHER_GRID_STEP_DEGREES) {
      const days: WeatherDay[] = [];
      for (let day = 99; day >= 0; day -= 1) {
        const dayOfSeries = 99 - day;
        const rainInterval = 7 + (nodeIndex % 5);
        const rain = dayOfSeries % rainInterval === nodeIndex % rainInterval
          ? 9 + (nodeIndex % 5)
          : 0.2 + ((dayOfSeries + nodeIndex) % 4) * 0.25;
        const temperature = 31.2 + ((dayOfSeries * 3 + nodeIndex * 7) % 19) / 10;
        days.push({
          date: dateBeforeSnapshot(day),
          precipitationMm: Number(rain.toFixed(1)),
          maxTemperatureC: Number(temperature.toFixed(1)),
        });
      }
      const forecastDays = Array.from({ length: 7 }, (_, forecastDay) => {
        const dayOfSeries = 100 + forecastDay;
        const rainInterval = 7 + (nodeIndex % 5);
        const rain = dayOfSeries % rainInterval === nodeIndex % rainInterval
          ? 9 + (nodeIndex % 5)
          : 0.2 + ((dayOfSeries + nodeIndex) % 4) * 0.25;
        const temperature = 31.2 + ((dayOfSeries * 3 + nodeIndex * 7) % 19) / 10;
        return {
          date: dateBeforeSnapshot(-forecastDay - 1),
          precipitationMm: Number(rain.toFixed(1)),
          maxTemperatureC: Number(temperature.toFixed(1)),
        };
      });
      weatherNodes.push({
        id: `weather-${nodeIndex.toString().padStart(2, "0")}`,
        lon: Number(lon.toFixed(4)),
        lat: Number(lat.toFixed(4)),
        days,
        forecastDays,
      });
      nodeIndex += 1;
    }
  }

  const random = randomFactory(42);
  const eventFeature = (
    type: "hotspot" | "alert",
    index: number,
    lookbackDays: number,
  ): GeoJSON.Feature<GeoJSON.Point, {
    id: string;
    date: string;
    confidence: string;
    source: "illustrative scenario";
  }> => {
    const cluster = index % 3;
    const clusterLon = [113.76, 113.94, 113.55][cluster];
    const clusterLat = [-2.71, -2.92, -2.46][cluster];
    const jitter = type === "hotspot" ? 0.055 : 0.11;
    return {
      type: "Feature",
      id: `${type}-${index.toString().padStart(3, "0")}`,
      properties: {
        id: `${type}-${index.toString().padStart(3, "0")}`,
        date: dateBeforeSnapshot(
          type === "hotspot"
            ? Math.min(lookbackDays - 1, Math.floor(index / 4) * 7 + Math.floor(random() * 3))
            : Math.floor(random() * lookbackDays),
        ),
        confidence: type === "alert" ? "high" : "nominal",
        source: "illustrative scenario",
      },
      geometry: {
        type: "Point",
        coordinates: [
          Number((clusterLon + (random() - 0.5) * jitter).toFixed(5)),
          Number((clusterLat + (random() - 0.5) * jitter).toFixed(5)),
        ],
      },
    };
  };

  const villages = demoVillageNames.map((name, index) => ({
    id: `demo-village-${String(index + 1).padStart(2, "0")}`,
    name,
    lon: Number((west + 0.1 + ((index * 17) % 130) / 100).toFixed(4)),
    lat: Number((south + 0.1 + ((index * 11) % 130) / 100).toFixed(4)),
    source: "illustrative scenario" as const,
  }));

  const result: SourceSnapshot = {
    snapshotDate: SNAPSHOT_DATE,
    scenario: true,
    sourceStatus: {
      firms: "Illustrative synthetic hotspots; no FIRMS key/data was provided.",
      gfw: "Illustrative synthetic alerts; no GFW key/data was provided.",
      openMeteo: "Illustrative synthetic weather; not an Open-Meteo observation.",
      overpass: "Illustrative village points; not verified OSM features.",
      peat: "Illustrative synthetic peat fractions; no peat boundary was provided.",
    },
    weatherNodes,
    hotspots: {
      type: "FeatureCollection",
      features: Array.from({ length: 18 }, (_, index) => eventFeature("hotspot", index, 7)),
    },
    alerts: {
      type: "FeatureCollection",
      features: Array.from({ length: 55 }, (_, index) => eventFeature("alert", index, 60)),
    },
    villages,
    replayDates: [
      dateBeforeSnapshot(28),
      dateBeforeSnapshot(21),
      dateBeforeSnapshot(14),
      dateBeforeSnapshot(7),
      SNAPSHOT_DATE,
    ],
  };

  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(result)}\n`);
  console.info(
    `Wrote clearly labeled scenario inputs for ${AOI.name}: ${weatherNodes.length} weather nodes, ${result.hotspots.features.length} hotspots, ${result.alerts.features.length} alerts, ${villages.length} illustrative village points.`,
  );
}

void main();
