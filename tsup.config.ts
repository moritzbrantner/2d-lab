import { defineConfig } from "tsup";

const external = [
  "@mb-rust/finance-data-wasm",
  "@mb-rust/geo-viz-wasm",
  "react",
  "react/jsx-runtime",
];

const sharedConfig = {
  dts: true,
  esbuildOptions(options) {
    options.external = [...(options.external ?? []), "*.wasm"];
  },
  external,
  format: ["esm"],
  outDir: "dist",
} satisfies Parameters<typeof defineConfig>[0];

export default defineConfig([
  {
    ...sharedConfig,
    clean: true,
    entry: ["src/index.ts", "src/core.ts", "src/core-embedded.ts", "src/react.tsx"],
    splitting: true,
  },
  {
    ...sharedConfig,
    clean: false,
    entry: ["src/core-lazy.ts", "src/worker.ts"],
    splitting: false,
  },
]);
