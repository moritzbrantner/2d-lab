import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/viz-engine/" : "/",
  build: {
    target: "es2022",
  },
});
