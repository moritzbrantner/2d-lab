import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(rootDir, "src", "wasm", "pkg");
const wasmPath = path.join(packageDir, "viz_engine_wasm_bg.wasm");
const embeddedPath = path.join(packageDir, "viz_engine_wasm_embedded.js");
const embeddedTypesPath = path.join(packageDir, "viz_engine_wasm_embedded.d.ts");
const wasmBase64 = readFileSync(wasmPath).toString("base64");

writeFileSync(
  embeddedPath,
  [
    'import * as imports from "./viz_engine_wasm_bg.js";',
    "",
    `const wasmBase64 = "${wasmBase64}";`,
    "let wasmExports = null;",
    "",
    "export const VizEngineWasmDensityIndex = imports.VizEngineWasmDensityIndex;",
    "",
    "export function initVizEngineWasm() {",
    "  if (wasmExports) {",
    "    return wasmExports;",
    "  }",
    "",
    "  const bytes = decodeBase64(wasmBase64);",
    "  const module = new WebAssembly.Module(bytes);",
    '  const instance = new WebAssembly.Instance(module, { "./viz_engine_wasm_bg.js": imports });',
    "",
    "  wasmExports = instance.exports;",
    "  imports.__wbg_set_wasm(wasmExports);",
    "  wasmExports.__wbindgen_start?.();",
    "",
    "  return wasmExports;",
    "}",
    "",
    "function decodeBase64(value) {",
    "  if (typeof atob === 'function') {",
    "    const binary = atob(value);",
    "    const bytes = new Uint8Array(binary.length);",
    "",
    "    for (let index = 0; index < binary.length; index += 1) {",
    "      bytes[index] = binary.charCodeAt(index);",
    "    }",
    "",
    "    return bytes;",
    "  }",
    "",
    "  return Uint8Array.from(Buffer.from(value, 'base64'));",
    "}",
    "",
  ].join("\n"),
);

writeFileSync(
  embeddedTypesPath,
  [
    "export class VizEngineWasmDensityIndex {",
    "  constructor(input: unknown);",
    "  static fromArrays(x: Float64Array, y: Float64Array, sourceIndices: Uint32Array, metricKeys: readonly string[], metrics: Float64Array, metricCount: number, ids: readonly string[], labels: readonly string[]): VizEngineWasmDensityIndex;",
    "  free(): void;",
    "  getBinnedSeries(query: unknown): unknown;",
    "  getCompactChartSeries(xMin: number, xMax: number, targetBinCount: number, includeEmptyBins: boolean, valueMode: string): unknown;",
    "  getCompactHeatmap(xMin: number, xMax: number, xBinCount: number, yBinCount: number, includeEmptyCells: boolean, yMin: number, yMax: number): unknown;",
    "  getCompactHistogram(bucketCount: number, includeEmptyBuckets: boolean, xMin: number, xMax: number, valueMin: number, valueMax: number): unknown;",
    "  getCompactRollingSeries(xMin: number, xMax: number, windowSize: number, minPeriods: number, alpha: number, statistic: string): unknown;",
    "  getHeatmap(query: unknown): unknown;",
    "  getHistogram(query: unknown): unknown;",
    "  getRollingSeries(query: unknown): unknown;",
    "  getSeriesBounds(): unknown;",
    "  hitTestX(query: unknown): unknown;",
    "}",
    "",
    "export function initVizEngineWasm(): WebAssembly.Exports;",
    "",
  ].join("\n"),
);
