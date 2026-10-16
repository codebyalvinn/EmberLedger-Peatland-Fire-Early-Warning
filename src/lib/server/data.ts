import type { DataMode } from "@/lib/config";

export async function readPublicData<T>(
  request: Request,
  path: string,
): Promise<T> {
  const url = new URL(path, request.url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Snapshot asset ${path} returned HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function parseMode(value: string | null): DataMode {
  return value === "live" ? "live" : "snapshot";
}

export function dataResponse<T>(
  body: T,
  options: {
    mode?: DataMode;
    snapshotDate: string;
    reason?: string;
    status?: number;
  },
) {
  const mode = options.mode ?? "snapshot";
  const headers = new Headers({
    "X-Data-Mode": mode,
    "X-Snapshot-Date": options.snapshotDate,
    "Cache-Control": "no-store",
  });
  if (mode === "snapshot") {
    headers.set("X-Demo-Data", "illustrative-scenario");
  }
  if (options.reason) headers.set("X-Data-Fallback", options.reason);
  return Response.json(body, { status: options.status ?? 200, headers });
}

export function fallbackMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 240);
  return "Live data is not available; using the bundled snapshot.";
}
