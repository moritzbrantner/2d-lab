import { spawn } from "node:child_process";

import { chromium } from "playwright";

import { writeRunArtifacts } from "../report";

import type { BenchmarkMode, BenchmarkRunResult } from "../types";

const args = new Set(process.argv.slice(2));
const mode: BenchmarkMode = args.has("--quick") ? "quick" : "full";
const port = Number(process.env.VIZ_ENGINE_BENCH_PORT ?? 5187);
const host = "127.0.0.1";
const url = `http://${host}:${port}`;

const server = spawn(
  "bunx",
  [
    "vite",
    "--config",
    "bench/browser/vite.config.ts",
    "--host",
    host,
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: new URL("../../", import.meta.url).pathname,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  await waitForServer(url);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
  page.on("console", (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  await page.goto(url, { waitUntil: "networkidle" });

  const run = await page.evaluate((benchmarkMode) => window.runVizEngineBench(benchmarkMode), mode);
  const browserVersion = await browser.version();
  await browser.close();

  const result = run as BenchmarkRunResult;
  result.environment.browserVersion = browserVersion;
  result.environment.browserName = "chromium";

  const artifacts = await writeRunArtifacts(result, "browser");
  console.log(`Wrote ${artifacts.jsonPath}`);
  console.log(`Wrote ${artifacts.markdownPath}`);
} finally {
  server.kill("SIGTERM");
}

async function waitForServer(targetUrl: string) {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (server.exitCode != null) {
      throw new Error(`Vite server exited with code ${server.exitCode}`);
    }

    try {
      const response = await fetch(targetUrl);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${targetUrl}: ${String(lastError)}`);
}
