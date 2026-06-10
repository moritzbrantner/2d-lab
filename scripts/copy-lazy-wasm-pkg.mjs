import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const sourceDir = path.join(rootDir, "src/wasm/pkg");
const targetDir = path.join(rootDir, "dist/pkg");

mkdirSync(targetDir, { recursive: true });

for (const file of [
  "moritzbrantner_viz_engine_wasm.js",
  "moritzbrantner_viz_engine_wasm.d.ts",
  "moritzbrantner_viz_engine_wasm_bg.js",
  "moritzbrantner_viz_engine_wasm_bg.wasm",
  "moritzbrantner_viz_engine_wasm_bg.wasm.d.ts",
]) {
  copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
}
