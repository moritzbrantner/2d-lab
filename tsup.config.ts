import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/core.ts", "src/react.tsx"],
  esbuildOptions(options) {
    options.external = [...(options.external ?? []), "*.wasm"];
  },
  external: ["@mb-rust/finance-data-wasm", "@mb-rust/geo-viz-wasm", "react", "react/jsx-runtime"],
  format: ["esm"],
  outDir: "dist",
});
