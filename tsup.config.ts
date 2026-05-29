import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  esbuildOptions(options) {
    options.external = [...(options.external ?? []), "*.wasm"];
  },
  external: [
    "@mb-rust/dense-data-wasm",
    "@mb-rust/geo-viz-core-wasm",
    "react",
    "react/jsx-runtime",
  ],
  format: ["esm"],
  outDir: "dist",
});
