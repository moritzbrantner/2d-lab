import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/2d-lab/" : "/",
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: "index.html",
        "scenario-retained-map": "scenarios/retained-map/index.html",
        "scenario-maps-e2e-style": "scenarios/maps-e2e-style/index.html",
        "scenario-flat-stories-curves": "scenarios/flat-stories-curves/index.html",
        "scenario-vector-animation": "scenarios/vector-animation/index.html",
        "scenario-filled-polygons": "scenarios/filled-polygons/index.html",
        "scenario-map-like": "scenarios/map-like/index.html",
      },
    },
  },
}));
