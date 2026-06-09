import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import type { BenchmarkResult, BenchmarkRunResult } from "./types";

const resultsDir = new URL("./results/", import.meta.url);
const workloads = [
  "table/query/numeric-filter",
  "table/query/boolean-filter",
  "table/query/string-filter",
  "table/query/global-search",
  "table/query/numeric-sort",
  "table/query/boolean-sort",
  "table/query/combined-numeric",
] as const;
const largeAdoptionWorkloads = new Set([
  "table/query/numeric-filter",
  "table/query/numeric-sort",
  "table/query/combined-numeric",
]);
const requiredSizes = [10_000, 100_000, 1_000_000];

const inputPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const run = inputPath == null ? await readLatestBunRun() : await readRun(inputPath);
const tableResults = run.results.filter((result) => result.category === "table");

console.log(renderTableSummary(tableResults, run));

async function readLatestBunRun() {
  const files = (await readdir(resultsDir))
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(resultsDir.pathname, file));
  let latest: { mtimeMs: number; path: string; run: BenchmarkRunResult } | undefined;

  for (const file of files) {
    const run = await readRun(file);
    if (run.environment.runtime !== "bun") {
      continue;
    }

    const fileStat = await stat(file);
    if (!latest || fileStat.mtimeMs > latest.mtimeMs) {
      latest = { mtimeMs: fileStat.mtimeMs, path: file, run };
    }
  }

  if (!latest) {
    throw new Error("No Bun benchmark result JSON files found in bench/results.");
  }

  return latest.run;
}

async function readRun(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as BenchmarkRunResult;
}

function renderTableSummary(results: BenchmarkResult[], run: BenchmarkRunResult) {
  const gateStatus = computeGateStatus(results);
  const lines = [
    "# Table WASM Benchmark Summary",
    "",
    `Result: ${run.environment.runtime} ${run.config.mode} ${run.environment.timestamp}`,
    `Included workloads: ${formatIncludedWorkloads(results)}`,
    `required-sizes-present: ${gateStatus.requiredSizesPresent ? "yes" : "no"}`,
    `small-gate-10_000: ${gateStatus.smallGate ? "pass" : "fail"}`,
    `large-gate-100_000-plus: ${gateStatus.largeGate ? "pass" : "fail"}`,
    `adoption-ready: ${gateStatus.adoptionReady ? "yes" : "no"}`,
    "",
    "| workload | size | JS mean ms | WASM experimental mean ms | relative | verdict |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const workload of workloads) {
    const sizes = getSizes(results, workload);
    for (const size of sizes) {
      const jsResult = findResult(results, workload, size.label, "viz-engine js");
      const wasmResult = findResult(results, workload, size.label, "viz-engine wasm experimental");
      const ratio =
        jsResult && wasmResult && jsResult.metric.meanMs > 0
          ? wasmResult.metric.meanMs / jsResult.metric.meanMs
          : undefined;

      lines.push(
        [
          workload,
          size.label,
          jsResult ? formatNumber(jsResult.metric.meanMs) : "",
          wasmResult ? formatNumber(wasmResult.metric.meanMs) : "",
          ratio == null ? "" : `${formatNumber(ratio)}x`,
          verdict(size.value, ratio, wasmResult),
        ]
          .join(" | ")
          .replace(/^/, "| ")
          .replace(/$/, " |"),
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function computeGateStatus(results: BenchmarkResult[]) {
  const requiredSizesPresent = requiredSizes.every((size) =>
    [...largeAdoptionWorkloads].every((workload) => hasComparisonPair(results, workload, size)),
  );
  const smallRatios = workloads
    .map((workload) => ratioFor(results, workload, 10_000))
    .filter((ratio): ratio is number => ratio != null);
  const smallGate = smallRatios.length > 0 && smallRatios.every((ratio) => ratio <= 1.1);
  const largeGate = [...largeAdoptionWorkloads].some((workload) =>
    [100_000, 1_000_000].some((size) => {
      const ratio = ratioFor(results, workload, size);
      return ratio != null && ratio <= 0.87;
    }),
  );

  return {
    adoptionReady: requiredSizesPresent && smallGate && largeGate,
    largeGate,
    requiredSizesPresent,
    smallGate,
  };
}

function formatIncludedWorkloads(results: BenchmarkResult[]) {
  const included = [...new Set(results.map((result) => result.workload))].sort();
  return included.length === 0 ? "none" : included.join(", ");
}

function hasComparisonPair(results: BenchmarkResult[], workload: string, size: number) {
  const sizeLabel = String(size).replace(/\B(?=(\d{3})+(?!\d))/g, "_");
  return (
    findResult(results, workload, sizeLabel, "viz-engine js") != null &&
    findResult(results, workload, sizeLabel, "viz-engine wasm experimental") != null
  );
}

function ratioFor(results: BenchmarkResult[], workload: string, size: number) {
  const sizeLabel = String(size).replace(/\B(?=(\d{3})+(?!\d))/g, "_");
  const jsResult = findResult(results, workload, sizeLabel, "viz-engine js");
  const wasmResult = findResult(results, workload, sizeLabel, "viz-engine wasm experimental");
  if (!jsResult || !wasmResult || jsResult.metric.meanMs <= 0) {
    return undefined;
  }

  return wasmResult.metric.meanMs / jsResult.metric.meanMs;
}

function getSizes(results: BenchmarkResult[], workload: string) {
  const sizes = new Map<string, number>();

  for (const result of results) {
    if (result.workload === workload) {
      sizes.set(result.size, result.sizeValue ?? Number(result.size.replaceAll("_", "")));
    }
  }

  return [...sizes.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => left.value - right.value);
}

function findResult(
  results: BenchmarkResult[],
  workload: string,
  size: string,
  implementation: string,
) {
  return results.find(
    (result) =>
      result.workload === workload &&
      result.size === size &&
      result.implementation === implementation,
  );
}

function verdict(size: number, ratio: number | undefined, wasmResult: BenchmarkResult | undefined) {
  if (!wasmResult || ratio == null) {
    return "n/a";
  }
  if (size === 10_000 && ratio <= 1.1) {
    return "pass-small";
  }
  if (size >= 100_000 && ratio <= 0.87) {
    return "pass-large";
  }
  return "fail";
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
}
