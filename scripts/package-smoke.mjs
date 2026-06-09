import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = path.resolve(import.meta.dirname, "..");
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

console.log("Package smoke checks passed.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function importsReact(source) {
  return /(?:import|from)\s*["']react(?:\/jsx-runtime)?["']/.test(source);
}
