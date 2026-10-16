import { withTtlCache } from "@/lib/cache";
import { fetchFirmsHotspots } from "@/lib/adapters/firms";
import {
  fetchOpenMeteoArchiveBulk,
  fetchOpenMeteoBulk,
} from "@/lib/adapters/openmeteo";
import type { Horizon } from "@/lib/config";
import { buildRiskCollection, type GridFeature } from "@/lib/engine/snapshot";
import type {
  EventCollection,
  RiskCollection,
  SourceSnapshot,
  WeatherDay,
} from "@/lib/types";
import { readPublicData } from "@/lib/server/data";

const liveRiskTtlMs = 10 * 60 * 1_000;

function localDateInBorneo(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Pontianak",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDate(date: string) {
  const previous = new Date(`${date}T00:00:00.000Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function addDays(date: string, count: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + count);
  return result.toISOString().slice(0, 10);
}

function eventCollectionFromFirms(
  hotspots: Awaited<ReturnType<typeof fetchFirmsHotspots>>,
): EventCollection {
  return {
    type: "FeatureCollection",
    features: hotspots.map((hotspot) => ({
      type: "Feature",
      id: hotspot.id,
      properties: {
        id: hotspot.id,
        date: hotspot.date,
        confidence: hotspot.confidence,
        source: "NASA FIRMS",
      },
      geometry: {
        type: "Point",
        coordinates: [hotspot.lon, hotspot.lat],
      },
    })),
  };
}

function attachWeather(
  snapshotNodes: SourceSnapshot["weatherNodes"],
  liveWeather: Map<string, WeatherDay[]>,
  archivedWeather: Map<string, WeatherDay[]>,
  asOfDate: string,
) {
  return snapshotNodes.map((node) => {
    const forecastResponse = liveWeather.get(node.id);
    const archiveHistory = archivedWeather.get(node.id);
    if (!forecastResponse || !archiveHistory) {
      throw new Error(`Open-Meteo data is missing grid node ${node.id}.`);
    }
    const daysByDate = new Map(archiveHistory.map((day) => [day.date, day]));
    for (const day of forecastResponse) daysByDate.set(day.date, day);
    const days = [...daysByDate.values()].sort((first, second) =>
      first.date.localeCompare(second.date),
    );
    const history = days.filter(({ date }) => date <= asOfDate);
    const forecastDays = days.filter(({ date }) => date > asOfDate).slice(0, 7);
    const historyStart = addDays(asOfDate, -91);
    const historyIsContinuous =
      history.length === 92 &&
      history[0].date === historyStart &&
      history[91].date === asOfDate &&
      history.every(
        ({ date }, index) => date === addDays(historyStart, index),
      );
    const forecastIsContinuous =
      forecastDays.length === 7 &&
      forecastDays.every(
        ({ date }, index) => date === addDays(asOfDate, index + 1),
      );
    if (!historyIsContinuous || !forecastIsContinuous) {
      throw new Error(
        `Open-Meteo data for ${node.id} does not include 92 continuous history days and 7 forecast days as of ${asOfDate}.`,
      );
    }
    return { ...node, days: [...history, ...forecastDays], forecastDays };
  });
}

export async function getLiveRisk(
  request: Request,
  horizon: Horizon,
): Promise<{ risk: RiskCollection; snapshotDate: string }> {
  return withTtlCache(`live-risk:v1:${horizon}`, liveRiskTtlMs, async () => {
    const [grid, snapshot] = await Promise.all([
      readPublicData<GeoJSON.FeatureCollection>(request, "/data/grid.geojson"),
      readPublicData<SourceSnapshot>(request, "/data/source-snapshot.json"),
    ]);
    const asOfDate = previousDate(localDateInBorneo(new Date()));
    const historyStartDate = addDays(asOfDate, -91);
    const [weather, firmsHotspots, archivedWeather] = await Promise.all([
      fetchOpenMeteoBulk(snapshot.weatherNodes),
      fetchFirmsHotspots(7, asOfDate),
      fetchOpenMeteoArchiveBulk(
        snapshot.weatherNodes,
        historyStartDate,
        asOfDate,
      ),
    ]);

    const sources: SourceSnapshot = {
      ...snapshot,
      weatherNodes: attachWeather(
        snapshot.weatherNodes,
        weather,
        archivedWeather,
        asOfDate,
      ),
      hotspots: eventCollectionFromFirms(firmsHotspots),
    };
    const risk = buildRiskCollection(
      grid.features as GridFeature[],
      sources,
      horizon,
      asOfDate,
      undefined,
      false,
    );
    if (risk.features.length !== grid.features.length) {
      throw new Error("Live risk calculation returned an incomplete grid.");
    }
    return { risk, snapshotDate: asOfDate };
  });
}
