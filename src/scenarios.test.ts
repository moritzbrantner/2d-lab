import { describe, expect, it } from "vitest";

import { validateDisplayList } from "./core/display-list";
import { findLabScenario, labScenarios } from "./scenarios";

describe("Pages scenario catalog", () => {
  it("keeps one stable scenario id per workload", () => {
    const ids = labScenarios.map((scenario) => scenario.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const scenario of labScenarios) {
      expect(scenario.id).toBe(scenario.workload.id);
      expect(scenario.title.trim().length).toBeGreaterThan(0);
      expect(scenario.useCase.trim().length).toBeGreaterThan(0);
      expect(scenario.question.trim().length).toBeGreaterThan(0);
      expect(scenario.frames).toBeGreaterThan(0);
      expect(findLabScenario(scenario.id)).toBe(scenario);
    }
  });

  it("keeps every scenario render input valid at the benchmark endpoints", () => {
    for (const scenario of labScenarios) {
      validateDisplayList(scenario.workload.create(0));
      validateDisplayList(scenario.workload.create((scenario.frames - 1) / 30));
    }
  });
});
