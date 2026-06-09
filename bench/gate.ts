import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BenchmarkResult, BenchmarkRunResult } from "./types";

const resultsDir = new URL("./results/", import.meta.url);
const xyCompactGates = [
  "binned-compact/full-256",
  "binned-compact/full-1024",
  "binned-compact/viewport-256",
  "binned-compact/viewport-1024",
  "histogram-compact/all-128",
  "histogram-compact/all-512",
  "histogram-compact/viewport-128",
  "heatmap-compact/full-64x32",
  "heatmap-compact/full-128x64",
  "heatmap-compact/viewport-64x32",
] as const;
const xyRollingCompactGates = [
  "rolling-compact/mean-32",
  "rolling-compact/stdDev-128",
  "rolling-compact/zScore-128",
] as const;
const xySparseHeatmapGates = ["heatmap-sparse/full-128x64"] as const;
const geoDefaultFastGates = ["world", "city", "dense"] as const;
const tableWasmWorkloads = [
  "table/query/numeric-filter",
  "table/query/boolean-filter",
  "table/query/string-filter",
  "table/query/global-search",
  "table/query/numeric-sort",
  "table/query/boolean-sort",
  "table/query/combined-numeric",
] as const;
const tableLargeAdoptionWorkloads = [
  "table/query/numeric-filter",
  "table/query/numeric-sort",
  "table/query/combined-numeric",
] as const;
const tableRequiredSizes = [10_000, 100_000, 1_000_000] as const;

const inputPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const run = inputPath == null ? await readCombinedLatestBunRuns() : await readRun(inputPath);
const report = evaluatePerformanceGates(run);
const renderedReport = renderGateReport(run, report);

await writeFile(new URL("./results/performance-gate.md", import.meta.url), renderedReport);
console.log(renderedReport);

if (!report.passed) {
  process.exitCode = 1;
}

type GateCheck = {
  actual?: number;
  expected: string;
  name: string;
  passed: boolean;
  reason?: string;
};

type GateReport = {
  checks: GateCheck[];
  passed: boolean;
};

async function readCombinedLatestBunRuns() {
  const files = (await readdir(resultsDir))
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(resultsDir.pathname, file));
  const runs: Array<{ mtimeMs: number; run: BenchmarkRunResult }> = [];

  for (const file of files) {
    const run = await readRun(file);
    if (run.environment.runtime !== "bun") {
      continue;
    }

    const fileStat = await stat(file);
    runs.push({ mtimeMs: fileStat.mtimeMs, run });
  }

  if (!runs.length) {
    throw new Error("No Bun benchmark result JSON files found in bench/results.");
  }

  runs.sort((left, right) => left.mtimeMs - right.mtimeMs);
  const latestRun = runs[runs.length - 1]!.run;
  const mergedResults = new Map<string, BenchmarkResult>();

  for (const { run } of runs) {
    for (const result of run.results) {
      mergedResults.set(resultKey(result), result);
    }
  }

  return {
    ...latestRun,
    results: [...mergedResults.values()],
  };
}

async function readRun(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as BenchmarkRunResult;
}

function evaluatePerformanceGates(run: BenchmarkRunResult): GateReport {
  const results = run.results;
  const checks: GateCheck[] = [
    ...evaluateXyCompactGates(results),
    ...evaluateXySparseHeatmapGates(results),
    ...evaluateGeoDefaultFastGates(results),
    ...evaluateTableWasmGates(results),
  ];

  return {
    checks,
    passed: checks.every((check) => check.passed),
  };
}

function evaluateXyCompactGates(results: BenchmarkResult[]): GateCheck[] {
  const checks: GateCheck[] = [];

  for (const workload of xyCompactGates) {
    const ratio = ratioFor(results, {
      category: "xy",
      denominatorImplementation: "viz-engine js compact",
      numeratorImplementation: "viz-engine wasm compact",
      size: "10_000",
      workload,
    });

    checks.push(
      createRatioCheck({
        name: `xy ${workload} wasm compact faster than js compact at 10_000`,
        ratio,
        threshold: 1,
        thresholdText: "< 1.000x",
      }),
    );
  }

  for (const workload of xyRollingCompactGates) {
    const objectWorkload = workload.replace("rolling-compact", "rolling");
    const ratio = ratioFor(results, {
      category: "xy",
      denominatorImplementation: "viz-engine js",
      denominatorWorkload: objectWorkload,
      numeratorImplementation: "viz-engine js compact",
      size: "10_000",
      workload,
    });

    checks.push(
      createRatioCheck({
        name: `xy ${workload} js compact no worse than object output at 10_000`,
        ratio,
        threshold: 1.05,
        thresholdText: "<= 1.050x",
      }),
    );
  }

  return checks;
}

function evaluateXySparseHeatmapGates(results: BenchmarkResult[]): GateCheck[] {
  return xySparseHeatmapGates.map((workload) => {
    const ratio = ratioFor(results, {
      category: "xy",
      denominatorImplementation: "viz-engine js sparse-populated-cells",
      denominatorWorkload: "heatmap-variant/full-128x64",
      numeratorImplementation: "viz-engine js sparse",
      size: "10_000",
      workload,
    });

    return createRatioCheck({
      name: `xy ${workload} production sparse no worse than 1.25x variant at 10_000`,
      ratio,
      threshold: 1.25,
      thresholdText: "<= 1.250x",
    });
  });
}

function evaluateGeoDefaultFastGates(results: BenchmarkResult[]): GateCheck[] {
  return geoDefaultFastGates.map((viewport) => {
    const ratio = ratioFor(results, {
      category: "geo",
      denominatorImplementation: "viz-engine js fast",
      denominatorWorkload: `clusters-fast/${viewport}`,
      numeratorImplementation: "viz-engine js",
      size: "10_000",
      workload: `clusters/${viewport}`,
    });

    return createRatioCheck({
      name: `geo clusters/${viewport} default no worse than 1.50x explicit fast at 10_000`,
      ratio,
      threshold: 1.5,
      thresholdText: "<= 1.500x",
    });
  });
}

function evaluateTableWasmGates(results: BenchmarkResult[]): GateCheck[] {
  const checks: GateCheck[] = [];

  for (const workload of tableWasmWorkloads) {
    const ratio = tableRatioFor(results, workload, 10_000);
    checks.push(
      createRatioCheck({
        name: `${workload} wasm experimental no worse than 1.10x js at 10_000`,
        ratio,
        threshold: 1.1,
        thresholdText: "<= 1.100x",
      }),
    );
  }

  for (const size of tableRequiredSizes) {
    for (const workload of tableLargeAdoptionWorkloads) {
      const ratio = tableRatioFor(results, workload, size);
      checks.push({
        actual: ratio,
        expected: "comparison present",
        name: `${workload} has js and wasm experimental results at ${formatSize(size)}`,
        passed: ratio != null,
        reason: ratio == null ? "missing comparison pair" : undefined,
      });
    }
  }

  const hasLargeWin = tableLargeAdoptionWorkloads.some((workload) =>
    [100_000, 1_000_000].some((size) => {
      const ratio = tableRatioFor(results, workload, size);
      return ratio != null && ratio <= 0.87;
    }),
  );
  checks.push({
    expected: "at least one <= 0.870x at 100_000 or 1_000_000",
    name: "table wasm large adoption gate",
    passed: hasLargeWin,
    reason: hasLargeWin ? undefined : "no qualifying large-size wasm win found",
  });

  return checks;
}

function createRatioCheck(input: {
  name: string;
  ratio: number | undefined;
  threshold: number;
  thresholdText: string;
}): GateCheck {
  return {
    actual: input.ratio,
    expected: input.thresholdText,
    name: input.name,
    passed:
      (input.ratio != null && input.ratio < input.threshold) || input.ratio === input.threshold,
    reason: input.ratio == null ? "missing comparison pair" : undefined,
  };
}

function tableRatioFor(results: BenchmarkResult[], workload: string, size: number) {
  return ratioFor(results, {
    category: "table",
    denominatorImplementation: "viz-engine js",
    numeratorImplementation: "viz-engine wasm experimental",
    size: formatSize(size),
    workload,
  });
}

function ratioFor(
  results: BenchmarkResult[],
  options: {
    category: BenchmarkResult["category"];
    denominatorImplementation: string;
    denominatorWorkload?: string;
    numeratorImplementation: string;
    size: string;
    workload: string;
  },
) {
  const numerator = findResult(results, {
    category: options.category,
    implementation: options.numeratorImplementation,
    size: options.size,
    workload: options.workload,
  });
  const denominator = findResult(results, {
    category: options.category,
    implementation: options.denominatorImplementation,
    size: options.size,
    workload: options.denominatorWorkload ?? options.workload,
  });

  if (!numerator || !denominator || denominator.metric.meanMs <= 0) {
    return undefined;
  }

  return numerator.metric.meanMs / denominator.metric.meanMs;
}

function findResult(
  results: BenchmarkResult[],
  options: {
    category: BenchmarkResult["category"];
    implementation: string;
    size: string;
    workload: string;
  },
) {
  return results.find(
    (result) =>
      result.category === options.category &&
      result.implementation === options.implementation &&
      result.size === options.size &&
      result.workload === options.workload,
  );
}

function resultKey(result: BenchmarkResult) {
  return [result.category, result.workload, result.size, result.implementation].join("\0");
}

function renderGateReport(run: BenchmarkRunResult, report: GateReport) {
  const lines = [
    "# Performance Gate Summary",
    "",
    `Result: ${run.environment.runtime} ${run.config.mode} ${run.environment.timestamp}`,
    `status: ${report.passed ? "pass" : "fail"}`,
    "",
    "| gate | expected | actual | status |",
    "| --- | --- | ---: | --- |",
  ];

  for (const check of report.checks) {
    lines.push(
      [
        check.name,
        check.expected,
        check.actual == null ? (check.reason ?? "") : `${formatNumber(check.actual)}x`,
        check.passed ? "pass" : "fail",
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatSize(size: number) {
  return String(size).replace(/\B(?=(\d{3})+(?!\d))/g, "_");
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
