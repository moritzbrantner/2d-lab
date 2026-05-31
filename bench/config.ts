import type { BenchmarkConfig, BenchmarkMode, BenchmarkRuntime, BenchmarkSettings } from "./types";

export const benchmarkSeed = 0x5eed_2026;

export const defaultBenchmarkSettings: BenchmarkSettings = {
  iterations: 100,
  seed: benchmarkSeed,
  time: 1000,
  warmupIterations: 20,
  warmupTime: 250,
};

export const quickBenchmarkSettings: BenchmarkSettings = {
  iterations: 20,
  seed: benchmarkSeed,
  time: 250,
  warmupIterations: 5,
  warmupTime: 50,
};

export function createBenchmarkConfig(
  options: {
    mode?: BenchmarkMode;
    runtime?: BenchmarkRuntime;
  } = {},
): BenchmarkConfig {
  const mode = options.mode ?? "full";

  return {
    financeSizes: mode === "quick" ? [1_000, 10_000] : [10_000, 100_000, 1_000_000],
    geoSizes: mode === "quick" ? [1_000, 10_000] : [10_000, 100_000, 500_000],
    mode,
    runtime: options.runtime ?? "bun",
    settings: mode === "quick" ? quickBenchmarkSettings : defaultBenchmarkSettings,
    xySizes: mode === "quick" ? [1_000, 10_000] : [10_000, 100_000, 1_000_000],
  };
}

export function formatSize(size: number) {
  return size.toLocaleString("en-US").replaceAll(",", "_");
}
