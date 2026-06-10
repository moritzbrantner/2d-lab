import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = path.resolve(import.meta.dirname, "..");
const consumerSmokeEnabled = process.env.VIZ_ENGINE_PACKAGE_SMOKE_CONSUMER === "1";
const embeddedWasmMarker = "moritzbrantner_viz_engine_wasm_embedded";
const requiredFiles = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/core.js",
  "dist/core.d.ts",
  "dist/core-embedded.js",
  "dist/core-embedded.d.ts",
  "dist/core-lazy.js",
  "dist/core-lazy.d.ts",
  "dist/react.js",
  "dist/react.d.ts",
  "dist/worker.js",
  "dist/worker.d.ts",
  "dist/pkg/moritzbrantner_viz_engine_wasm.js",
  "dist/pkg/moritzbrantner_viz_engine_wasm_bg.wasm",
  "docs/getting-started.md",
  "docs/frame-formats.md",
  "docs/backends.md",
  "docs/errors-and-diagnostics.md",
  "docs/lazy-wasm.md",
  "docs/examples.md",
  "docs/react.md",
  "docs/worker-handoff.md",
  "docs/migration-typed-frames.md",
  "docs/why-this-exists.md",
  "README.md",
];
const distChunkFiles = getDistChunks();

for (const file of requiredFiles) {
  assert(existsSync(path.join(rootDir, file)), `Missing package artifact: ${file}`);
}
assert(distChunkFiles.length > 0, "Expected shared dist/chunk-*.js artifacts.");
for (const file of distChunkFiles) {
  assert(existsSync(path.join(rootDir, file)), `Missing package chunk artifact: ${file}`);
}

const packageJson = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
assert(packageJson.exports?.["./core"]?.import === "./dist/core.js", "Missing ./core export.");
assert(
  packageJson.exports?.["./core/embedded"]?.import === "./dist/core-embedded.js",
  "Missing ./core/embedded export.",
);
assert(
  packageJson.exports?.["./core/lazy"]?.import === "./dist/core-lazy.js",
  "Missing ./core/lazy export.",
);
assert(packageJson.exports?.["./react"]?.import === "./dist/react.js", "Missing ./react export.");
assert(
  packageJson.exports?.["./worker"]?.import === "./dist/worker.js",
  "Missing ./worker export.",
);
assert(packageJson.peerDependenciesMeta?.react?.optional === true, "React peer must be optional.");

const coreSource = readFileSync(path.join(rootDir, "dist/core.js"), "utf8");
assert(!importsReact(coreSource), "dist/core.js must not import React.");
const lazyCoreSource = readFileSync(path.join(rootDir, "dist/core-lazy.js"), "utf8");
assert(!importsReact(lazyCoreSource), "dist/core-lazy.js must not import React.");
assert(
  !lazyCoreSource.includes(embeddedWasmMarker),
  "dist/core-lazy.js must not include the embedded WASM module.",
);
assertNoEmbeddedWasmReachable("dist/core-lazy.js");
assertNoEmbeddedWasmReachable("dist/worker.js");

const core = await import(pathToFileURL(path.join(rootDir, "dist/core.js")).href);
assert(typeof core.createVizEngine === "function", "core export missing createVizEngine.");
assert(typeof core.getVizFrameTransferables === "function", "core export missing transfer helper.");
assert(typeof core.VizEngineError === "function", "core export missing VizEngineError.");
assert(!("VizEngineProvider" in core), "core export must not include React bindings.");

const smokeEngine = core.createVizEngine({ backend: "js", cache: { enabled: false } });
assert(typeof smokeEngine.clearCache === "function", "engine missing clearCache.");
assert(typeof smokeEngine.dispose === "function", "engine missing dispose.");
assert(typeof smokeEngine.getCacheStats === "function", "engine missing getCacheStats.");
assert(typeof smokeEngine.getResourceStats === "function", "engine missing getResourceStats.");

const embeddedCore = await import(pathToFileURL(path.join(rootDir, "dist/core-embedded.js")).href);
assert(
  typeof embeddedCore.createVizEngine === "function",
  "core/embedded export missing createVizEngine.",
);

const lazyCore = await import(pathToFileURL(path.join(rootDir, "dist/core-lazy.js")).href);
assert(
  typeof lazyCore.createAsyncVizEngine === "function",
  "core/lazy export missing createAsyncVizEngine.",
);
assert(!("VizEngineProvider" in lazyCore), "core/lazy export must not include React bindings.");

const workerApi = await import(pathToFileURL(path.join(rootDir, "dist/worker.js")).href);
assert(
  typeof workerApi.createVizWorkerClient === "function",
  "worker export missing createVizWorkerClient.",
);
assert(typeof workerApi.createVizWorkerHost === "function", "worker export missing host.");
assert(typeof workerApi.VizEngineError === "function", "worker export missing VizEngineError.");

const react = await import(pathToFileURL(path.join(rootDir, "dist/react.js")).href);
assert(typeof react.VizEngineProvider === "function", "react export missing VizEngineProvider.");
assert(typeof react.useVizFrame === "function", "react export missing useVizFrame.");

const root = await import(pathToFileURL(path.join(rootDir, "dist/index.js")).href);
assert(typeof root.createVizEngine === "function", "root export missing createVizEngine.");
assert(!("VizEngineProvider" in root), "root export must not include React bindings.");

const packOutput = execFileSync("bun", ["pm", "pack", "--dry-run", "--ignore-scripts"], {
  cwd: rootDir,
  encoding: "utf8",
});

for (const file of requiredFiles) {
  assert(packOutput.includes(file), `Package dry-run did not include ${file}.`);
}
for (const file of distChunkFiles) {
  assert(packOutput.includes(file), `Package dry-run did not include shared chunk ${file}.`);
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

function assertNoEmbeddedWasmReachable(entryFile) {
  for (const file of getReachableRelativeChunks(entryFile)) {
    const source = readFileSync(path.join(rootDir, file), "utf8");
    assert(
      !source.includes(embeddedWasmMarker),
      `${entryFile} imports embedded WASM through ${file}.`,
    );
  }
}

function getDistChunks() {
  const distDir = path.join(rootDir, "dist");
  if (!existsSync(distDir)) {
    return [];
  }

  return readdirSync(distDir)
    .filter((file) => /^chunk-.+\.js$/.test(file))
    .sort()
    .map((file) => `dist/${file}`);
}

function getReachableRelativeChunks(entryFile) {
  const pending = [entryFile];
  const visited = new Set();
  const chunks = new Set();

  while (pending.length) {
    const file = pending.pop();
    if (!file || visited.has(file)) {
      continue;
    }
    visited.add(file);

    const source = readFileSync(path.join(rootDir, file), "utf8");
    for (const importPath of getRelativeChunkImports(file, source)) {
      chunks.add(importPath);
      pending.push(importPath);
    }
  }

  return chunks;
}

function getRelativeChunkImports(file, source) {
  const imports = new Set();
  const importPattern = /(?:import|export)\s+(?:[^"']+\s+from\s+)?["'](\.\/chunk-[^"']+\.js)["']/g;
  const dynamicImportPattern = /import\(["'](\.\/chunk-[^"']+\.js)["']\)/g;

  for (const pattern of [importPattern, dynamicImportPattern]) {
    for (const match of source.matchAll(pattern)) {
      imports.add(path.posix.join(path.posix.dirname(file), match[1]));
    }
  }

  return imports;
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
  runLazyConsumerSmoke(smokeRoot, tarballPath);
  runWorkerConsumerSmoke(smokeRoot, tarballPath);
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

function runLazyConsumerSmoke(smokeRoot, tarballPath) {
  const workspace = path.join(smokeRoot, "lazy-no-react");
  mkdirSync(workspace, { recursive: true });
  writeJson(path.join(workspace, "package.json"), {
    dependencies: {
      "@moritzbrantner/viz-engine": `file:${tarballPath}`,
    },
    private: true,
    type: "module",
  });
  writeFileSync(
    path.join(workspace, "lazy.mjs"),
    [
      'import { strict as assert } from "node:assert";',
      'import { createAsyncVizEngine } from "@moritzbrantner/viz-engine/core/lazy";',
      "",
      'const engine = await createAsyncVizEngine({ backend: "js", wasm: { loadPolicy: "never" } });',
      'const datasetId = engine.addDataset({ kind: "xy", points: [{ x: 0, y: 1 }, { x: 1, y: 3 }] });',
      'engine.addLayer({ datasetId, kind: "heatmap", xBinCount: 2, yBinCount: 2 });',
      "const frame = engine.computeFrame({ viewport: { height: 120, width: 240, xDomain: [0, 1] } });",
      "assert.equal(frame.layers.length, 1);",
      "",
    ].join("\n"),
  );

  execFileSync("bun", ["install"], { cwd: workspace, stdio: "inherit" });
  execFileSync("bun", ["lazy.mjs"], { cwd: workspace, stdio: "inherit" });
}

function runWorkerConsumerSmoke(smokeRoot, tarballPath) {
  const workspace = path.join(smokeRoot, "worker-no-react");
  mkdirSync(workspace, { recursive: true });
  writeJson(path.join(workspace, "package.json"), {
    dependencies: {
      "@moritzbrantner/viz-engine": `file:${tarballPath}`,
    },
    devDependencies: {
      typescript: "6.0.2",
    },
    private: true,
    type: "module",
  });
  writeFileSync(
    path.join(workspace, "worker-smoke.ts"),
    [
      'import { createVizWorkerClient } from "@moritzbrantner/viz-engine/worker";',
      "",
      "const worker = {} as Worker;",
      "const client = createVizWorkerClient(worker);",
      "await client.computeFrame({ viewport: { height: 120, width: 240, xDomain: [0, 1] } });",
      "",
    ].join("\n"),
  );
  writeJson(path.join(workspace, "tsconfig.json"), {
    compilerOptions: {
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      target: "ES2022",
    },
    include: ["worker-smoke.ts"],
  });

  execFileSync("bun", ["install"], { cwd: workspace, stdio: "inherit" });
  execFileSync("bunx", ["tsc", "--noEmit"], { cwd: workspace, stdio: "inherit" });
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
      'import { createVizEngine } from "@moritzbrantner/viz-engine";',
      "",
      'assert.equal(typeof createVizEngine, "function");',
      'assert.ok(!("VizEngineProvider" in await import("@moritzbrantner/viz-engine")));',
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
