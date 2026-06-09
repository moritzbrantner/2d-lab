import { existsSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const files = [
  "dist/index.js",
  "dist/core.js",
  "dist/react.js",
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
  "Note: the embedded local WASM shim is expected to dominate the default bundle until a lazy or light entrypoint is introduced.",
);

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  }

  return `${(bytes / 1024).toFixed(1)} KiB`;
}
