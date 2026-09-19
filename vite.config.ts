import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/viz-engine/" : "/",
  build: {
    target: "es2022",
  },
}));
