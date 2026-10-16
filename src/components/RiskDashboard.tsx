"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AOI, HORIZONS, type DataMode, type Horizon } from "@/lib/config";
import type { WatchItem } from "@/lib/engine/watchlist";
import { rankVillages } from "@/lib/engine/watchlist";
import type {
  BacktestMetrics,
  RiskFeature,
  SnapshotBundle,
  SourceSnapshot,
} from "@/lib/types";
import MapView from "@/components/MapView";

type DataStatus = {
  mode: DataMode;
  snapshotDate: string;
  reason: string;
  liveLayers: string;
  simulatedLayers: string;
};

type AlertMessage = {
  text: string;
  villageName: string;
  error?: string;
};

const horizonLabels: Record<Horizon, string> = {
  0: "Now",
  3: "+3 days",
  7: "+7 days",
};

const driverLabels: Record<WatchItem["topDriver"], string> = {
  dry: "Dryness",
  clear: "Clearing",
  hot: "Hotspots",
};

async function fetchTyped<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

function ReplayAndBacktest({
  dates,
  selectedDate,
  metrics,
  onSelect,
}: {
  dates: string[];
  selectedDate: string | null;
  metrics: BacktestMetrics | null;
  onSelect: (date: string | null) => void;
}) {
  const selectedIndex = selectedDate ? dates.indexOf(selectedDate) : -1;
  return (
    <section className="replay-section" aria-labelledby="replay-title">
      <div className="replay-heading">
        <div>
          <p className="eyebrow">REPLAY & EVIDENCE</p>
          <h2 id="replay-title">Inspect the score over time</h2>
          <p className="panel-explainer">
            Scrub the illustrative checkpoints to compare as-of risk with
            following-week hotspot markers. This is not a reconstruction of an
            observed fire season.
          </p>
        </div>
        {selectedDate && (
          <button
            className="replay-reset"
            type="button"
            onClick={() => onSelect(null)}
          >
            Return to latest snapshot
          </button>
        )}
      </div>

      <div className="replay-control">
        <label htmlFor="replay-date-slider">
          {selectedDate
            ? `As of ${formatSnapshotDate(selectedDate)}`
            : "Choose a scenario checkpoint"}
        </label>
        <input
          id="replay-date-slider"
          type="range"
          min={0}
          max={Math.max(0, dates.length - 1)}
          step={1}
          value={selectedIndex >= 0 ? selectedIndex : 0}
          disabled={!dates.length}
          onChange={(event) => {
            const date = dates[Number(event.currentTarget.value)];
            if (date) onSelect(date);
          }}
          aria-label="Illustrative replay date"
        />
        <div className="replay-date-list">
          {dates.map((date) => (
            <button
              key={date}
              type="button"
              className={date === selectedDate ? "is-active" : ""}
              onClick={() => onSelect(date)}
            >
              {formatSnapshotDate(date)}
            </button>
          ))}
        </div>
      </div>

      <div className="backtest-results">
        <div className="backtest-title">
          <strong>Historical backtest</strong>
          <span>{metrics?.status === "computed" ? "Archive metrics" : "Not measured"}</span>
        </div>
        <div className="backtest-grid">
          <BacktestMetric
            label="Top-20% hit rate"
            value={
              metrics?.status === "computed" && metrics.metrics
                ? `${(metrics.metrics.top20HitRate * 100).toFixed(1)}%`
                : "Unavailable"
            }
            explanation="Share of peat-cell fire observations in the top fifth of the ranked cells."
          />
          <BacktestMetric
            label="Lift over random"
            value={
              metrics?.status === "computed" && metrics.metrics
                ? `${metrics.metrics.lift.toFixed(2)}×`
                : "Unavailable"
            }
            explanation="Top-20% hit rate divided by the 0.20 random-ranking baseline."
          />
          <BacktestMetric
            label="Precision at top 100"
            value={
              metrics?.status === "computed" && metrics.metrics
                ? `${(metrics.metrics.precisionAtTop100 * 100).toFixed(1)}%`
                : "Unavailable"
            }
            explanation="Share of top-ranked peat cells with a hotspot in the next seven days."
          />
          <BacktestMetric
            label="Median lead time"
            value={
              metrics?.status === "computed" &&
              metrics.metrics &&
              metrics.metrics.medianLeadTimeDays !== null
                ? `${metrics.metrics.medianLeadTimeDays.toFixed(1)} days`
                : "Unavailable"
            }
            explanation="Days from first observed index at least 60 to the first observed hotspot."
          />
        </div>
        <p className="backtest-limitation">
          {metrics?.limitation ??
            "No verified archive was supplied. Scenario values are excluded from all empirical metrics."}
        </p>
        {metrics?.methodology && (
          <details className="formula-summary">
            <summary>Backtest methodology</summary>
            <p>{metrics.methodology}</p>
          </details>
        )}
      </div>
    </section>
  );
}

function BacktestMetric({
  label,
  value,
  explanation,
}: {
  label: string;
  value: string;
  explanation: string;
}) {
  return (
    <div className="backtest-metric" title={explanation}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{explanation}</small>
    </div>
  );
}

async function getOfflineWatchlist(horizon: Horizon) {
  const [snapshot, sources] = await Promise.all([
    fetchTyped<SnapshotBundle>("/data/snapshot-latest.json"),
    fetchTyped<SourceSnapshot>("/data/source-snapshot.json"),
  ]);
  return rankVillages(
    sources.villages,
    snapshot.cells[horizon],
    sources.alerts,
    10,
  );
}

function formatSnapshotDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf())
    ? date
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
}

function riskLabel(risk: number) {
  return risk >= 65 ? "Elevated index" : risk >= 35 ? "Watch index" : "Lower index";
}

function villageSourceNote(watchlist: WatchItem[], hasLiveInputs: boolean) {
  const inputNote = hasLiveInputs
    ? "Risk inputs: live weather and hotspots; simulated clearing and peat coverage."
    : "Risk inputs are illustrative scenario data.";
  const osmCount = watchlist.filter(
    (item) => item.village.source === "OpenStreetMap",
  ).length;
  if (osmCount === watchlist.length && osmCount > 0) {
    return `Village locations: © OpenStreetMap contributors. ${inputNote}`;
  }
  if (osmCount > 0) {
    return `Village locations include illustrative points and © OpenStreetMap contributors. ${inputNote}`;
  }
  return `Bundled village points are illustrative demo locations. ${inputNote}`;
}

export default function RiskDashboard() {
  const [horizon, setHorizon] = useState<Horizon>(0);
  const [requestedMode, setRequestedMode] = useState<DataMode>("snapshot");
  const [status, setStatus] = useState<DataStatus>({
    mode: "snapshot",
    snapshotDate: "2026-10-15",
    reason: "Bundled illustrative scenario.",
    liveLayers: "none",
    simulatedLayers: "weather, hotspots, clearing alerts, peat coverage",
  });
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [watchlistError, setWatchlistError] = useState("");
  const [replayDates, setReplayDates] = useState<string[]>([]);
  const [replayAsOf, setReplayAsOf] = useState<string | null>(null);
  const [backtest, setBacktest] = useState<BacktestMetrics | null>(null);
  const [selectedCell, setSelectedCell] = useState<RiskFeature | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<AlertMessage | null>(null);
  const [generatingMessageFor, setGeneratingMessageFor] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function loadReplayOptions() {
      try {
        const [sources, metrics] = await Promise.all([
          fetchTyped<SourceSnapshot>("/data/source-snapshot.json"),
          fetchTyped<BacktestMetrics>("/api/backtest"),
        ]);
        if (!cancelled) {
          setReplayDates(sources.replayDates);
          setBacktest(metrics);
        }
      } catch {
        if (!cancelled) {
          setReplayDates([]);
          setBacktest({
            status: "unavailable",
            methodology: "Historical evidence is not available in this build.",
            limitation:
              "The bundled scenario files could not be loaded; no empirical performance claim is available.",
          });
        }
      }
    }
    void loadReplayOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function updateWatchlist() {
      setWatchlistError("");
      try {
        const response = await fetch(
          `/api/watchlist?horizon=${horizon}&limit=10&mode=${requestedMode}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(`Watch-list endpoint returned HTTP ${response.status}`);
        }
        const data = (await response.json()) as WatchItem[];
        if (!cancelled) setWatchlist(data);
      } catch (error) {
        try {
          const offlineList = await getOfflineWatchlist(horizon);
          if (!cancelled) {
            setWatchlist(offlineList);
            setWatchlistError(
              error instanceof Error
                ? `API unavailable; computed from bundled files (${error.message}).`
                : "API unavailable; computed from bundled files.",
            );
          }
        } catch (offlineError) {
          if (!cancelled) {
            setWatchlist([]);
            setWatchlistError(
              offlineError instanceof Error
                ? `Watch-list snapshot could not be loaded: ${offlineError.message}`
                : "Watch-list snapshot could not be loaded.",
            );
          }
        }
      }
    }

    void updateWatchlist();
    return () => {
      cancelled = true;
    };
  }, [horizon, requestedMode]);

  function selectCell(cell: RiskFeature) {
    setSelectedCell(cell);
    setSelectedCellId(cell.properties.id);
  }

  function selectWatchItem(item: WatchItem) {
    setSelectedCellId(item.cellId);
    setAlertMessage(null);
  }

  function selectReplayDate(date: string | null) {
    setReplayAsOf(date);
    setSelectedCell(null);
    setSelectedCellId(null);
    setAlertMessage(null);
    if (date) setRequestedMode("snapshot");
  }

  async function generateMessage(item: WatchItem) {
    setGeneratingMessageFor(item.village.id);
    setAlertMessage(null);
    try {
      const response = await fetch("/api/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          villageId: item.village.id,
          horizon,
          lang: "id",
        }),
      });
      const body = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !body.text) {
        throw new Error(body.error ?? `Message endpoint returned HTTP ${response.status}`);
      }
      setAlertMessage({ text: body.text, villageName: item.village.name });
    } catch (error) {
      setAlertMessage({
        villageName: item.village.name,
        text: "",
        error:
          error instanceof Error
            ? error.message
            : "The message could not be generated.",
      });
    } finally {
      setGeneratingMessageFor(null);
    }
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <Link className="brand" href="/" aria-label="EmberLedger home">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>EmberLedger</span>
        </Link>
        <span className="header-description">Peatland fire early warning</span>
        <div className="actual-mode" aria-live="polite">
          <span className="actual-mode-dot" aria-hidden="true" />
          <span>
            {status.mode === "live" ? "LIVE DATA" : "SNAPSHOT · SCENARIO"}
            <small>
              {status.mode === "live"
                ? "Live layers verified"
                : `Snapshot date ${formatSnapshotDate(status.snapshotDate)}`}
            </small>
          </span>
        </div>
      </header>

      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">PEATLAND FIRE EARLY WARNING · INDONESIA</p>
          <h1>See the risk before ignition.</h1>
          <p className="dashboard-summary">
            A transparent relative risk index connects drying conditions with
            recent land clearing—signals a hotspot map cannot show in advance.
          </p>
        </div>
        <details className="scenario-disclosure">
          <summary>
            <span className="scenario-disclosure-dot" aria-hidden="true" />
            {status.mode === "live" ? "Live + simulated" : "Simulated data"}
          </summary>
          <p>
            {status.mode === "live"
              ? "Open-Meteo forecast and archive weather plus NASA FIRMS hotspots are live. Clearing alerts and peat coverage are simulated; the relative index is not calibrated. Do not use these scores to dispatch patrols."
              : "Weather, clearing alerts, hotspot locations, and peat coverage are illustrative, not verified field data. Do not use these scores to dispatch patrols."}
          </p>
        </details>
      </section>

      <section className="control-bar" aria-label="Map display controls">
        <div className="control-group">
          <span className="control-label">Forecast horizon</span>
          <div className="segmented-control" role="group" aria-label="Forecast horizon">
            {HORIZONS.map((value) => (
              <button
                type="button"
                key={value}
                className={horizon === value ? "is-active" : ""}
                aria-pressed={horizon === value}
                onClick={() => {
                  setHorizon(value);
                  setReplayAsOf(null);
                }}
              >
                {horizonLabels[value]}
              </button>
            ))}
          </div>
          {replayAsOf && (
            <span className="replay-horizon-hint">
              Choose a horizon to return to the latest snapshot.
            </span>
          )}
        </div>
        <div className="control-group">
          <span className="control-label">Data source</span>
          <div className="segmented-control" role="group" aria-label="Data source mode">
            {(["snapshot", "live"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={requestedMode === value ? "is-active" : ""}
                aria-pressed={requestedMode === value}
                onClick={() => {
                  setReplayAsOf(null);
                  setRequestedMode(value);
                }}
              >
                {value === "snapshot" ? "Snapshot" : "Live"}
              </button>
            ))}
          </div>
        </div>
        <span className="snapshot-badge" aria-live="polite">
          <span>
            <strong>Live:</strong> {status.liveLayers || "none"}
          </span>
          <span>
            <strong>Simulated:</strong> {status.simulatedLayers}
          </span>
        </span>
        {requestedMode === "live" && status.mode === "snapshot" && (
          <p className="fallback-note" role="status">
            Live feeds are unavailable; showing the bundled snapshot.
            {status.reason && ` ${status.reason}`}
          </p>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="map-section" aria-labelledby="map-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RISK MAP</p>
              <h2 id="map-title">{AOI.name}</h2>
            </div>
            <span className="map-horizon-tag">
              {replayAsOf
                ? `Replay · ${formatSnapshotDate(replayAsOf)}`
                : horizonLabels[horizon]}
            </span>
          </div>
          <MapView
            horizon={horizon}
            mode={requestedMode}
            replayAsOf={replayAsOf}
            watchlist={watchlist}
            selectedCellId={selectedCellId}
            onCellSelect={selectCell}
            onVillageSelect={selectWatchItem}
            onDataStatus={setStatus}
          />
          <p className="map-caption">
            Risk colors show relative index bands, not calibrated fire
            probabilities. Peat extent is an illustrative zone, not a verified
            peat boundary. This local map works offline.
          </p>
        </section>

        <aside className="side-column">
          <section className="watchlist-panel" aria-labelledby="watchlist-title">
            <div className="section-heading compact-heading">
              <div>
                <p className="eyebrow">PATROL PRIORITY</p>
                <h2 id="watchlist-title">Village watch-list</h2>
              </div>
              <span className="top-ten-badge">Top 10</span>
            </div>
            <p className="panel-explainer">
              Ranked by the maximum cell index within a 5 km radius. Select a
              village to inspect its highest-scoring cell.
            </p>
            <p className="panel-footnote">
              {villageSourceNote(watchlist, status.mode === "live")}
            </p>
            {replayAsOf && (
              <p className="replay-watchlist-note">
                Showing latest-snapshot rankings; watch-list values are not replayed.
              </p>
            )}
            {watchlistError && (
              <p className="inline-warning" role="status">{watchlistError}</p>
            )}
            <ol className="watchlist">
              {watchlist.map((item, index) => (
                <li key={item.village.id}>
                  <button
                    type="button"
                    className={`watch-item ${selectedCellId === item.cellId ? "is-selected" : ""}`}
                    onClick={() => selectWatchItem(item)}
                    disabled={Boolean(replayAsOf)}
                    aria-label={`Select ${item.village.name}, relative index ${Math.round(item.risk)} points`}
                  >
                    <span className="watch-rank">{index + 1}</span>
                    <span className="watch-copy">
                      <span className="watch-name">{item.village.name}</span>
                      <span className="watch-driver">
                        Top driver: {driverLabels[item.topDriver]}
                      </span>
                      <span
                        className="watch-contribution-bar"
                        role="img"
                        aria-label={`Contributions: dryness ${item.contributions.dry.toFixed(1)}, clearing ${item.contributions.clear.toFixed(1)}, hotspots ${item.contributions.hot.toFixed(1)} index points`}
                      >
                        {(
                          [
                            ["dry", item.contributions.dry, "#698d54"],
                            ["clear", item.contributions.clear, "#d4a448"],
                            ["hot", item.contributions.hot, "#b95342"],
                          ] as const
                        ).map(([key, value, color]) => (
                          <i
                            key={key}
                            style={{
                              width: `${
                                item.contributions.dry +
                                  item.contributions.clear +
                                  item.contributions.hot >
                                0
                                  ? (value /
                                      (item.contributions.dry +
                                        item.contributions.clear +
                                        item.contributions.hot)) *
                                    100
                                  : 0
                              }%`,
                              backgroundColor: color,
                            }}
                          />
                        ))}
                      </span>
                    </span>
                    <span className="watch-score">
                      {Math.round(item.risk)}
                      <small>index pts</small>
                    </span>
                  </button>
                  <button
                    className="message-action"
                    type="button"
                    disabled={Boolean(replayAsOf) || generatingMessageFor === item.village.id}
                    onClick={() => void generateMessage(item)}
                  >
                    {generatingMessageFor === item.village.id
                      ? "Preparing…"
                      : "Draft alert"}
                  </button>
                </li>
              ))}
            </ol>
            {!watchlist.length && !watchlistError && (
              <p className="panel-explainer">Loading village rankings…</p>
            )}
          </section>

          <CellPanel
            cell={selectedCell}
            asOfDate={replayAsOf ?? status.snapshotDate}
          />
        </aside>
      </div>

      <ReplayAndBacktest
        dates={replayDates}
        selectedDate={replayAsOf}
        metrics={backtest}
        onSelect={selectReplayDate}
      />

      {alertMessage && (
        <section className="message-panel" aria-labelledby="message-title">
          <div className="message-heading">
            <div>
              <p className="eyebrow">READY-TO-REVIEW · TEMPLATE</p>
              <h2 id="message-title">Alert draft for {alertMessage.villageName}</h2>
            </div>
            <button
              className="close-button"
              type="button"
              onClick={() => setAlertMessage(null)}
              aria-label="Close alert draft"
            >
              ×
            </button>
          </div>
          {alertMessage.error ? (
            <p className="inline-warning" role="alert">{alertMessage.error}</p>
          ) : (
            <pre className="message-text">{alertMessage.text}</pre>
          )}
          <p className="panel-explainer">
            Generated from illustrative inputs. Review with local officials;
            EmberLedger does not send SMS or WhatsApp messages.
          </p>
        </section>
      )}

      <Limitations />
      <footer className="dashboard-footer">
        <span>EmberLedger · decision support, not a calibrated probability</span>
        <span>Local demo map · no account, data store, or message sending</span>
      </footer>
    </main>
  );
}

function CellPanel({
  cell,
  asOfDate,
}: {
  cell: RiskFeature | null;
  asOfDate: string;
}) {
  if (!cell) {
    return (
      <section className="cell-panel empty-cell-panel" aria-labelledby="cell-panel-title">
        <p className="eyebrow">CELL EXPLANATION</p>
        <h2 id="cell-panel-title">Select a risk cell</h2>
        <p>
          Click a colored grid cell or a village in the watch-list. The panel
          shows the cell’s relative index, input signals, and weighted score
          contributions.
        </p>
        <FormulaSummary />
      </section>
    );
  }

  const { properties } = cell;
  const total = Math.max(properties.risk, 1);
  const contributions = [
    {
      key: "dry",
      label: "Dryness",
      value: properties.dryContribution,
      signal: properties.dry,
      color: "#698d54",
    },
    {
      key: "clear",
      label: "Clearing",
      value: properties.clearContribution,
      signal: properties.clear,
      color: "#d4a448",
    },
    {
      key: "hot",
      label: "Hotspots",
      value: properties.hotContribution,
      signal: properties.hot,
      color: "#b95342",
    },
    {
      key: "synergy",
      label: "Dry + clearing synergy",
      value: properties.synergyContribution,
      signal: null,
      color: "#62508f",
    },
  ];

  return (
    <section className="cell-panel" aria-labelledby="cell-panel-title">
      <p className="eyebrow">
        {properties.scenario
          ? "CELL EXPLANATION · ILLUSTRATIVE"
          : "CELL EXPLANATION · LIVE + SIMULATED INPUTS"}
      </p>
      <div className="cell-score-heading">
        <div>
          <h2 id="cell-panel-title">{properties.id}</h2>
          <p>{riskLabel(properties.risk)}</p>
        </div>
        <strong className="cell-score">
          {properties.risk.toFixed(1)}
          <small>index pts</small>
        </strong>
      </div>
      <p className="cell-asof">
        Inputs through {formatSnapshotDate(asOfDate)} · relative index points
      </p>

      <div className="signal-grid">
        <SignalValue
          label="Drought Code (DC)"
          value={properties.dc.toFixed(0)}
          explanation="Weather-driven dryness index; higher means drier."
        />
        <SignalValue
          label="Dry signal"
          value={properties.dry.toFixed(2)}
          explanation="Clamp((DC − 200) ÷ (600 − 200), 0, 1)."
        />
        <SignalValue
          label="Recent clearing"
          value={`${properties.alertCount} alerts`}
          explanation="High-confidence alerts within 5 km during the prior 60 days."
        />
        <SignalValue
          label="Detected hotspots"
          value={`${properties.hotspotCount} hotspots`}
          explanation="Hotspots within 5 km during the prior 7 days."
        />
        <SignalValue
          label="Illustrative peat share"
          value={`${Math.round(properties.peatFrac * 100)}%`}
          explanation="Assumed share of this cell on peat; no verified peat map was supplied."
        />
        <SignalValue
          label="Scaled signals"
          value={`Clear ${properties.clear.toFixed(2)} · Hot ${properties.hot.toFixed(2)}`}
          explanation="Clear = min(alerts ÷ 10, 1); Hot = min(hotspots ÷ 5, 1)."
        />
      </div>

      <div className="contribution-heading">
        <strong>Score contributions</strong>
        <span>relative index points</span>
      </div>
      <div
        className="contribution-bar"
        role="img"
        aria-label={contributions
          .map(({ label, value }) => `${label}: ${value.toFixed(1)} index points`)
          .join("; ")}
      >
        {contributions.map((contribution) => (
          <span
            key={contribution.key}
            style={{
              width: `${Math.max(0, (contribution.value / total) * 100)}%`,
              backgroundColor: contribution.color,
            }}
          />
        ))}
      </div>
      <ul className="contribution-list">
        {contributions.map((contribution) => (
          <li key={contribution.key}>
            <i style={{ backgroundColor: contribution.color }} aria-hidden="true" />
            <span>
              {contribution.label}
              {contribution.signal !== null
                ? ` · signal ${contribution.signal.toFixed(2)}`
                : ""}
            </span>
            <strong>{contribution.value.toFixed(1)} pts</strong>
          </li>
        ))}
      </ul>

      <div className="cell-data-note">
        <strong>Weather and score method</strong>
        <p>
          Drought Code starts at 100, uses a tropical day-length factor of 1.4,
          and rolls forward with daily rain and maximum temperature. The score
          uses a 92-day weather window with the first 30 days as spin-up.{" "}
          {properties.scenario
            ? "All displayed input values are illustrative scenario data."
            : "Weather and hotspot inputs are live; clearing alerts and peat coverage remain simulated. The index is not validated for operational decisions."}
        </p>
      </div>
      <FormulaSummary />
    </section>
  );
}

function SignalValue({
  label,
  value,
  explanation,
}: {
  label: string;
  value: string;
  explanation: string;
}) {
  return (
    <div className="signal-value" title={explanation}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{explanation}</small>
    </div>
  );
}

function FormulaSummary() {
  return (
    <details className="formula-summary">
      <summary>How the relative index is calculated</summary>
      <p>
        Risk index = 100 × (0.4 + 0.6 × peat share) ×
        (0.50 × dry + 0.30 × clear + 0.20 × hotspots). If dry is at least 0.60
        and clearing is at least 0.30, apply a 1.15 synergy multiplier; cap at
        100. “Lower,” “watch,” and “elevated” bands use index cutoffs at 35
        and 65. These are tunable demo values, not validated thresholds.
      </p>
    </details>
  );
}

function Limitations() {
  return (
    <section className="limitations" aria-labelledby="limitations-title">
      <div>
        <p className="eyebrow">HONEST LIMITATIONS</p>
        <h2 id="limitations-title">Use as a conversation starter, not a dispatch order.</h2>
      </div>
      <ul>
        <li>The score is a relative index, not a calibrated probability.</li>
        <li>Clearing alerts can arrive days late; hotspots report fires already detected.</li>
        <li>Peat can smoulder below ground; clouds and haze hide some satellite detections.</li>
        <li>Daily maximum temperature is a noon proxy; DC uses a 100 seed and 30-day spin-up.</li>
        <li>No measured water-table depth is included—the strongest practical extension.</li>
      </ul>
    </section>
  );
}
