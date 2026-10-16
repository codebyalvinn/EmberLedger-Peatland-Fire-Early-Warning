import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerPath = resolve(
  projectRoot,
  "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs",
);
const publicDirectory = resolve(projectRoot, "public");
const outputPath = resolve(publicDirectory, "maplibre-gl-worker.mjs");

await mkdir(publicDirectory, { recursive: true });
await copyFile(workerPath, outputPath);
console.info(`Copied the local MapLibre worker to ${outputPath}`);
