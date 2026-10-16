"use client";

import type {
  FilterSpecification,
  GeoJSONSource,
  MapLayerMouseEvent,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
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
  liveLayers: string;
  simulatedLayers: string;
};

type MapViewProps = {
  horizon: Horizon;
  mode: DataMode;
  replayAsOf: string | null;
  watchlist: WatchItem[];
  selectedCellId: string | null;
  onCellSelect: (cell: RiskFeature) => void;
  onVillageSelect: (item: WatchItem) => void;
  onDataStatus: (status: DataStatus) => void;
};

type VillageMarker = {
  item: WatchItem;
  marker: MapLibreMarker;
  element: HTMLButtonElement;
  rank: number;
};

type HoveredCell = {
  id: string;
  risk: number;
  driver: string;
  x: number;
  y: number;
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

function illustrativePeatExtent(): GeoJSON.Feature<GeoJSON.Polygon> {
  const centerLon = 113.79;
  const centerLat = -2.78;
  const radiusLon = 0.43;
  const radiusLat = 0.39;
  const ring = Array.from({ length: 73 }, (_, index) => {
    const angle = (index / 72) * Math.PI * 2;
    return [
      centerLon + Math.cos(angle) * radiusLon,
      centerLat + Math.sin(angle) * radiusLat,
    ] as [number, number];
  });
  return {
    type: "Feature",
    properties: { label: "Illustrative peat extent" },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

function topDriver(properties: RiskFeature["properties"]) {
  const contributions = [
    ["Dryness", properties.dryContribution],
    ["Clearing", properties.clearContribution],
    ["Hotspots", properties.hotContribution],
  ] as const;
  return contributions.reduce((highest, candidate) =>
    candidate[1] > highest[1] ? candidate : highest,
  )[0];
}

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
  onVillageSelect,
  onDataStatus,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const riskFeaturesRef = useRef(new Map<string, RiskFeature>());
  const onCellSelectRef = useRef(onCellSelect);
  const onDataStatusRef = useRef(onDataStatus);
  const selectedCellIdRef = useRef(selectedCellId);
  const onVillageSelectRef = useRef(onVillageSelect);
  const villageMarkersRef = useRef<VillageMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [layerStatus, setLayerStatus] = useState("Preparing offline layers…");
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const coordinateTextRef = useRef("");
  const hoverCellKeyRef = useRef("");

  useEffect(() => {
    onCellSelectRef.current = onCellSelect;
    onDataStatusRef.current = onDataStatus;
    selectedCellIdRef.current = selectedCellId;
    onVillageSelectRef.current = onVillageSelect;
  }, [onCellSelect, onDataStatus, onVillageSelect, selectedCellId]);

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
            "peat-extent": {
              type: "geojson",
              data: illustrativePeatExtent(),
            },
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
                  "step",
                  ["get", "risk"],
                  "#bdd88d",
                  35,
                  "#ead16e",
                  65,
                  "#cf6250",
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
              id: "selected-cell-halo",
              type: "line",
              source: "risk-cells",
              filter: ["==", ["get", "id"], ""],
              paint: {
                "line-color": "#ffffff",
                "line-opacity": 1,
                "line-width": 6,
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
              id: "peat-extent-outline",
              type: "line",
              source: "peat-extent",
              paint: {
                "line-color": "#315c43",
                "line-width": 2.5,
                "line-dasharray": [2, 1.5],
                "line-opacity": 0.9,
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
      map.addControl(
        new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
        "bottom-right",
      );
      map.on("load", () => {
        if (!cancelled) setMapReady(true);
      });
      const showHoveredCell = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const cellId = feature?.properties?.id;
        if (typeof cellId !== "string") return;
        const cell = riskFeaturesRef.current.get(cellId);
        if (!cell) return;
        const key = `${cellId}:${event.point.x}:${event.point.y}`;
        if (hoverCellKeyRef.current === key) return;
        hoverCellKeyRef.current = key;
        setHoveredCell({
          id: cellId,
          risk: cell.properties.risk,
          driver: topDriver(cell.properties),
          x: event.point.x,
          y: event.point.y,
        });
      };
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
        hoverCellKeyRef.current = "";
        setHoveredCell(null);
      });
      map.on("mousemove", "risk-fill", showHoveredCell);
      map.on("mousemove", (event) => {
        const lon = Number(event.lngLat.lng.toFixed(4));
        const lat = Number(event.lngLat.lat.toFixed(4));
        const coordinateKey = `${lon},${lat}`;
        if (coordinateTextRef.current !== coordinateKey) {
          coordinateTextRef.current = coordinateKey;
          setCoordinates([lon, lat]);
        }
      });
      mapRef.current = map;
    }

    void initializeMap();
    return () => {
      cancelled = true;
      for (const { marker } of villageMarkersRef.current) marker.remove();
      villageMarkersRef.current = [];
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

      function displayRisk(map: MapLibreMap, collection: RiskCollection) {
        riskFeaturesRef.current = new Map(
          collection.features.map((feature) => [feature.properties.id, feature]),
        );
        (map.getSource("risk-cells") as GeoJSONSource).setData(collection);
        const selectedCell =
          (selectedCellIdRef.current &&
            riskFeaturesRef.current.get(selectedCellIdRef.current)) ||
          collection.features.reduce<RiskFeature | undefined>(
            (highest, feature) =>
              !highest || feature.properties.risk > highest.properties.risk
                ? feature
                : highest,
            undefined,
          );
        if (selectedCell) onCellSelectRef.current(selectedCell);
      }

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
          displayRisk(currentMap, bundle.risk);
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
            liveLayers: "none",
            simulatedLayers: "replay checkpoints and event markers",
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
        displayRisk(currentMap, cells);
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
          liveLayers: riskResult.response.headers.get("X-Live-Layers") ?? "",
          simulatedLayers:
            riskResult.response.headers.get("X-Simulated-Layers") ??
            "weather, hotspots, clearing alerts, peat coverage",
        });
        setLayerStatus("Risk grid and satellite event layers loaded.");
      } catch (error) {
        if (cancelled) return;
        const [bundle, sources] = await Promise.all([
          getJson<SnapshotBundle>("/data/snapshot-latest.json"),
          getJson<SourceSnapshot>("/data/source-snapshot.json"),
        ]);
        const risk = bundle.data.cells[horizon];
        displayRisk(currentMap, risk);
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
          liveLayers: "none",
          simulatedLayers: "weather, hotspots, clearing alerts, peat coverage",
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

    let cancelled = false;
    let markers: VillageMarker[] = [];
    let removeVisibilityListeners = () => {};

    async function addVillageLabels() {
      const maplibregl = await import("maplibre-gl");
      const activeMap = mapRef.current;
      if (cancelled || !activeMap) return;
      const labelMap: MapLibreMap = activeMap;

      markers = watchlist.map((item, index) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "village-map-label";
        element.textContent = item.village.name;
        element.title = `${item.village.name}, rank ${index + 1}, relative index ${Math.round(item.risk)}`;
        element.setAttribute(
          "aria-label",
          `Select ${item.village.name}, rank ${index + 1}, relative index ${Math.round(item.risk)} points`,
        );
        element.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onVillageSelectRef.current(item);
        });
        const marker = new maplibregl.Marker({
          element,
          anchor: "bottom",
          offset: [0, -10],
        })
          .setLngLat([item.village.lon, item.village.lat])
          .addTo(labelMap);
        return { item, marker, element, rank: index + 1 };
      });
      villageMarkersRef.current = markers;

      function updateLabelVisibility() {
        const zoom = labelMap.getZoom();
        const maximumRank = zoom < 7.8 ? 1 : zoom < 8.5 ? 4 : zoom < 9.2 ? 7 : 10;
        const ordered = [...markers].sort((first, second) => {
          const firstSelected =
            first.item.cellId === selectedCellIdRef.current ? 1 : 0;
          const secondSelected =
            second.item.cellId === selectedCellIdRef.current ? 1 : 0;
          return secondSelected - firstSelected || first.rank - second.rank;
        });
        const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
        const { width, height } = labelMap.getContainer().getBoundingClientRect();

        for (const entry of ordered) {
          const isSelected = entry.item.cellId === selectedCellIdRef.current;
          const point = labelMap.project([
            entry.item.village.lon,
            entry.item.village.lat,
          ]);
          const boxWidth = Math.max(entry.element.offsetWidth, 92);
          const boxHeight = Math.max(entry.element.offsetHeight, 24);
          const box = {
            left: point.x - boxWidth / 2,
            right: point.x + boxWidth / 2,
            top: point.y - boxHeight - 10,
            bottom: point.y - 10,
          };
          const inViewport =
            box.right > 0 &&
            box.left < width &&
            box.bottom > 0 &&
            box.top < height;
          const rankEligible = isSelected || entry.rank <= maximumRank;
          const collision = occupied.some(
            (other) =>
              box.left < other.right + 5 &&
              box.right + 5 > other.left &&
              box.top < other.bottom + 4 &&
              box.bottom + 4 > other.top,
          );
          const visible =
            inViewport && rankEligible && (isSelected || !collision);
          entry.element.style.visibility = visible ? "visible" : "hidden";
          entry.element.tabIndex = visible ? 0 : -1;
          if (visible) occupied.push(box);
        }
      }

      labelMap.on("move", updateLabelVisibility);
      labelMap.on("zoom", updateLabelVisibility);
      labelMap.on("resize", updateLabelVisibility);
      removeVisibilityListeners = () => {
        labelMap.off("move", updateLabelVisibility);
        labelMap.off("zoom", updateLabelVisibility);
        labelMap.off("resize", updateLabelVisibility);
      };
      updateLabelVisibility();
    }

    void addVillageLabels();
    return () => {
      cancelled = true;
      removeVisibilityListeners();
      for (const { marker } of markers) marker.remove();
      if (villageMarkersRef.current === markers) villageMarkersRef.current = [];
    };
  }, [mapReady, selectedCellId, watchlist]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const selectedFilter: FilterSpecification = [
      "==",
      ["get", "id"],
      selectedCellId ?? "",
    ];
    map.setFilter("selected-cell-halo", selectedFilter);
    map.setFilter("selected-cell-outline", selectedFilter);
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
      {hoveredCell && (
        <div
          className="cell-hover-tooltip"
          style={{
            left: `min(calc(100% - 172px), ${hoveredCell.x + 12}px)`,
            top: `min(calc(100% - 76px), ${hoveredCell.y + 12}px)`,
          }}
          aria-hidden="true"
        >
          <strong>{hoveredCell.id}</strong>
          <span>{Math.round(hoveredCell.risk)} index · {hoveredCell.driver}</span>
        </div>
      )}
      <output className="coordinate-readout" aria-label="Map cursor coordinates">
        {coordinates
          ? `${Math.abs(coordinates[1]).toFixed(4)}°${coordinates[1] < 0 ? "S" : "N"}, ${Math.abs(coordinates[0]).toFixed(4)}°${coordinates[0] < 0 ? "W" : "E"}`
          : "Move over map for coordinates"}
      </output>
      <div className="map-legend" role="group" aria-label="Map legend">
        <span><i className="legend-risk-low" /> Below 35 · lower</span>
        <span><i className="legend-risk-medium" /> 35–65 · watch</span>
        <span><i className="legend-risk-high" /> Above 65 · elevated</span>
        <span><i className="legend-peat" /> Illustrative peat extent</span>
        <span><i className="legend-alert" /> Simulated clearing alert</span>
        <span><i className="legend-hotspot" /> Detected hotspot</span>
        <span><i className="legend-village" /> Village point</span>
      </div>
    </div>
  );
}
