import { RISK_RADIUS_KM } from "../config";
import type { RiskCollection, Village } from "../types";

export type WatchItem = {
  village: Village;
  risk: number;
  topDriver: "dry" | "clear" | "hot";
  contributions: {
    dry: number;
    clear: number;
    hot: number;
  };
  cellId: string;
  nearestAlertKm: number | null;
};

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

export function rankVillages(
  villages: readonly Village[],
  risk: RiskCollection,
  alerts: GeoJSON.FeatureCollection,
  limit = 10,
): WatchItem[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Watch-list limit must be an integer between 1 and 100");
  }
  const alertPoints = alerts.features.flatMap((feature) => {
    if (feature.geometry.type !== "Point") return [];
    return [{
      lon: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
    }];
  });

  return villages
    .map((village) => {
      const nearestAlertKm = alertPoints.length
        ? Math.min(
            ...alertPoints.map((point) =>
              distanceKm(village.lon, village.lat, point.lon, point.lat),
            ),
          )
        : null;
      const candidateCells = risk.features.filter(
        (cell) =>
          distanceKm(village.lon, village.lat, cell.properties.lon, cell.properties.lat) <=
          RISK_RADIUS_KM,
      );
      const highestRiskCell = candidateCells.reduce<
        (typeof candidateCells)[number] | undefined
      >(
        (highest, cell) =>
          !highest || cell.properties.risk > highest.properties.risk
            ? cell
            : highest,
        undefined,
      );
      if (!highestRiskCell) {
        return {
          village,
          risk: 0,
          topDriver: "dry" as const,
          contributions: { dry: 0, clear: 0, hot: 0 },
          cellId: "",
          nearestAlertKm,
        };
      }

      const properties = highestRiskCell.properties;
      const driverContributions = [
        ["dry", properties.dryContribution],
        ["clear", properties.clearContribution],
        ["hot", properties.hotContribution],
      ] as const;
      const topDriver =
        driverContributions.reduce((highest, candidate) =>
          candidate[1] > highest[1] ? candidate : highest,
        )[0];
      return {
        village,
        risk: properties.risk,
        topDriver,
        contributions: {
          dry: properties.dryContribution,
          clear: properties.clearContribution,
          hot: properties.hotContribution,
        },
        cellId: properties.id,
        nearestAlertKm,
      };
    })
    .sort(
      (first, second) =>
        second.risk - first.risk || first.village.name.localeCompare(second.village.name),
    )
    .slice(0, limit);
}
