import { describe, expect, it } from "vitest";

import { retainedMapChurnScene } from "./retained-map-churn";

describe("retained map churn workload", () => {
  it("changes exactly one row-sized retained chunk per update epoch", () => {
    const before = retainedMapChurnScene.create(0);
    const after = retainedMapChurnScene.create(0.34);
    const beforeChunks = before.retainedGeometryChunks!;
    const afterChunks = after.retainedGeometryChunks!;

    const changedChunks = afterChunks
      .map((chunk, index) =>
        chunk.revision === beforeChunks[index]!.revision ? -1 : index,
      )
      .filter((index) => index >= 0);
    expect(changedChunks).toEqual([0]);

    const changedCommands = after.commands.filter((command, index) => {
      const previous = before.commands[index]!;
      return command.points !== previous.points;
    });
    expect(changedCommands).toHaveLength(32);
  });
});
