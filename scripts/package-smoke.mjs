import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = path.resolve(import.meta.dirname, "..");
const consumerSmokeEnabled = process.env.VIZ_ENGINE_PACKAGE_SMOKE_CONSUMER === "1";
const requiredFiles = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/core.js",
  "dist/core.d.ts",
  "dist/react.js",
  "dist/react.d.ts",
  "docs/getting-started.md",
  "docs/frame-formats.md",
  "docs/backends.md",
  "docs/examples.md",
  "docs/react.md",
  "docs/worker-handoff.md",
  "docs/migration-typed-frames.md",
  "docs/why-this-exists.md",
  "README.md",
];

for (const file of requiredFiles) {
  assert(existsSync(path.join(rootDir, file)), `Missing package artifact: ${file}`);
}

const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
assert(packageJson.exports?.["./core"]?.import === "./dist/core.js", "Missing ./core export.");
assert(packageJson.exports?.["./react"]?.import === "./dist/react.js", "Missing ./react export.");
assert(packageJson.peerDependenciesMeta?.react?.optional === true, "React peer must be optional.");

const coreSource = readFileSync(path.join(rootDir, "dist/core.js"), "utf8");
assert(!importsReact(coreSource), "dist/core.js must not import React.");

const core = await import(pathToFileURL(path.join(rootDir, "dist/core.js")).href);
assert(typeof core.createVizEngine === "function", "core export missing createVizEngine.");
assert(typeof core.getVizFrameTransferables === "function", "core export missing transfer helper.");
assert(!("VizEngineProvider" in core), "core export must not include React bindings.");

const react = await import(pathToFileURL(path.join(rootDir, "dist/react.js")).href);
assert(typeof react.VizEngineProvider === "function", "react export missing VizEngineProvider.");
assert(typeof react.useVizFrame === "function", "react export missing useVizFrame.");

const root = await import(pathToFileURL(path.join(rootDir, "dist/index.js")).href);
assert(typeof root.createVizEngine === "function", "root export missing createVizEngine.");
assert(typeof root.VizEngineProvider === "function", "root export missing VizEngineProvider.");

const packOutput = execFileSync("bun", ["pm", "pack", "--dry-run", "--ignore-scripts"], {
  cwd: rootDir,
  encoding: "utf8",
});

for (const file of requiredFiles) {
  assert(packOutput.includes(file), `Package dry-run did not include ${file}.`);
}

if (consumerSmokeEnabled) {
  runConsumerSmoke();
}

console.log("Package smoke checks passed.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function importsReact(source) {
  return /(?:import|from)\s*["']react(?:\/jsx-runtime)?["']/.test(source);
}

function runConsumerSmoke() {
  const smokeRoot = path.join(rootDir, "temp", "package-smoke");
  const tarballName = "viz-engine-consumer-smoke.tgz";
  const tarballPath = path.join(smokeRoot, tarballName);

  rmSync(smokeRoot, { force: true, recursive: true });
  mkdirSync(smokeRoot, { recursive: true });

  execFileSync("bun", ["pm", "pack", "--filename", tarballPath, "--ignore-scripts"], {
    cwd: rootDir,
    stdio: "inherit",
  });

  runCoreConsumerSmoke(smokeRoot, tarballPath);
  runReactConsumerSmoke(smokeRoot, tarballPath);
}

function runCoreConsumerSmoke(smokeRoot, tarballPath) {
  const workspace = path.join(smokeRoot, "core-no-react");
  mkdirSync(workspace, { recursive: true });
  writeJson(path.join(workspace, "package.json"), {
    dependencies: {
      "@moritzbrantner/viz-engine": `file:${tarballPath}`,
    },
    private: true,
    type: "module",
  });
  writeFileSync(
    path.join(workspace, "core.mjs"),
    [
      'import { strict as assert } from "node:assert";',
      'import { createVizEngine } from "@moritzbrantner/viz-engine/core";',
      "",
      'const engine = createVizEngine({ backend: "js" });',
      'const datasetId = engine.addDataset({ kind: "xy", points: [{ x: 0, y: 1 }, { x: 1, y: 3 }] });',
      'engine.addLayer({ datasetId, kind: "binned-series", targetBinCount: 2 });',
      "const frame = engine.computeFrame({ viewport: { height: 120, width: 240, xDomain: [0, 1] } });",
      "assert.equal(frame.layers.length, 1);",
      'assert.equal(frame.layers[0].kind, "binned-series");',
      'assert.ok("typedSeries" in frame.layers[0]);',
      "",
    ].join("\n"),
  );

  execFileSync("bun", ["install"], { cwd: workspace, stdio: "inherit" });
  execFileSync("bun", ["core.mjs"], { cwd: workspace, stdio: "inherit" });
}

function runReactConsumerSmoke(smokeRoot, tarballPath) {
  const workspace = path.join(smokeRoot, "react-root");
  mkdirSync(workspace, { recursive: true });
  writeJson(path.join(workspace, "package.json"), {
    dependencies: {
      "@moritzbrantner/viz-engine": `file:${tarballPath}`,
      react: "^19.0.0",
    },
    private: true,
    type: "module",
  });
  writeFileSync(
    path.join(workspace, "react.mjs"),
    [
      'import { strict as assert } from "node:assert";',
      'import { VizEngineProvider, useVizFrame } from "@moritzbrantner/viz-engine/react";',
      "",
      'assert.equal(typeof VizEngineProvider, "function");',
      'assert.equal(typeof useVizFrame, "function");',
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(workspace, "root.mjs"),
    [
      'import { strict as assert } from "node:assert";',
      'import { createVizEngine, VizEngineProvider } from "@moritzbrantner/viz-engine";',
      "",
      'assert.equal(typeof createVizEngine, "function");',
      'assert.equal(typeof VizEngineProvider, "function");',
      "",
    ].join("\n"),
  );

  execFileSync("bun", ["install"], { cwd: workspace, stdio: "inherit" });
  execFileSync("bun", ["react.mjs"], { cwd: workspace, stdio: "inherit" });
  execFileSync("bun", ["root.mjs"], { cwd: workspace, stdio: "inherit" });
}

function writeJson(filePath, value) {
  writeFileSync(`${filePath}`, `${JSON.stringify(value, null, 2)}\n`);
}
