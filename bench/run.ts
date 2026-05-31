import { cpus, arch, platform } from "node:os";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";

import { createBenchmarkCases } from "./cases";
import { createBenchmarkConfig } from "./config";
import { writeRunArtifacts } from "./report";
import { runBenchmarkCases } from "./runner";

import type { BenchmarkMode } from "./types";

const args = new Set(process.argv.slice(2));
const mode: BenchmarkMode = args.has("--quick") ? "quick" : "full";
const config = createBenchmarkConfig({ mode, runtime: "bun" });
const cases = createBenchmarkCases(config);

console.log(`Running ${cases.length} benchmark cases in ${mode} mode.`);

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
