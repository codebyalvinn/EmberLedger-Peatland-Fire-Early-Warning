import { RISK_CONFIG, type Horizon } from "../config";
import { droughtCodeSeries, rollDroughtCode } from "./dc";
import { calculateRisk } from "./risk";
import type { RiskCollection, SourceSnapshot, WeatherNode } from "../types";

export type GridFeature = GeoJSON.Feature<
  GeoJSON.Polygon,
  { id: string; lon: number; lat: number }
>;

function distanceKm(lon1: number, lat1: number, lon2: number, lat2: number) {
  const radians = Math.PI / 180;
  const deltaLat = (lat2 - lat1) * radians;
  const deltaLon = (lon2 - lon1) * radians;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1 * radians) *
      Math.cos(lat2 * radians) *
      Math.sin(deltaLon / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function daysBetween(earlier: string, later: string) {
  return Math.floor(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) /
      86_400_000,
  );
}

function nearestWeatherNode(
  cell: { lon: number; lat: number },
  nodes: readonly WeatherNode[],
) {
  if (!nodes.length) throw new Error("At least one weather node is required.");
  return nodes.reduce(
    (nearest, node) => {
      const distance = distanceKm(cell.lon, cell.lat, node.lon, node.lat);
      return distance < nearest.distance ? { node, distance } : nearest;
    },
    { node: nodes[0], distance: Number.POSITIVE_INFINITY },
  ).node;
}

function peatFraction(lon: number, lat: number) {
  const deltaLon = (lon - 113.79) / 0.38;
  const deltaLat = (lat + 2.78) / 0.36;
  const peatShare = 0.94 * Math.exp(-(deltaLon ** 2 + deltaLat ** 2));
  return Number(Math.min(1, Math.max(0, peatShare)).toFixed(3));
}

function eventPoints(collection: GeoJSON.FeatureCollection) {
  return collection.features.flatMap((feature) => {
    if (feature.geometry.type !== "Point") return [];
    const [lon, lat] = feature.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    const properties = feature.properties as {
      date?: unknown;
      confidence?: unknown;
    } | null;
    return [{
      lon,
      lat,
      date: typeof properties?.date === "string" ? properties.date : "",
      confidence:
        typeof properties?.confidence === "string"
          ? properties.confidence.toLowerCase()
          : "",
    }];
  });
}

const rounded = (value: number) => Number(value.toFixed(2));

export function buildRiskCollection(
  gridFeatures: readonly GridFeature[],
  sources: SourceSnapshot,
  horizon: Horizon,
  asOfDate: string,
  peatFractions?: ReadonlyMap<string, number>,
): RiskCollection {
  const alerts = eventPoints(sources.alerts).filter(
    (event) =>
      event.confidence === "high" &&
      daysBetween(event.date, asOfDate) >= 0 &&
      daysBetween(event.date, asOfDate) <= RISK_CONFIG.alertLookbackDays,
  );
  const hotspots = eventPoints(sources.hotspots).filter(
    (event) =>
      daysBetween(event.date, asOfDate) >= 0 &&
      daysBetween(event.date, asOfDate) <= RISK_CONFIG.hotspotLookbackDays,
  );

  return {
    type: "FeatureCollection",
    features: gridFeatures.map((feature) => {
      const { lon, lat, id } = feature.properties;
      const weatherNode = nearestWeatherNode({ lon, lat }, sources.weatherNodes);
      const history = weatherNode.days
        .filter(({ date }) => date <= asOfDate)
        .slice(-92);
      if (history.length < 31) {
        throw new Error(
          `Need at least 31 days of weather history for ${weatherNode.id}; got ${history.length}`,
        );
      }
      const dcHistory = droughtCodeSeries(history, 100);
      const currentDc = dcHistory.at(-1) ?? 100;
      const futureWeather = weatherNode.days
        .filter(({ date }) => date > asOfDate)
        .slice(0, 7);
      const forecast =
        futureWeather.length >= 7 ? futureWeather : weatherNode.forecastDays;
      const dc =
        horizon === 0
          ? currentDc
          : rollDroughtCode(currentDc, forecast, horizon);
      const alertCount = alerts.filter(
        (event) =>
          distanceKm(lon, lat, event.lon, event.lat) <= 5 &&
          event.confidence === "high",
      ).length;
      const hotspotCount = hotspots.filter(
        (event) => distanceKm(lon, lat, event.lon, event.lat) <= 5,
      ).length;
      const peatFrac =
        peatFractions?.get(id) ?? peatFraction(lon, lat);
      if (peatFractions && !peatFractions.has(id)) {
        throw new Error(`No peat share exists for grid cell ${id}.`);
      }
      const breakdown = calculateRisk({
        dc,
        alertCount,
        hotspotCount,
        peatFrac,
      });

      return {
        type: "Feature",
        id,
        properties: {
          id,
          lon,
          lat,
          horizon,
          dc: rounded(dc),
          dry: rounded(breakdown.dry),
          clear: rounded(breakdown.clear),
          hot: rounded(breakdown.hot),
          peatFrac,
          alertCount,
          hotspotCount,
          risk: rounded(breakdown.risk),
          dryContribution: rounded(breakdown.dryContribution),
          clearContribution: rounded(breakdown.clearContribution),
          hotContribution: rounded(breakdown.hotContribution),
          synergyContribution: rounded(breakdown.synergyContribution),
          scenario: true,
        },
        geometry: feature.geometry,
      };
    }),
  };
}
