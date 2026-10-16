import { AOI } from "../src/lib/config";

async function printProbe(name: string, url: string, init?: RequestInit) {
  console.info(`\n=== ${name} ===`);
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    console.info(`HTTP ${response.status}`);
    console.info(text.slice(0, 8_000) || "(empty response)");
    if (!response.ok) {
      console.error(`${name} probe returned HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`${name} probe failed:`, error);
  }
}

async function main() {
  const { west, south, east, north } = AOI.bounds;
  const firmsKey = process.env.FIRMS_MAP_KEY;
  const gfwKey = process.env.GFW_API_KEY;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(now.getUTCDate() - 1);
  const firmsDate = yesterday.toISOString().slice(0, 10).replaceAll("-", "");

  const probes: Promise<void>[] = [
    printProbe(
      "Open-Meteo daily response (raw)",
      "https://api.open-meteo.com/v1/forecast?latitude=-2.75&longitude=113.75&daily=precipitation_sum%2Ctemperature_2m_max&past_days=2&forecast_days=2&timezone=auto",
    ),
    (async () => {
      const query = `[out:json][timeout:15];node["place"~"^(village|hamlet)$"](${south},${west},${north},${east});out body;`;
      for (const endpoint of [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
      ]) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              accept: "application/json",
              "user-agent": "EmberLedger/0.1 (peatland fire demo; contact: local prototype)",
            },
            body: new URLSearchParams({ data: query }),
            signal: AbortSignal.timeout(20_000),
          });
          const text = await response.text();
          console.info(`\n=== OpenStreetMap Overpass raw response (${endpoint}) ===`);
          console.info(`HTTP ${response.status}`);
          console.info(text.slice(0, 8_000) || "(empty response)");
          if (response.ok) return;
        } catch (error) {
          console.error(`Overpass probe endpoint ${endpoint} failed:`, error);
        }
      }
      console.error("All configured Overpass probe endpoints failed.");
    })(),
  ];

  if (firmsKey) {
    const source = process.env.FIRMS_SOURCE ?? "VIIRS_SNPP_NRT";
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(firmsKey)}/${encodeURIComponent(source)}/${west},${south},${east},${north}/1/${firmsDate}`;
    probes.push(printProbe("NASA FIRMS area response (raw)", url));
  } else {
    console.info("\n=== NASA FIRMS ===\nSkipped: FIRMS_MAP_KEY is not configured.");
  }

  if (gfwKey) {
    probes.push(
      printProbe("Global Forest Watch dataset catalogue (raw)", "https://data-api.globalforestwatch.org/datasets", {
        headers: { "x-api-key": gfwKey },
      }),
    );
  } else {
    console.info("\n=== Global Forest Watch ===\nSkipped: GFW_API_KEY is not configured.");
  }

  await Promise.all(probes);
}

void main();
