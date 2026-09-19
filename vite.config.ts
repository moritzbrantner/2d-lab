import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/2d-lab/" : "/",
  build: {
    target: "es2022",
  },
}));
