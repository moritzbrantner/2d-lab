import { accessSync, constants, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.join(rootDir, "src", "wasm", "pkg");

if (!existsSync(packageDir)) {
  process.exit(0);
}

try {
  accessSync(packageDir, constants.W_OK);
  for (const entry of readdirSync(packageDir)) {
    const filePath = path.join(packageDir, entry);
    if (statSync(filePath).isFile()) {
      accessSync(filePath, constants.W_OK);
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    [
      "WASM output directory contains files this user cannot overwrite.",
      `Path: ${packageDir}`,
      `Error: ${message}`,
      "Fix ownership or permissions before running build:wasm.",
    ].join("\n"),
  );
  process.exit(1);
}
