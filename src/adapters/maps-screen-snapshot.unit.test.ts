import { describe, expect, it } from "vitest";

import { mapsE2eStyleSnapshot } from "../fixtures/maps-e2e-style";
import {
  mapsScreenSnapshotToDisplayList,
  type MapsScreenSnapshot,
} from "./maps-screen-snapshot";

describe("Maps screen snapshot adapter", () => {
  it("lowers the Maps-owned E2E screen snapshot without product semantics", () => {
    const displayList = mapsScreenSnapshotToDisplayList(mapsE2eStyleSnapshot);

    expect(displayList).toMatchObject({
      background: "#082f49",
      height: 720,
      width: 1200,
    });
    expect(mapsE2eStyleSnapshot.provenance).toMatchObject({
      sourceRepository: "moritzbrantner/maps",
    });
    expect(mapsE2eStyleSnapshot.provenance.sourceRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(displayList.commands).toHaveLength(13);
    expect(displayList.commands.filter((command) => command.closed)).toHaveLength(5);
  });

  it("fails closed for polygon holes instead of changing Maps semantics", () => {
    const snapshot: MapsScreenSnapshot = {
      background: "#000",
      provenance: {
        generatedBy: "test",
        sourceFixture: "test",
        sourceRepository: "moritzbrantner/maps",
        sourceRevision: "0000000000000000000000000000000000000000",
      },
      height: 100,
      schema: "maps-2d-lab-screen-frame/v1",
      width: 100,
      primitives: [
        {
          kind: "polygon",
          rings: [
            [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
            [
              { x: 2, y: 2 },
              { x: 4, y: 2 },
              { x: 4, y: 4 },
            ],
          ],
          fill: "#fff",
        },
      ],
    };

    expect(() => mapsScreenSnapshotToDisplayList(snapshot)).toThrow(/holes are unsupported/);
  });

  it("fails closed when provenance is not pinned to an exact Maps revision", () => {
    const snapshot = {
      ...mapsE2eStyleSnapshot,
      provenance: {
        ...mapsE2eStyleSnapshot.provenance,
        sourceRevision: "main",
      },
    } as unknown as MapsScreenSnapshot;

    expect(() => mapsScreenSnapshotToDisplayList(snapshot)).toThrow(/exact Maps source revision/);
  });

  it("fails closed for Maps primitives the lab cannot preserve", () => {
    const snapshot: MapsScreenSnapshot = {
      background: "#000",
      provenance: {
        generatedBy: "test",
        sourceFixture: "test",
        sourceRepository: "moritzbrantner/maps",
        sourceRevision: "0000000000000000000000000000000000000000",
      },
      height: 100,
      schema: "maps-2d-lab-screen-frame/v1",
      width: 100,
      primitives: [{ kind: "circle", radius: 4, x: 10, y: 10 }],
    };

    expect(() => mapsScreenSnapshotToDisplayList(snapshot)).toThrow(/circles are unsupported/);
  });
});
