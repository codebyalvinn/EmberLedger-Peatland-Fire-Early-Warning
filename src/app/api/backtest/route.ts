import { SNAPSHOT_DATE } from "@/lib/config";
import { dataResponse, readPublicData } from "@/lib/server/data";
import type { BacktestMetrics } from "@/lib/types";

const unavailable: BacktestMetrics = {
  status: "unavailable",
  methodology:
    "At each weekly as-of date, rank peat cells using only data then available and check for detected hotspots in the following seven days.",
  limitation:
    "No verified historical source archives were provided. Synthetic demo data is excluded from empirical backtest claims.",
};

export async function GET(request: Request) {
  try {
    const result = await readPublicData<BacktestMetrics>(
      request,
      "/data/backtest.json",
    );
    return dataResponse(result, {
      snapshotDate: SNAPSHOT_DATE,
      reason:
        result.status === "unavailable"
          ? result.limitation
          : "Metrics use verified historical archives; observed weather does not evaluate forecast skill.",
    });
  } catch {
    return dataResponse(unavailable, {
      snapshotDate: SNAPSHOT_DATE,
      reason: unavailable.limitation,
    });
  }
}
