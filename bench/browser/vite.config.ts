import wasm from "vite-plugin-wasm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const browserRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(browserRoot, "../..");

export default defineConfig({
  plugins: [wasm()],
  root: browserRoot,
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
});
