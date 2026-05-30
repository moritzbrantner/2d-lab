import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), wasm(), react()],
  root: "examples",
  server: {
    fs: {
      allow: [projectRoot, resolve(projectRoot, "../rust-packages")],
    },
  },
});
