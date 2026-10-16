"use client";

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import { useEffect, useRef, useState } from "react";
import { AOI, type DataMode, type Horizon } from "@/lib/config";
import type {
  EventCollection,
  RiskCollection,
  RiskFeature,
  ReplayBundle,
  SnapshotBundle,
  SourceSnapshot,
} from "@/lib/types";
import type { WatchItem } from "@/lib/engine/watchlist";

type DataStatus = {
  mode: DataMode;
  replayAsOf: string | null;
  snapshotDate: string;
  reason: string;
};

type MapViewProps = {
  horizon: Horizon;
  mode: DataMode;
  replayAsOf: string | null;
  watchlist: WatchItem[];
  selectedCellId: string | null;
  onCellSelect: (cell: RiskFeature) => void;
  onDataStatus: (status: DataStatus) => void;
};

const emptyPoints: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [],
};

const outline: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: { label: AOI.name },
  geometry: {
    type: "Polygon",
    coordinates: [[
      [AOI.bounds.west, AOI.bounds.south],
      [AOI.bounds.east, AOI.bounds.south],
      [AOI.bounds.east, AOI.bounds.north],
      [AOI.bounds.west, AOI.bounds.north],
      [AOI.bounds.west, AOI.bounds.south],
    ]],
  },
};

async function getJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return {
    data: (await response.json()) as T,
    response,
  };
}

export default function MapView({
  horizon,
  mode,
  replayAsOf,
  watchlist,
  selectedCellId,
  onCellSelect,
  onDataStatus,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const riskFeaturesRef = useRef(new Map<string, RiskFeature>());
  const onCellSelectRef = useRef(onCellSelect);
  const onDataStatusRef = useRef(onDataStatus);
  const selectedCellIdRef = useRef(selectedCellId);
  const [mapReady, setMapReady] = useState(false);
  const [layerStatus, setLayerStatus] = useState("Preparing offline layers…");

  useEffect(() => {
    onCellSelectRef.current = onCellSelect;
    onDataStatusRef.current = onDataStatus;
    selectedCellIdRef.current = selectedCellId;
  }, [onCellSelect, onDataStatus, selectedCellId]);

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      if (!containerRef.current || mapRef.current) return;
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      maplibregl.setWorkerUrl(
        new URL("/maplibre-gl-worker.mjs", window.location.origin).toString(),
      );

      const map = new maplibregl.Map({
        container: containerRef.current,
        center: [...AOI.center],
        zoom: 8.1,
        minZoom: 6,
        maxZoom: 13,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            aoi: { type: "geojson", data: outline },
            "risk-cells": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
            hotspots: { type: "geojson", data: emptyPoints },
            alerts: { type: "geojson", data: emptyPoints },
            villages: { type: "geojson", data: emptyPoints },
          },
          layers: [
            {
              id: "offline-background",
              type: "background",
              paint: { "background-color": "#e6e8df" },
            },
            {
              id: "risk-fill",
              type: "fill",
              source: "risk-cells",
              paint: {
                "fill-color": [
                  "interpolate",
                  ["linear"],
                  ["get", "risk"],
                  0,
                  "#dceac8",
                  20,
                  "#bdd88d",
                  40,
                  "#ead16e",
                  60,
                  "#e89955",
                  80,
                  "#cf6250",
                  100,
                  "#9f3f42",
                ],
                "fill-opacity": 0.77,
              },
            },
            {
              id: "risk-outline",
              type: "line",
              source: "risk-cells",
              paint: {
                "line-color": "#52644a",
                "line-opacity": 0.22,
                "line-width": 0.35,
              },
            },
            {
              id: "selected-cell-outline",
              type: "line",
              source: "risk-cells",
              filter: ["==", ["get", "id"], ""],
              paint: {
                "line-color": "#183c2a",
                "line-opacity": 1,
                "line-width": 2.5,
              },
            },
            {
              id: "alert-dots",
              type: "circle",
              source: "alerts",
              paint: {
                "circle-color": "#336b4a",
                "circle-radius": 4,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1,
              },
            },
            {
              id: "hotspot-dots",
              type: "circle",
              source: "hotspots",
              paint: {
                "circle-color": "#b63f36",
                "circle-radius": 5,
                "circle-stroke-color": "#fff4e8",
                "circle-stroke-width": 1.3,
              },
            },
            {
              id: "village-dots",
              type: "circle",
              source: "villages",
              paint: {
                "circle-color": "#273e79",
                "circle-radius": 4,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.5,
              },
            },
            {
              id: "aoi-outline",
              type: "line",
              source: "aoi",
              paint: { "line-color": "#344b37", "line-width": 2 },
            },
          ],
        },
      });

      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.on("load", () => {
        if (!cancelled) setMapReady(true);
      });
      map.on("click", "risk-fill", (event) => {
        const feature = event.features?.[0];
        const cellId = feature?.properties?.id;
        if (typeof cellId !== "string") return;
        const cell = riskFeaturesRef.current.get(cellId);
        if (cell) onCellSelectRef.current(cell);
      });
      map.on("mouseenter", "risk-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "risk-fill", () => {
        map.getCanvas().style.cursor = "";
      });
      mapRef.current = map;
    }

    void initializeMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    let cancelled = false;

    async function updateMapData() {
      setLayerStatus(
        replayAsOf ? "Loading illustrative replay checkpoint…" : "Loading risk grid and event layers…",
      );
      const currentMap = mapRef.current;
      if (!currentMap) return;

      try {
        if (replayAsOf) {
          let bundle: ReplayBundle;
          let response: Response | null = null;
          try {
            const result = await getJson<ReplayBundle>(
              `/api/replay?asof=${encodeURIComponent(replayAsOf)}`,
            );
            bundle = result.data;
            response = result.response;
          } catch {
            bundle = await getJson<ReplayBundle>(
              `/data/replay/${replayAsOf}.json`,
            ).then(({ data }) => data);
          }
          if (cancelled) return;
          riskFeaturesRef.current = new Map(
            bundle.risk.features.map((feature) => [feature.properties.id, feature]),
          );
          (currentMap.getSource("risk-cells") as GeoJSONSource).setData(bundle.risk);
          (currentMap.getSource("hotspots") as GeoJSONSource).setData(
            bundle.futureHotspots,
          );
          (currentMap.getSource("alerts") as GeoJSONSource).setData(bundle.alerts);
          onDataStatusRef.current({
            mode: "snapshot",
            replayAsOf: bundle.asOfDate,
            snapshotDate: bundle.asOfDate,
            reason:
              response?.headers.get("X-Data-Fallback") ??
              "Illustrative scenario replay; not historical fire-season evidence.",
          });
          setLayerStatus("Scenario replay · following-week event markers are illustrative.");
          return;
        }

        const [riskResult, hotspotResult, alertResult] = await Promise.all([
          getJson<RiskCollection>(
            `/api/risk?horizon=${horizon}&mode=${mode}`,
          ),
          getJson<EventCollection>(
            `/api/layers/hotspots?days=7&mode=${mode}`,
          ),
          getJson<EventCollection>(
            `/api/layers/alerts?days=60&mode=${mode}`,
          ),
        ]);
        if (cancelled) return;

        const cells = riskResult.data;
        riskFeaturesRef.current = new Map(
          cells.features.map((feature) => [feature.properties.id, feature]),
        );
        (currentMap.getSource("risk-cells") as GeoJSONSource).setData(cells);
        const refreshedSelectedCell = selectedCellIdRef.current
          ? riskFeaturesRef.current.get(selectedCellIdRef.current)
          : undefined;
        if (refreshedSelectedCell) {
          onCellSelectRef.current(refreshedSelectedCell);
        }
        (currentMap.getSource("hotspots") as GeoJSONSource).setData(
          hotspotResult.data,
        );
        (currentMap.getSource("alerts") as GeoJSONSource).setData(
          alertResult.data,
        );
        const dataMode = riskResult.response.headers.get("X-Data-Mode");
        const snapshotDate =
          riskResult.response.headers.get("X-Snapshot-Date") ?? "unknown";
        const reason =
          riskResult.response.headers.get("X-Data-Fallback") ??
          (dataMode === "live" ? "Live risk inputs are in use." : "Bundled scenario snapshot.");
        onDataStatusRef.current({
          mode: dataMode === "live" ? "live" : "snapshot",
          replayAsOf: null,
          snapshotDate,
          reason,
        });
        setLayerStatus("Risk grid and satellite event layers loaded.");
      } catch (error) {
        if (cancelled) return;
        const [bundle, sources] = await Promise.all([
          getJson<SnapshotBundle>("/data/snapshot-latest.json"),
          getJson<SourceSnapshot>("/data/source-snapshot.json"),
        ]);
        const risk = bundle.data.cells[horizon];
        riskFeaturesRef.current = new Map(
          risk.features.map((feature) => [feature.properties.id, feature]),
        );
        (currentMap.getSource("risk-cells") as GeoJSONSource).setData(risk);
        const refreshedSelectedCell = selectedCellIdRef.current
          ? riskFeaturesRef.current.get(selectedCellIdRef.current)
          : undefined;
        if (refreshedSelectedCell) {
          onCellSelectRef.current(refreshedSelectedCell);
        }
        (currentMap.getSource("hotspots") as GeoJSONSource).setData(
          sources.data.hotspots,
        );
        (currentMap.getSource("alerts") as GeoJSONSource).setData(
          sources.data.alerts,
        );
        onDataStatusRef.current({
          mode: "snapshot",
          replayAsOf: null,
          snapshotDate: bundle.data.snapshotDate,
          reason:
            error instanceof Error
              ? `API unreachable; bundled offline files loaded (${error.message}).`
              : "API unreachable; bundled offline files loaded.",
        });
        setLayerStatus("Offline risk grid and event layers loaded.");
      }
    }

    void updateMapData();
    return () => {
      cancelled = true;
    };
  }, [horizon, mapReady, mode, replayAsOf]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("villages") as GeoJSONSource | undefined;
    if (!source) return;
    const villagePoints: FeatureCollection<
      Point,
      { id: string; name: string; risk: number }
    > = {
      type: "FeatureCollection",
      features: watchlist.map((item) => ({
        type: "Feature",
        id: item.village.id,
        properties: {
          id: item.village.id,
          name: item.village.name,
          risk: item.risk,
        },
        geometry: {
          type: "Point",
          coordinates: [item.village.lon, item.village.lat],
        },
      })),
    };
    source.setData(villagePoints);
  }, [mapReady, watchlist]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setFilter("selected-cell-outline", [
      "==",
      ["get", "id"],
      selectedCellId ?? "",
    ]);
    if (selectedCellId) {
      const cell = riskFeaturesRef.current.get(selectedCellId);
      if (cell) {
        onCellSelectRef.current(cell);
        map.flyTo({
          center: [cell.properties.lon, cell.properties.lat],
          zoom: Math.max(map.getZoom(), 9.4),
          duration: 500,
        });
      }
    }
  }, [mapReady, selectedCellId]);

  return (
    <div className="map-frame">
      <div
        className="map-canvas"
        ref={containerRef}
        role="application"
        aria-label={`Interactive relative risk map of ${AOI.name}. Click a cell for its score breakdown.`}
      />
      <div className="map-layer-status" role="status">
        {layerStatus}
      </div>
      {!mapReady && (
        <div className="map-loading" role="status">
          Loading local MapLibre map…
        </div>
      )}
      <div className="map-legend" aria-label="Map layer legend">
        <span><i className="legend-risk" /> Relative risk index</span>
        <span><i className="legend-alert" /> Recent clearing alert</span>
        <span><i className="legend-hotspot" /> Detected hotspot</span>
        <span><i className="legend-village" /> Demo village point</span>
      </div>
    </div>
  );
}
