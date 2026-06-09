import { describe, expect, test } from "vitest";

import { createTableFixture } from "../../bench/fixtures/table";
import { JsVizTableIndex } from "./js-table-index";

describe("JsVizTableIndex", () => {
  test("infers object-row columns in first-seen order", () => {
    const index = new JsVizTableIndex({
      kind: "table",
      rows: [
        { id: "a", name: "Ada", score: 10 },
        { active: true, id: "b", name: "Ben", score: null },
      ],
      rowIdKey: "id",
    });

    expect(index.getSchema().map((column) => [column.id, column.type])).toEqual([
      ["id", "string"],
      ["name", "string"],
      ["score", "number"],
      ["active", "boolean"],
    ]);
    expect(index.getRowById("b")).toMatchObject({
      rowId: "b",
      sourceIndex: 1,
    });
  });

  test("uses explicit columns, labels, and column order", () => {
    const index = new JsVizTableIndex({
      columns: [
        { id: "fullName", key: "name", label: "Full name", searchable: true },
        { id: "points", key: "score", label: "Points", type: "number" },
      ],
      kind: "table",
      rows: [{ name: "Ada", score: 10, ignored: "x" }],
    });

    const table = index.getTable({});

    expect(table.columns.map((column) => [column.id, column.label])).toEqual([
      ["fullName", "Full name"],
      ["points", "Points"],
    ]);
    expect(table.rows[0]?.cells.map((cell) => cell.value)).toEqual(["Ada", 10]);
  });

  test("supports columnar datasets and row ids", () => {
    const index = new JsVizTableIndex({
      columns: [
        { id: "name", values: ["Ada", "Ben"] },
        { id: "score", type: "number", values: Float64Array.from([10, 5]) },
        { id: "active", type: "boolean", values: Uint8Array.from([1, 0]) },
      ],
      kind: "table",
      rowIds: ["row-a", "row-b"],
    });

    expect(index.getRowCount()).toBe(2);
    expect(index.getRowById("row-b")?.cells.map((cell) => cell.value)).toEqual(["Ben", 5, false]);
  });

  test("sorts stably across multiple columns and places nulls last by default", () => {
    const index = new JsVizTableIndex({
      kind: "table",
      rows: [
        { id: "a", group: "x", score: 2 },
        { id: "b", group: "x", score: 2 },
        { id: "c", group: "x", score: null },
        { id: "d", group: "a", score: 5 },
      ],
      rowIdKey: "id",
    });

    expect(
      index
        .getTable({
          sort: [
            { columnId: "group", direction: "asc" },
            { columnId: "score", direction: "asc" },
          ],
        })
        .rows.map((row) => row.rowId),
    ).toEqual(["d", "a", "b", "c"]);
  });

  test("applies structured filters", () => {
    const index = new JsVizTableIndex({
      kind: "table",
      rows: [
        { id: "a", name: "Ada Lovelace", score: 10, tag: "math" },
        { id: "b", name: "Grace Hopper", score: 8, tag: "code" },
        { id: "c", name: "Katherine Johnson", score: 6, tag: null },
      ],
      rowIdKey: "id",
    });

    expect(
      index
        .getTable({ filters: [{ columnId: "name", operator: "contains", value: "hop" }] })
        .rows.map((row) => row.rowId),
    ).toEqual(["b"]);
    expect(
      index
        .getTable({ filters: [{ columnId: "score", operator: "between", value: [7, 10] }] })
        .rows.map((row) => row.rowId),
    ).toEqual(["a", "b"]);
    expect(
      index
        .getTable({ filters: [{ columnId: "tag", operator: "isNull" }] })
        .rows.map((row) => row.rowId),
    ).toEqual(["c"]);
    expect(
      index
        .getTable({ filters: [{ columnId: "tag", operator: "in", value: ["math", "code"] }] })
        .rows.map((row) => row.rowId),
    ).toEqual(["a", "b"]);
  });

  test("supports every table filter operator", () => {
    const index = new JsVizTableIndex({
      kind: "table",
      rows: [
        { id: "a", name: "Alpha Core", score: 10, tag: "core" },
        { id: "b", name: "Beta Edge", score: 20, tag: "edge" },
        { id: "c", name: "Gamma Core", score: 30, tag: null },
      ],
      rowIdKey: "id",
    });
    const rowIds = (operator: string, value?: unknown) =>
      index
        .getTable({
          filters: [{ columnId: operator === "isNull" ? "tag" : "name", operator, value } as never],
        })
        .rows.map((row) => row.rowId);
    const scoreRowIds = (operator: string, value?: unknown) =>
      index
        .getTable({ filters: [{ columnId: "score", operator, value } as never] })
        .rows.map((row) => row.rowId);

    expect(rowIds("contains", "core")).toEqual(["a", "c"]);
    expect(rowIds("startsWith", "alp")).toEqual(["a"]);
    expect(rowIds("endsWith", "edge")).toEqual(["b"]);
    expect(rowIds("equals", "beta edge")).toEqual(["b"]);
    expect(rowIds("notEquals", "beta edge")).toEqual(["a", "c"]);
    expect(scoreRowIds("gt", 10)).toEqual(["b", "c"]);
    expect(scoreRowIds("gte", 20)).toEqual(["b", "c"]);
    expect(scoreRowIds("lt", 30)).toEqual(["a", "b"]);
    expect(scoreRowIds("lte", 20)).toEqual(["a", "b"]);
    expect(scoreRowIds("between", [10, 20])).toEqual(["a", "b"]);
    expect(scoreRowIds("in", [10, 30])).toEqual(["a", "c"]);
    expect(rowIds("isNull")).toEqual(["c"]);
    expect(
      index
        .getTable({ filters: [{ columnId: "tag", operator: "isNotNull" }] })
        .rows.map((row) => row.rowId),
    ).toEqual(["a", "b"]);
  });

  test("scopes global search to requested searchable columns", () => {
    const index = new JsVizTableIndex({
      kind: "table",
      rows: [
        { id: "a", name: "Ada", region: "north" },
        { id: "b", name: "Ben", region: "ada-zone" },
      ],
      rowIdKey: "id",
    });

    expect(index.getTable({ search: { query: "ada" } }).rows.map((row) => row.rowId)).toEqual([
      "a",
      "b",
    ]);
    expect(
      index
        .getTable({ search: { columnIds: ["name"], query: "ada" } })
        .rows.map((row) => row.rowId),
    ).toEqual(["a"]);
    expect(
      index
        .getTable({ search: { columnIds: ["region"], query: "ada" } })
        .rows.map((row) => row.rowId),
    ).toEqual(["b"]);
  });

  test("keeps repeated-value multi-sort stable by source index", () => {
    const index = new JsVizTableIndex({
      kind: "table",
      rows: [
        { id: "a", category: "core", score: 2 },
        { id: "b", category: "core", score: 2 },
        { id: "c", category: "core", score: 2 },
        { id: "d", category: "edge", score: 1 },
      ],
      rowIdKey: "id",
    });

    expect(
      index
        .getTable({
          sort: [
            { columnId: "category", direction: "asc" },
            { columnId: "score", direction: "desc" },
          ],
        })
        .rows.map((row) => row.rowId),
    ).toEqual(["a", "b", "c", "d"]);
  });

  test("normalizes zero, negative, and invalid row offsets and limits", () => {
    const index = new JsVizTableIndex({
      kind: "table",
      rows: [
        { id: "a", score: 10 },
        { id: "b", score: 20 },
      ],
      rowIdKey: "id",
    });

    expect(index.getTable({ rowLimit: 0 }).summary).toMatchObject({
      rowLimit: 0,
      rowOffset: 0,
      visibleRowCount: 0,
    });
    expect(index.getTable({ rowLimit: -1, rowOffset: -10 }).summary).toMatchObject({
      rowLimit: 100,
      rowOffset: 0,
      visibleRowCount: 2,
    });
    expect(index.getTable({ rowLimit: Number.NaN, rowOffset: Number.POSITIVE_INFINITY }).summary)
      .toMatchObject({
        rowLimit: 100,
        rowOffset: 0,
        visibleRowCount: 2,
      });
  });

  test("returns explicit query column subsets in requested order", () => {
    const index = new JsVizTableIndex({
      columns: [
        { id: "id", type: "string" },
        { id: "name", type: "string" },
        { id: "score", type: "number" },
      ],
      kind: "table",
      rowIdKey: "id",
      rows: [{ id: "a", name: "Ada", score: 10 }],
    });

    const table = index.getTable({ columnIds: ["score", "name"] });
    expect(table.columns.map((column) => column.id)).toEqual(["score", "name"]);
    expect(table.rows[0]?.cells.map((cell) => cell.value)).toEqual([10, "Ada"]);
  });

  test("searches after filters and windows after sorting", () => {
    const index = new JsVizTableIndex({
      kind: "table",
      rows: [
        { id: "a", name: "Ada", role: "analyst", score: 10 },
        { id: "b", name: "Ben", role: "analyst", score: 5 },
        { id: "c", name: "Cam", role: "engineer", score: 7 },
        { id: "d", name: "Dee", role: "analyst", score: 8 },
      ],
      rowIdKey: "id",
    });

    const table = index.getTable({
      filters: [{ columnId: "role", operator: "equals", value: "analyst" }],
      rowLimit: 1,
      rowOffset: 1,
      search: { query: "a", columnIds: ["role"] },
      sort: [{ columnId: "score", direction: "desc" }],
    });

    expect(table.summary).toMatchObject({
      filteredRowCount: 3,
      rowLimit: 1,
      rowOffset: 1,
      visibleRowCount: 1,
    });
    expect(table.rows.map((row) => row.rowId)).toEqual(["d"]);
  });

  test("produces typed arrays for number, date, and boolean columns", () => {
    const index = new JsVizTableIndex({
      columns: [
        { id: "name", values: ["Ada", "Ben"] },
        { id: "score", type: "number", values: [10, null] },
        { id: "createdAt", type: "date", values: [new Date("2024-01-01T00:00:00Z"), null] },
        { id: "active", type: "boolean", values: [true, false] },
      ],
      kind: "table",
    });

    const typed = index.getTypedTable({});
    const score = typed.typedColumns.find((column) => column.id === "score");
    const createdAt = typed.typedColumns.find((column) => column.id === "createdAt");
    const active = typed.typedColumns.find((column) => column.id === "active");

    expect(score?.type).toBe("number");
    expect(score && "values" in score ? Array.from(score.values) : []).toEqual([10, Number.NaN]);
    expect(score && "validity" in score ? Array.from(score.validity) : []).toEqual([1, 0]);
    expect(createdAt?.type).toBe("date");
    expect(createdAt && "values" in createdAt ? createdAt.values[0] : null).toBe(
      Date.parse("2024-01-01T00:00:00Z"),
    );
    expect(active?.type).toBe("boolean");
    expect(active && "values" in active ? Array.from(active.values) : []).toEqual([1, 0]);
  });

  test("smoke tests a large deterministic columnar table fixture", () => {
    const fixture = createTableFixture(5_000, 1234);
    const index = new JsVizTableIndex(fixture.columnarDataset);
    const output = index.getTypedTable({
      filters: [{ columnId: "score", operator: "gte", value: 70 }],
      rowLimit: 64,
      sort: [{ columnId: "score", direction: "desc" }],
    });

    expect(index.getRowCount()).toBe(5_000);
    expect(output.summary.visibleRowCount).toBeGreaterThan(0);
    expect(output.summary.visibleRowCount).toBeLessThanOrEqual(64);
    expect(output.typedColumns.find((column) => column.id === "score")?.type).toBe("number");
  });

  test("applies validity masks for nullable numeric, date, and boolean columns", () => {
    const index = new JsVizTableIndex({
      columns: [
        {
          id: "score",
          nullable: true,
          type: "number",
          validity: Uint8Array.from([1, 0, 1]),
          values: Float64Array.from([10, 99, 30]),
        },
        {
          id: "createdAt",
          nullable: true,
          type: "date",
          validity: Uint8Array.from([0, 1, 1]),
          values: Float64Array.from([1, 2, 3]),
        },
        {
          id: "active",
          nullable: true,
          type: "boolean",
          validity: Uint8Array.from([1, 0, 1]),
          values: Uint8Array.from([1, 1, 0]),
        },
      ],
      kind: "table",
    });

    const typed = index.getTypedTable({});
    const score = typed.typedColumns.find((column) => column.id === "score");
    const createdAt = typed.typedColumns.find((column) => column.id === "createdAt");
    const active = typed.typedColumns.find((column) => column.id === "active");

    expect(score && "validity" in score ? Array.from(score.validity) : []).toEqual([1, 0, 1]);
    expect(score && "values" in score ? Array.from(score.values) : []).toEqual([
      10,
      Number.NaN,
      30,
    ]);
    expect(createdAt && "validity" in createdAt ? Array.from(createdAt.validity) : []).toEqual([
      0,
      1,
      1,
    ]);
    expect(active && "validity" in active ? Array.from(active.validity) : []).toEqual([1, 0, 1]);
    expect(active && "values" in active ? Array.from(active.values) : []).toEqual([1, 0, 0]);
  });
});
