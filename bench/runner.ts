import { Bench } from "tinybench";

import type {
  BenchmarkCase,
  BenchmarkConfig,
  BenchmarkMetric,
  BenchmarkResult,
  BenchmarkRunResult,
  BenchmarkEnvironment,
} from "./types";

export async function runBenchmarkCases(options: {
  cases: BenchmarkCase[];
  config: BenchmarkConfig;
  environment: BenchmarkEnvironment;
  getMemoryMb?: () => number | null;
  onCaseStart?: (benchmarkCase: BenchmarkCase, index: number, total: number) => void;
}): Promise<BenchmarkRunResult> {
  const results: BenchmarkResult[] = [];

  for (const [index, benchmarkCase] of options.cases.entries()) {
    options.onCaseStart?.(benchmarkCase, index + 1, options.cases.length);
    const prepared = benchmarkCase.prepare ? await benchmarkCase.prepare() : undefined;

    if (benchmarkCase.validate) {
      await benchmarkCase.validate(prepared);
    }

    const beforeMemory = options.getMemoryMb?.() ?? null;
    const bench = new Bench({
      iterations: options.config.settings.iterations,
      time: options.config.settings.time,
      warmupIterations: options.config.settings.warmupIterations,
      warmupTime: options.config.settings.warmupTime,
    });

    bench.add(benchmarkCase.id, () => benchmarkCase.run(prepared));
    await bench.run();

    const afterMemory = options.getMemoryMb?.() ?? null;
    const task = bench.tasks[0];
    if (!task?.result) {
      throw new Error(`Benchmark task did not produce a result: ${benchmarkCase.id}`);
    }

    results.push({
      category: benchmarkCase.category,
      external: benchmarkCase.external ?? false,
      id: benchmarkCase.id,
      implementation: benchmarkCase.implementation,
      metric: createMetric(task.result as TinybenchResult, beforeMemory, afterMemory),
      notes: benchmarkCase.notes ?? [],
      size: benchmarkCase.size,
      sizeValue: benchmarkCase.sizeValue,
      workload: benchmarkCase.workload ?? benchmarkCase.id,
    });
  }

  applyRelativeMetrics(results);

  return {
    config: {
      mode: options.config.mode,
      settings: options.config.settings,
    },
    environment: options.environment,
    results,
  };
}

type TinybenchResult = {
  hz?: number;
  latency?: {
    mean?: number;
    p50?: number;
    p75?: number;
    p99?: number;
    rme?: number;
    samples?: number[];
  };
  mean?: number;
  p75?: number;
  p99?: number;
  rme?: number;
  samples?: number[];
};

function createMetric(
  result: TinybenchResult,
  beforeMemory: number | null,
  afterMemory: number | null,
): BenchmarkMetric {
  const samples = result.latency?.samples ?? result.samples ?? [];
  const meanMs = result.latency?.mean ?? result.mean ?? 0;

  return {
    hz: result.hz ?? (meanMs > 0 ? 1000 / meanMs : 0),
    meanMs,
    memoryDeltaMb:
      beforeMemory == null || afterMemory == null ? null : Math.max(0, afterMemory - beforeMemory),
    p50Ms: result.latency?.p50 ?? percentile(samples, 0.5),
    p75Ms: result.latency?.p75 ?? result.p75 ?? percentile(samples, 0.75),
    p95Ms: percentile(samples, 0.95),
    p99Ms: result.latency?.p99 ?? result.p99 ?? percentile(samples, 0.99),
    rme: result.latency?.rme ?? result.rme ?? 0,
    samples: samples.length,
  };
}

function percentile(samples: number[], percentileValue: number) {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = samples.slice().sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
  );
  return sorted[index] ?? 0;
}

function applyRelativeMetrics(results: BenchmarkResult[]) {
  const groups = new Map<string, BenchmarkResult[]>();

  for (const result of results) {
    const key = [result.category, result.workload, result.size].join("|");
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  for (const group of groups.values()) {
    const vizJs = group.find((result) => result.implementation === "viz-engine js");
    const externalFastest = group
      .filter((result) => result.external)
      .sort((left, right) => left.metric.meanMs - right.metric.meanMs)[0];
    const fastest = group
      .slice()
      .sort((left, right) => left.metric.meanMs - right.metric.meanMs)[0];
    const baseline = vizJs ?? externalFastest ?? fastest;

    if (!baseline || baseline.metric.meanMs <= 0) {
      continue;
    }

    for (const result of group) {
      result.metric.relative = result.metric.meanMs / baseline.metric.meanMs;
    }
  }
}
