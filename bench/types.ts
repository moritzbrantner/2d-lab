export type BenchmarkCategory = "finance" | "frame" | "geo" | "startup" | "table" | "xy";

export type BenchmarkRuntime = "browser" | "bun";

export type BenchmarkMode = "full" | "quick";

export type BenchmarkCase = {
  category: BenchmarkCategory;
  external?: boolean;
  id: string;
  implementation: string;
  notes?: string[];
  prepare?: () => Promise<unknown> | unknown;
  run: (prepared: unknown) => Promise<unknown> | unknown;
  size: string;
  sizeValue?: number;
  validate?: (prepared: unknown) => Promise<void> | void;
  workload?: string;
};

export type BenchmarkSettings = {
  iterations: number;
  seed: number;
  time: number;
  warmupIterations: number;
  warmupTime: number;
};

export type BenchmarkConfig = {
  financeSizes: number[];
  geoSizes: number[];
  mode: BenchmarkMode;
  runtime: BenchmarkRuntime;
  settings: BenchmarkSettings;
  tableSizes: number[];
  xySizes: number[];
};

export type BenchmarkMetric = {
  hz: number;
  meanMs: number;
  memoryDeltaMb: number | null;
  p50Ms: number;
  p75Ms: number;
  p95Ms: number;
  p99Ms: number;
  relative?: number;
  rme: number;
  samples: number;
};

export type BenchmarkResult = {
  category: BenchmarkCategory;
  external: boolean;
  id: string;
  implementation: string;
  metric: BenchmarkMetric;
  notes: string[];
  size: string;
  sizeValue?: number;
  workload: string;
};

export type BenchmarkEnvironment = {
  arch?: string;
  browserName?: string;
  browserVersion?: string;
  bunVersion?: string;
  commit?: string;
  cpu?: string;
  deviceMemory?: number | null;
  hardwareConcurrency?: number | null;
  nodeVersion?: string;
  os?: string;
  packageVersion?: string;
  runtime: BenchmarkRuntime;
  timestamp: string;
  userAgent?: string;
  wasmSupported?: boolean;
};

export type BenchmarkRunResult = {
  config: {
    mode: BenchmarkMode;
    settings: BenchmarkSettings;
  };
  environment: BenchmarkEnvironment;
  results: BenchmarkResult[];
};
