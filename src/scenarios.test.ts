import { describe, expect, it } from "vitest";

import { validateDisplayList } from "./core/display-list";
import { loadScenarioWorkload } from "./scenario-loader";
import { findLabScenario, labScenarios } from "./scenarios";

describe("Pages scenario catalog", () => {
  it("keeps one stable static page per scenario", () => {
    const ids = labScenarios.map((scenario) => scenario.id);
    const paths = labScenarios.map((scenario) => scenario.path);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);

    for (const scenario of labScenarios) {
      expect(scenario.path).toBe(`scenarios/${scenario.id}/`);
      expect(scenario.title.trim().length).toBeGreaterThan(0);
      expect(scenario.useCase.trim().length).toBeGreaterThan(0);
      expect(scenario.question.trim().length).toBeGreaterThan(0);
      expect(scenario.frames).toBeGreaterThan(0);
      expect(findLabScenario(scenario.id)).toBe(scenario);
    }
  });

  it("lazy-loads the matching workload for every isolated page", async () => {
    for (const scenario of labScenarios) {
      const workload = await loadScenarioWorkload(scenario.id);

      expect(workload.id).toBe(scenario.id);
      validateDisplayList(workload.create(0));
      validateDisplayList(workload.create((scenario.frames - 1) / 30));
    }
  });

  it("fails closed for an unknown scenario page", async () => {
    await expect(loadScenarioWorkload("unknown-scenario")).rejects.toThrow(
      /unknown scenario/,
    );
  });
});
