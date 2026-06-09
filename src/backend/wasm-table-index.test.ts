import { describe, expect, test } from "vitest";

import { createTableFixture } from "../../bench/fixtures/table";
import { JsVizTableIndex } from "./js-table-index";
import { RustWasmVizTableIndex } from "./rust-wasm-table-index";

import type { VizTableQuery, VizTypedTable } from "../types";

describe("RustWasmVizTableIndex", () => {
  const fixture = createTableFixture(256, 0x55aa);

  test("matches JS numeric filters", () => {
    expectParity({
      filters: [{ columnId: "score", operator: "gte", value: 70 }],
      rowLimit: 32,
    });
    expectParity({
      filters: [{ columnId: "nullableScore", operator: "isNull" }],
      rowLimit: 32,
    });
  });

  test("matches JS boolean filters", () => {
    expectParity({
      filters: [{ columnId: "active", operator: "equals", value: true }],
      rowLimit: 32,
    });
  });

  test("matches JS numeric and boolean sorts", () => {
    expectParity({
      rowLimit: 32,
      sort: [{ columnId: "score", direction: "desc" }],
    });
    expectParity({
      rowLimit: 32,
      sort: [{ columnId: "active", direction: "asc" }],
    });
  });

  test("matches JS null ordering", () => {
    expectParity({
      rowLimit: 32,
      sort: [{ columnId: "nullableScore", direction: "asc", nulls: "first" }],
    });
    expectParity({
      rowLimit: 32,
      sort: [{ columnId: "nullableScore", direction: "asc", nulls: "last" }],
    });
  });

  test("matches combined numeric filter, sort, and window output shape", () => {
    const output = expectParity({
      filters: [{ columnId: "score", operator: "gte", value: 60 }],
      rowLimit: 16,
      rowOffset: 4,
      sort: [{ columnId: "score", direction: "desc" }],
    });

    expect(output.typedColumns.find((column) => column.id === "score")?.type).toBe("number");
    expect(output.sourceIndex).toBeInstanceOf(Uint32Array);
    expect(output.summary.visibleRowCount).toBeLessThanOrEqual(16);
  });

  test("falls back for string search and string sorting", () => {
    expectParity({
      rowLimit: 32,
      search: { columnIds: ["name", "category", "region"], query: "core" },
    });
    expectParity({
      rowLimit: 32,
      sort: [{ columnId: "category", direction: "asc" }],
    });
  });

  function expectParity(query: VizTableQuery) {
    const js = new JsVizTableIndex(fixture.columnarDataset);
    const wasm = new RustWasmVizTableIndex(fixture.columnarDataset);
    expect(wasm.getBackendCapabilities()).toMatchObject({
      backend: "wasm",
      implementation: "rust-viz-engine-wasm",
      usesWasm: true,
    });

    const expected = js.getTypedTable(query);
    const actual = wasm.getTypedTable(query);

    expect(typedTableSnapshot(actual)).toEqual(typedTableSnapshot(expected));
    return actual;
  }
});

function typedTableSnapshot(table: VizTypedTable) {
  return {
    columns: table.columns.map((column) => [column.id, column.type]),
    rowIds: table.rowIds,
    sourceIndex: Array.from(table.sourceIndex),
    summary: table.summary,
    typedColumns: table.typedColumns.map((column) => ({
      id: column.id,
      type: column.type,
      validity: Array.from(column.validity),
      values: Array.from(column.values as ArrayLike<unknown>, normalizeSnapshotValue),
    })),
  };
}

function normalizeSnapshotValue(value: unknown) {
  return typeof value === "number" && Number.isNaN(value) ? "NaN" : value;
}
