import { describe, expect, it } from "vitest";

import { mapsE2eStyleSnapshot } from "../fixtures/maps-e2e-style";
import { workloadProvenance } from "./provenance";

describe("workload provenance", () => {
  it("keeps the Maps fixture metadata pinned to the exported snapshot", () => {
    expect(workloadProvenance["maps-e2e-style"]).toMatchObject({
      kind: "consumer-shaped",
      sourceRepository: mapsE2eStyleSnapshot.provenance.sourceRepository,
      sourceRevision: mapsE2eStyleSnapshot.provenance.sourceRevision,
    });
  });
});
