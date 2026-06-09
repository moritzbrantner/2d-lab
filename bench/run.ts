import { cpus, arch, platform } from "node:os";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";

import { createBenchmarkCases } from "./cases";
import { createBenchmarkConfig } from "./config";
import { writeRunArtifacts } from "./report";
import { runBenchmarkCases } from "./runner";

import type { BenchmarkCategory, BenchmarkMode } from "./types";

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const mode: BenchmarkMode = args.has("--quick") ? "quick" : "full";
const category = parseCategory(rawArgs);
const workloads = parseWorkloads(rawArgs);
const config = createBenchmarkConfig({ mode, runtime: "bun" });
const cases = createBenchmarkCases(config).filter((benchmarkCase) => {
  if (category != null && benchmarkCase.category !== category) {
    return false;
  }
  if (workloads.size > 0 && !workloads.has(benchmarkCase.workload ?? benchmarkCase.id)) {
    return false;
  }
  return true;
});

console.log(
  `Running ${cases.length} benchmark cases in ${mode} mode${
    category == null ? "" : ` for ${category}`
  }${workloads.size === 0 ? "" : ` with ${workloads.size} workload filter(s)`}.`,
);

const run = await runBenchmarkCases({
  cases,
  config,
  environment: await createEnvironment(),
  getMemoryMb: () => process.memoryUsage().rss / 1024 / 1024,
  onCaseStart(benchmarkCase, index, total) {
    console.log(`[${index}/${total}] ${benchmarkCase.id}`);
  },
});

const artifacts = await writeRunArtifacts(run, "bun");
console.log(`Wrote ${artifacts.jsonPath}`);
console.log(`Wrote ${artifacts.markdownPath}`);

async function createEnvironment() {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    version?: string;
  };

  return {
    arch: arch(),
    bunVersion: typeof Bun !== "undefined" ? Bun.version : undefined,
    commit: getCommitSha(),
    cpu: cpus()[0]?.model,
    nodeVersion: process.versions.node,
    os: platform(),
    packageVersion: packageJson.version,
    runtime: "bun" as const,
    timestamp: new Date().toISOString(),
    wasmSupported: typeof WebAssembly !== "undefined",
  };
}

function getCommitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function parseCategory(args: string[]): BenchmarkCategory | undefined {
  const categories = new Set<BenchmarkCategory>([
    "finance",
    "frame",
    "geo",
    "startup",
    "table",
    "xy",
  ]);

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const value = arg.startsWith("--category=")
      ? arg.slice("--category=".length)
      : arg === "--category"
        ? args[index + 1]
        : undefined;

    if (value == null) {
      continue;
    }

    if (!categories.has(value as BenchmarkCategory)) {
      throw new Error(
        `Unknown benchmark category "${value}". Expected one of ${[...categories].join(", ")}.`,
      );
    }

    return value as BenchmarkCategory;
  }

  return undefined;
}

function parseWorkloads(args: string[]) {
  const workloads = new Set<string>();

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const value = arg.startsWith("--workload=")
      ? arg.slice("--workload=".length)
      : arg === "--workload"
        ? args[index + 1]
        : undefined;

    if (value != null) {
      workloads.add(value);
    }
  }

  return workloads;
}
