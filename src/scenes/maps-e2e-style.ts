import { mapsScreenSnapshotToDisplayList } from "../adapters/maps-screen-snapshot";
import { mapsE2eStyleSnapshot } from "../fixtures/maps-e2e-style";
import type { BenchmarkWorkload } from "./types";

export const mapsE2eStyleWorkload: BenchmarkWorkload = {
  id: "maps-e2e-style",
  name: "Maps · E2E style snapshot",
  description:
    "Maps-owned post-projection E2E style snapshot: five land polygons plus graticule lines. 2d-lab consumes only resolved screen-space geometry and paint; Maps remains authoritative for projection and style semantics.",
  create() {
    return mapsScreenSnapshotToDisplayList(mapsE2eStyleSnapshot);
  },
};
