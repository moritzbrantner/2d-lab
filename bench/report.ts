import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { BenchmarkResult, BenchmarkRunResult } from "./types";

const resultsDir = new URL("./results/", import.meta.url);

if (import.meta.main) {
  const runs = await readLatestRuns();
  if (runs.length === 0) {
    throw new Error("No benchmark result JSON files found in bench/results.");
  }
  const markdown = renderMarkdown(runs);
  const markdownPath = new URL("./results/latest.md", import.meta.url);
  await writeFile(markdownPath, markdown);
  console.log(`Wrote ${markdownPath.pathname}`);
}

export async function writeRunArtifacts(run: BenchmarkRunResult, prefix: string) {
  await mkdir(resultsDir, { recursive: true });
  const stamp = run.environment.timestamp.replaceAll(":", "-").replaceAll(".", "-");
  const jsonPath = new URL(`./results/${prefix}-${stamp}.json`, import.meta.url);
  const markdownPath = new URL("./results/latest.md", import.meta.url);

  await writeFile(jsonPath, `${JSON.stringify(run, null, 2)}\n`);
  const runs = await readLatestRuns();
  await writeFile(markdownPath, renderMarkdown(runs));

  return {
    jsonPath: jsonPath.pathname,
    markdownPath: markdownPath.pathname,
  };
}

export function renderMarkdown(runs: BenchmarkRunResult[]) {
  const lines = [
    "# Viz Engine Benchmark Results",
    "",
    "Lower latency is better. Relative values use `viz-engine js` as the baseline when present; otherwise they use the fastest external implementation, then the fastest implementation in the group.",
    "",
    "## Environment",
    "",
    "| runtime | mode | timestamp | cpu | os | version | commit |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const run of runs) {
    lines.push(
      [
        run.environment.runtime,
        run.config.mode,
        run.environment.timestamp,
        run.environment.cpu ?? run.environment.userAgent ?? "",
        run.environment.os ?? run.environment.browserName ?? "",
        run.environment.bunVersion ?? run.environment.browserVersion ?? "",
        run.environment.commit ?? "",
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }

  lines.push("", "## Summary", "");

  for (const run of runs) {
    lines.push(`### ${run.environment.runtime} ${run.config.mode}`, "");
    lines.push(
      "| case | size | implementation | mean ms | p95 ms | ops/sec | memory MB | relative |",
      "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |",
    );

    for (const result of run.results) {
      lines.push(formatResultRow(result));
    }
    lines.push("");
  }

  lines.push("## Fastest By Case", "");
  lines.push("| runtime | case | size | fastest | mean ms |");
  lines.push("| --- | --- | ---: | --- | ---: |");

  for (const run of runs) {
    for (const result of fastestByCase(run.results)) {
      lines.push(
        `| ${run.environment.runtime} | ${result.workload} | ${result.size} | ${result.implementation} | ${formatNumber(result.metric.meanMs)} |`,
      );
    }
  }

  const notes = collectNotes(runs);
  if (notes.length > 0) {
    lines.push("", "## Notes", "");
    for (const note of notes) {
      lines.push(`- ${note}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function readLatestRuns(extraRuns: BenchmarkRunResult[] = []) {
  await mkdir(resultsDir, { recursive: true });
  const files = (await readdir(resultsDir))
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(resultsDir.pathname, file));
  const newestByPrefix = new Map<string, string>();

  for (const file of files) {
    const prefix = basename(file).split("-")[0] ?? "run";
    const current = newestByPrefix.get(prefix);
    if (!current || (await stat(file)).mtimeMs > (await stat(current)).mtimeMs) {
      newestByPrefix.set(prefix, file);
    }
  }

  const runs = [];
  for (const file of newestByPrefix.values()) {
    runs.push(JSON.parse(await readFile(file, "utf8")) as BenchmarkRunResult);
  }

  return [...runs, ...extraRuns].sort((left, right) =>
    left.environment.runtime.localeCompare(right.environment.runtime),
  );
}

function formatResultRow(result: BenchmarkResult) {
  return [
    result.workload,
    result.size,
    result.implementation,
    formatNumber(result.metric.meanMs),
    formatNumber(result.metric.p95Ms),
    formatNumber(result.metric.hz),
    result.metric.memoryDeltaMb == null ? "" : formatNumber(result.metric.memoryDeltaMb),
    result.metric.relative == null ? "" : `${formatNumber(result.metric.relative)}x`,
  ]
    .join(" | ")
    .replace(/^/, "| ")
    .replace(/$/, " |");
}

function fastestByCase(results: BenchmarkResult[]) {
  const groups = new Map<string, BenchmarkResult[]>();

  for (const result of results) {
    const key = `${result.category}|${result.workload}|${result.size}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  return [...groups.values()].map(
    (group) => group.slice().sort((left, right) => left.metric.meanMs - right.metric.meanMs)[0]!,
  );
}

function collectNotes(runs: BenchmarkRunResult[]) {
  const notes = new Set<string>();

  for (const run of runs) {
    for (const result of run.results) {
      for (const note of result.notes) {
        notes.add(`${result.implementation}: ${note}`);
      }
    }
  }

  return [...notes].sort();
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
