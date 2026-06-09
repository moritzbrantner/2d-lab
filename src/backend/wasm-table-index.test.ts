import { describe, expect, test, vi } from "vitest";

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

  test("uses wasm row indices for supported typed queries", () => {
    const wasm = new RustWasmVizTableIndex(fixture.columnarDataset);
    const spy = vi.spyOn(JsVizTableIndex.prototype, "getTypedTable");

    const output = wasm.getTypedTable({
      filters: [{ columnId: "score", operator: "gte", value: 60 }],
      rowLimit: 16,
      sort: [{ columnId: "score", direction: "desc" }],
    });

    expect(wasm.canUseWasmForQuery({ sort: [{ columnId: "score", direction: "desc" }] })).toBe(
      true,
    );
    expect(spy).not.toHaveBeenCalled();
    expect(output.summary.visibleRowCount).toBeLessThanOrEqual(16);
    spy.mockRestore();
  });

  test("matches rowLimit 0, empty results, and date columns", () => {
    expectParity({
      rowLimit: 0,
      sort: [{ columnId: "score", direction: "desc" }],
    });
    expectParity({
      filters: [{ columnId: "score", operator: "gt", value: 1_000_000 }],
      rowLimit: 32,
    });
    expectParity({
      filters: [{ columnId: "createdAt", operator: "gte", value: Date.UTC(2024, 0, 1) }],
      rowLimit: 32,
      sort: [{ columnId: "createdAt", direction: "asc" }],
    });
  });

  test("matches ASCII string filters", () => {
    expectParity({
      filters: [{ columnId: "name", operator: "contains", value: "core-na" }],
      rowLimit: 32,
    });
    expectParity({
      filters: [{ caseSensitive: true, columnId: "name", operator: "startsWith", value: "Ada" }],
      rowLimit: 32,
    });
    expectParity({
      filters: [{ columnId: "name", operator: "endsWith", value: "-0" }],
      rowLimit: 32,
    });
    expectParity({
      filters: [{ columnId: "category", operator: "equals", value: "core" }],
      rowLimit: 32,
    });
    expectParity({
      filters: [{ columnId: "category", operator: "notEquals", value: "core" }],
      rowLimit: 32,
    });
  });

  test("matches ASCII global search", () => {
    expectParity({
      rowLimit: 32,
      search: { columnIds: ["name", "category", "region"], query: "ada" },
    });
    expectParity({
      rowLimit: 32,
      search: { caseSensitive: true, columnIds: ["name"], query: "Ada" },
    });
  });

  test("reports supported WASM query coverage", () => {
    const wasm = new RustWasmVizTableIndex(fixture.columnarDataset);

    expect(
      wasm.canUseWasmForQuery({
        filters: [{ columnId: "score", operator: "gte", value: 70 }],
      }),
    ).toBe(true);
    expect(
      wasm.canUseWasmForQuery({
        filters: [{ columnId: "createdAt", operator: "gte", value: Date.UTC(2024, 0, 1) }],
      }),
    ).toBe(true);
    expect(
      wasm.canUseWasmForQuery({
        filters: [{ columnId: "active", operator: "equals", value: true }],
      }),
    ).toBe(true);
    expect(wasm.canUseWasmForQuery({ sort: [{ columnId: "score", direction: "desc" }] })).toBe(
      true,
    );
    expect(wasm.canUseWasmForQuery({ sort: [{ columnId: "active", direction: "asc" }] })).toBe(
      true,
    );
    expect(
      wasm.canUseWasmForQuery({
        filters: [{ columnId: "score", operator: "gte", value: 60 }],
        sort: [{ columnId: "score", direction: "desc" }],
      }),
    ).toBe(true);
    expect(
      wasm.canUseWasmForQuery({
        filters: [{ columnId: "name", operator: "contains", value: "core" }],
      }),
    ).toBe(true);
    expect(
      wasm.canUseWasmForQuery({
        search: { columnIds: ["name", "category"], query: "ada" },
      }),
    ).toBe(true);
  });

  test("falls back for unsupported string and mixed queries", () => {
    expectFallback({
      rowLimit: 32,
      sort: [{ columnId: "category", direction: "asc" }],
    });
    expectFallback({
      rowLimit: 32,
      search: { columnIds: ["name", "category", "region"], query: "core" },
      sort: [{ columnId: "score", direction: "desc" }],
    });
    expectFallback({
      filters: [{ columnId: "score", operator: "gte", value: 60 }],
      rowLimit: 32,
      sort: [{ columnId: "category", direction: "asc" }],
    });
    expectFallback({
      filters: [{ columnId: "active", operator: "equals", value: true }],
      rowLimit: 32,
      sort: [{ columnId: "active", direction: "asc" }],
    });
    expectFallback({
      rowLimit: 32,
      search: { columnIds: ["metadata"], query: "enabled" },
    });
    expectFallback({
      filters: [{ columnId: "name", operator: "contains", value: "é" }],
      rowLimit: 32,
    });
  });

  test("falls back for non-ASCII string columns", () => {
    const dataset = {
      columns: [{ id: "name", type: "string" as const, values: ["café", "core"] }],
      kind: "table" as const,
      rowIds: ["one", "two"],
    };
    const wasm = new RustWasmVizTableIndex(dataset);

    expect(
      wasm.canUseWasmForQuery({
        filters: [{ columnId: "name", operator: "contains", value: "caf" }],
      }),
    ).toBe(false);
  });

  test("reports WASM capabilities for string-only ASCII columnar datasets", () => {
    const wasm = new RustWasmVizTableIndex({
      columns: [{ id: "name", type: "string" as const, values: ["core", "edge"] }],
      kind: "table",
      rowIds: ["core", "edge"],
    });

    expect(wasm.getBackendCapabilities()).toMatchObject({
      backend: "wasm",
      implementation: "rust-viz-engine-wasm",
      usesWasm: true,
    });
  });

  test("reports WASM capabilities when another supported column exists beside non-ASCII strings", () => {
    const wasm = new RustWasmVizTableIndex({
      columns: [
        { id: "score", type: "number" as const, values: new Float64Array([1, 2]) },
        { id: "name", type: "string" as const, values: ["café", "core"] },
      ],
      kind: "table",
      rowIds: ["accent", "plain"],
    });

    expect(wasm.getBackendCapabilities()).toMatchObject({
      backend: "wasm",
      implementation: "rust-viz-engine-wasm",
      usesWasm: true,
    });
    expect(
      wasm.canUseWasmForQuery({
        filters: [{ columnId: "name", operator: "contains", value: "é" }],
      }),
    ).toBe(false);
  });

  test("falls back to JS capabilities for JSON and unknown-only columnar datasets", () => {
    const wasm = new RustWasmVizTableIndex({
      columns: [
        { id: "metadata", type: "json" as const, values: [{ enabled: true }] },
        { id: "raw", type: "unknown" as const, values: [Symbol.for("raw")] },
      ],
      kind: "table",
    });

    expect(wasm.getBackendCapabilities()).toMatchObject({
      backend: "js",
      implementation: "js",
      usesWasm: false,
    });
  });

  test("falls back to JS capabilities for empty columnar datasets", () => {
    const wasm = new RustWasmVizTableIndex({
      columns: [],
      kind: "table",
      rowIds: [],
    });

    expect(wasm.getBackendCapabilities()).toMatchObject({
      backend: "js",
      implementation: "js",
      usesWasm: false,
    });
  });

  test("object dataset constructor falls back to JS", () => {
    const wasm = new RustWasmVizTableIndex(fixture.objectDataset);

    expect(wasm.getBackendCapabilities()).toMatchObject({
      backend: "js",
      implementation: "js",
      usesWasm: false,
    });
    expect(
      wasm.canUseWasmForQuery({
        filters: [{ columnId: "score", operator: "gte", value: 60 }],
      }),
    ).toBe(false);
  });

  test("getTable continues to match JS for supported numeric queries", () => {
    const query = {
      filters: [{ columnId: "score", operator: "gte", value: 70 }],
      rowLimit: 16,
      sort: [{ columnId: "score", direction: "desc" }],
    } satisfies VizTableQuery;
    const js = new JsVizTableIndex(fixture.columnarDataset);
    const wasm = new RustWasmVizTableIndex(fixture.columnarDataset);

    expect(wasm.getTable(query)).toEqual(js.getTable(query));
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

  function expectFallback(query: VizTableQuery) {
    const js = new JsVizTableIndex(fixture.columnarDataset);
    const wasm = new RustWasmVizTableIndex(fixture.columnarDataset);
    const spy = vi.spyOn(JsVizTableIndex.prototype, "getTypedTable");

    expect(wasm.canUseWasmForQuery(query)).toBe(false);
    const expected = js.getTypedTable(query);
    spy.mockClear();
    const actual = wasm.getTypedTable(query);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(typedTableSnapshot(actual)).toEqual(typedTableSnapshot(expected));
    spy.mockRestore();
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
