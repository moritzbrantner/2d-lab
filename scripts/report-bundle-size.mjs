import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const embeddedWasmMarker = "moritzbrantner_viz_engine_wasm_embedded";
const files = [
  "dist/index.js",
  "dist/core.js",
  "dist/core-embedded.js",
  "dist/core-lazy.js",
  "dist/react.js",
  "dist/worker.js",
  ...getDistChunks(),
  "dist/pkg/moritzbrantner_viz_engine_wasm_bg.wasm",
  "src/wasm/pkg/moritzbrantner_viz_engine_wasm_embedded.js",
  "src/wasm/pkg/moritzbrantner_viz_engine_wasm_bg.wasm",
];

const rows = files
  .filter((file) => existsSync(path.join(rootDir, file)))
  .map((file) => {
    const bytes = statSync(path.join(rootDir, file)).size;

    return {
      bytes,
      file,
    };
  });

if (!rows.length) {
  throw new Error("No bundle artifacts found. Run `bun run build` first.");
}

const fileWidth = Math.max("file".length, ...rows.map((row) => row.file.length));
const sizeWidth = Math.max("size".length, ...rows.map((row) => formatSize(row.bytes).length));

console.log(`${"file".padEnd(fileWidth)}  ${"size".padStart(sizeWidth)}`);
console.log(`${"-".repeat(fileWidth)}  ${"-".repeat(sizeWidth)}`);

for (const row of rows) {
  console.log(`${row.file.padEnd(fileWidth)}  ${formatSize(row.bytes).padStart(sizeWidth)}`);
}

console.log("");
console.log(
  "Note: core and core/embedded intentionally include the embedded local WASM shim; core/lazy must not include it.",
);

const lazyCorePath = path.join(rootDir, "dist/core-lazy.js");
if (existsSync(lazyCorePath)) {
  const lazyCoreSource = readFileSync(lazyCorePath, "utf8");
  if (lazyCoreSource.includes(embeddedWasmMarker)) {
    throw new Error("dist/core-lazy.js includes the embedded WASM payload.");
  }

  for (const importedFile of getRelativeChunkImports("dist/core-lazy.js")) {
    const importedSource = readFileSync(path.join(rootDir, importedFile), "utf8");
    if (importedSource.includes(embeddedWasmMarker)) {
      throw new Error(`dist/core-lazy.js imports embedded WASM through ${importedFile}.`);
    }
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

function getRelativeChunkImports(file) {
  const source = readFileSync(path.join(rootDir, file), "utf8");
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

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  }

  return `${(bytes / 1024).toFixed(1)} KiB`;
}
