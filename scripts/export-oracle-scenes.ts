// Writes one JSON frame per oracle scenario for the native oracle (`oracle/`).
// Usage: bun scripts/export-oracle-scenes.ts [out-dir]   (default target/oracle-scenes)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { exportOracleScene, oracleScenarios } from "../src/oracle/scenarios";

const out = process.argv[2] ?? "target/oracle-scenes";
mkdirSync(out, { recursive: true });
for (const scenario of oracleScenarios) {
  const scene = exportOracleScene(scenario);
  writeFileSync(join(out, `${scene.name}.json`), JSON.stringify(scene));
  console.log(
    `${scene.name}: ${scene.commands} commands, custom ${scene.custom.error ?? "supported"}`,
  );
}
