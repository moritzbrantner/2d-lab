import { createPreparedFrame } from "../adapters/viz-engine";
import { createTableIndex, JsVizTableIndex } from "../adapters/viz-engine";
import { formatSize } from "../config";
import { createTableFixture, tableColumnDefinitions } from "../fixtures/table";
import { assert, assertPositive, createCaseId } from "./utils";

import type { BenchmarkCase, BenchmarkConfig } from "../types";
import type { TableFixtureRow } from "../fixtures/table";
import type { VizTableQuery } from "../../src/types";

const windowQuery = { rowLimit: 128, rowOffset: 64 } satisfies VizTableQuery;
const numericFilterQuery = {
  filters: [{ columnId: "score", operator: "gte", value: 70 }],
  rowLimit: 128,
} satisfies VizTableQuery;
const stringFilterQuery = {
  filters: [{ columnId: "name", operator: "contains", value: "core-na" }],
  rowLimit: 128,
} satisfies VizTableQuery;
const nullFilterQuery = {
  filters: [{ columnId: "nullableScore", operator: "isNull" }],
  rowLimit: 128,
} satisfies VizTableQuery;
const booleanFilterQuery = {
  filters: [{ columnId: "active", operator: "equals", value: true }],
  rowLimit: 128,
} satisfies VizTableQuery;
const searchQuery = {
  rowLimit: 128,
  search: { columnIds: ["name", "category", "region"], query: "ada" },
} satisfies VizTableQuery;
const numericSortQuery = {
  rowLimit: 512,
  sort: [{ columnId: "score", direction: "desc" }],
} satisfies VizTableQuery;
const stringSortQuery = {
  rowLimit: 512,
  sort: [{ columnId: "category", direction: "asc" }],
} satisfies VizTableQuery;
const multiSortQuery = {
  rowLimit: 512,
  sort: [
    { columnId: "category", direction: "asc" },
    { columnId: "score", direction: "desc" },
  ],
} satisfies VizTableQuery;
const booleanSortQuery = {
  rowLimit: 512,
  sort: [{ columnId: "active", direction: "asc" }],
} satisfies VizTableQuery;
const combinedNumericQuery = {
  filters: [{ columnId: "score", operator: "gte", value: 65 }],
  rowLimit: 128,
  rowOffset: 16,
  sort: [{ columnId: "score", direction: "desc" }],
} satisfies VizTableQuery;
const combinedQuery = {
  filters: [{ columnId: "score", operator: "gte", value: 65 }],
  rowLimit: 128,
  rowOffset: 16,
  search: { columnIds: ["name", "category", "region"], query: "core" },
  sort: [
    { columnId: "category", direction: "asc" },
    { columnId: "score", direction: "desc" },
  ],
} satisfies VizTableQuery;
const combinedFrameQuery = {
  filters: combinedQuery.filters,
  search: combinedQuery.search,
  sort: combinedQuery.sort,
} satisfies VizTableQuery;

export function createTableCases(config: BenchmarkConfig): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  for (const size of config.tableSizes) {
    const fixture = createTableFixture(size, config.settings.seed);
    const sizeLabel = formatSize(size);

    cases.push({
      category: "table",
      id: createCaseId(["table", "index", "object-inferred", sizeLabel, "js"]),
      implementation: "viz-engine js",
      notes: ["Table benchmarks initially measure JS table paths only."],
      prepare: () => null,
      run: () =>
        new JsVizTableIndex({
          kind: "table",
          rowIdKey: "id",
          rows: fixture.rows,
        }),
      size: sizeLabel,
      sizeValue: size,
      validate: () => {
        const index = new JsVizTableIndex({
          kind: "table",
          rowIdKey: "id",
          rows: fixture.rows,
        });
        assert(index.getRowCount() === size, "object inferred table row count");
        assert(index.getSchema().length === tableColumnDefinitions.length, "inferred schema size");
      },
      workload: "table/index/object-inferred",
    });

    cases.push({
      category: "table",
      id: createCaseId(["table", "index", "object-explicit", sizeLabel, "js"]),
      implementation: "viz-engine js",
      notes: ["Table benchmarks initially measure JS table paths only."],
      prepare: () => null,
      run: () => new JsVizTableIndex(fixture.objectDataset),
      size: sizeLabel,
      sizeValue: size,
      validate: () => {
        const index = new JsVizTableIndex(fixture.objectDataset);
        assert(index.getRowCount() === size, "object explicit table row count");
        assert(index.getSchema()[0]?.id === tableColumnDefinitions[0]!.id, "explicit schema order");
      },
      workload: "table/index/object-explicit",
    });

    cases.push({
      category: "table",
      id: createCaseId(["table", "index", "columnar", sizeLabel, "js"]),
      implementation: "viz-engine js",
      notes: ["Table benchmarks initially measure JS table paths only."],
      prepare: () => null,
      run: () => createTableIndex("js", fixture.columnarDataset),
      size: sizeLabel,
      sizeValue: size,
      validate: () => {
        const index = createTableIndex("js", fixture.columnarDataset);
        assert(index.getRowCount() === size, "columnar table row count");
        assert(index.getRowById("row-00000000")?.sourceIndex === 0, "stable row ids");
      },
      workload: "table/index/columnar",
    });

    const queryCases: Array<{
      query: VizTableQuery;
      validate: (index: JsVizTableIndex) => void;
      workload: string;
    }> = [
      {
        query: windowQuery,
        validate: (index) => validateWindow(index, windowQuery),
        workload: "table/query/window",
      },
      {
        query: numericFilterQuery,
        validate: (index) =>
          validateFilteredCount(
            index,
            numericFilterQuery,
            fixture.rows.filter((row) => row.score >= 70).length,
          ),
        workload: "table/query/numeric-filter",
      },
      {
        query: stringFilterQuery,
        validate: (index) =>
          validateFilteredCount(
            index,
            stringFilterQuery,
            fixture.rows.filter((row) => row.name.toLocaleLowerCase().includes("core-na")).length,
          ),
        workload: "table/query/string-filter",
      },
      {
        query: nullFilterQuery,
        validate: (index) =>
          validateFilteredCount(
            index,
            nullFilterQuery,
            fixture.rows.filter((row) => row.nullableScore == null).length,
          ),
        workload: "table/query/null-filter",
      },
      {
        query: booleanFilterQuery,
        validate: (index) =>
          validateFilteredCount(
            index,
            booleanFilterQuery,
            fixture.rows.filter((row) => row.active).length,
          ),
        workload: "table/query/boolean-filter",
      },
      {
        query: searchQuery,
        validate: (index) => validateSearch(index, fixture.rows),
        workload: "table/query/global-search",
      },
      {
        query: numericSortQuery,
        validate: (index) => validateNumericSort(index),
        workload: "table/query/numeric-sort",
      },
      {
        query: stringSortQuery,
        validate: (index) => validateStringSort(index),
        workload: "table/query/string-sort",
      },
      {
        query: multiSortQuery,
        validate: (index) => validateMultiSort(index),
        workload: "table/query/multi-sort",
      },
      {
        query: booleanSortQuery,
        validate: (index) => validateBooleanSort(index),
        workload: "table/query/boolean-sort",
      },
      {
        query: combinedNumericQuery,
        validate: (index) =>
          validateCombinedNumeric(index, fixture.rows.filter((row) => row.score >= 65).length),
        workload: "table/query/combined-numeric",
      },
      {
        query: combinedQuery,
        validate: (index) => validateCombined(index),
        workload: "table/query/combined",
      },
    ];

    for (const queryCase of queryCases) {
      cases.push({
        category: "table",
        id: createCaseId([...queryCase.workload.split("/"), sizeLabel, "js"]),
        implementation: "viz-engine js",
        prepare: () => new JsVizTableIndex(fixture.objectDataset),
        run: (prepared) => (prepared as JsVizTableIndex).getTypedTable(queryCase.query),
        size: sizeLabel,
        sizeValue: size,
        validate: (prepared) => queryCase.validate(prepared as JsVizTableIndex),
        workload: queryCase.workload,
      });
    }

    for (const queryCase of [
      { query: numericFilterQuery, workload: "table/query/numeric-filter" },
      { query: booleanFilterQuery, workload: "table/query/boolean-filter" },
      { query: stringFilterQuery, workload: "table/query/string-filter" },
      { query: searchQuery, workload: "table/query/global-search" },
      { query: numericSortQuery, workload: "table/query/numeric-sort" },
      { query: booleanSortQuery, workload: "table/query/boolean-sort" },
      { query: combinedNumericQuery, workload: "table/query/combined-numeric" },
    ]) {
      const usesStringWasm =
        queryCase.workload === "table/query/string-filter" ||
        queryCase.workload === "table/query/global-search";
      cases.push({
        category: "table",
        id: createCaseId([...queryCase.workload.split("/"), sizeLabel, "wasm-experimental"]),
        implementation: "viz-engine wasm experimental",
        notes: usesStringWasm
          ? [
              "ASCII-only Rust string search/filter; non-ASCII and locale-sensitive behavior remain JS-owned.",
            ]
          : [
              "Experimental table WASM row uses Rust numeric/boolean kernels and JS typed table materialization.",
            ],
        prepare: () => createTableIndex("wasm", fixture.columnarDataset),
        run: (prepared) =>
          (prepared as ReturnType<typeof createTableIndex>).getTypedTable(queryCase.query),
        size: sizeLabel,
        sizeValue: size,
        validate: (prepared) =>
          validateWasmParity(
            new JsVizTableIndex(fixture.columnarDataset),
            prepared as ReturnType<typeof createTableIndex>,
            queryCase.query,
          ),
        workload: queryCase.workload,
      });
    }

    cases.push(
      createFrameCase("table/frame/typed/first", sizeLabel, size, fixture, "typed", "first"),
      createFrameCase(
        "table/frame/typed/same-window",
        sizeLabel,
        size,
        fixture,
        "typed",
        "same-window",
      ),
      createFrameCase(
        "table/frame/typed/shifting-window",
        sizeLabel,
        size,
        fixture,
        "typed",
        "shifting-window",
      ),
      createFrameCase("table/frame/objects/first", sizeLabel, size, fixture, "objects", "first"),
      createFrameCase(
        "table/frame/objects/shifting-window",
        sizeLabel,
        size,
        fixture,
        "objects",
        "shifting-window",
      ),
    );
  }

  return cases;
}

function createFrameCase(
  workload: string,
  sizeLabel: string,
  size: number,
  fixture: ReturnType<typeof createTableFixture>,
  frameFormat: "objects" | "typed",
  mode: "first" | "same-window" | "shifting-window",
): BenchmarkCase {
  return {
    category: "table",
    id: createCaseId([...workload.split("/"), sizeLabel, "js"]),
    implementation: "viz-engine js",
    prepare: () => {
      const prepared = createPreparedFrame({
        backend: "js",
        dataset: fixture.objectDataset,
        frameOptions: {
          frameFormat,
          viewport: { kind: "table", rowLimit: 128, rowOffset: 0 },
        },
        layers: [{ datasetId: "dataset", kind: "table", query: combinedFrameQuery }],
      });
      let offset = 0;
      if (mode === "same-window") {
        prepared.compute();
      }
      return { offset, prepared };
    },
    run: (preparedValue) => {
      const context = preparedValue as {
        offset: number;
        prepared: ReturnType<typeof createPreparedFrame>;
      };
      if (mode === "first") {
        return createPreparedFrame({
          backend: "js",
          dataset: fixture.objectDataset,
          frameOptions: {
            frameFormat,
            viewport: { kind: "table", rowLimit: 128, rowOffset: 0 },
          },
          layers: [{ datasetId: "dataset", kind: "table", query: combinedFrameQuery }],
        }).compute();
      }

      if (mode === "shifting-window") {
        context.offset = (context.offset + 16) % Math.max(16, size);
      }

      return context.prepared.engine.computeFrame({
        frameFormat,
        viewport: { kind: "table", rowLimit: 128, rowOffset: context.offset },
      });
    },
    size: sizeLabel,
    sizeValue: size,
    validate: (preparedValue) => {
      const context = preparedValue as {
        prepared: ReturnType<typeof createPreparedFrame>;
      };
      const frame = context.prepared.engine.computeFrame({
        frameFormat,
        viewport: { kind: "table", rowLimit: 128, rowOffset: 0 },
      });
      const layer = frame.layers[0];
      assert(layer?.kind === "table", "table frame layer");
      if (frameFormat === "typed") {
        assert("typedTable" in layer, "typed table payload");
        validateTypedColumns(layer.typedTable);
      } else {
        assert("table" in layer, "object table payload");
        assertPositive(layer.table.summary.visibleRowCount, "object table visible rows");
      }
    },
    workload,
  };
}

function validateWindow(index: JsVizTableIndex, query: VizTableQuery) {
  const output = index.getTypedTable(query);
  assert(output.summary.visibleRowCount === query.rowLimit, "window visible row count");
  assert(output.sourceIndex[0] === query.rowOffset, "window source offset");
  validateTypedColumns(output);
}

function validateFilteredCount(index: JsVizTableIndex, query: VizTableQuery, expected: number) {
  const output = index.getTypedTable(query);
  assert(output.summary.filteredRowCount === expected, "filtered row count");
  assertPositive(output.summary.visibleRowCount, "filtered visible row count");
}

function validateSearch(index: JsVizTableIndex, rows: readonly TableFixtureRow[]) {
  const output = index.getTypedTable(searchQuery);
  const expected = rows.filter((row) =>
    [row.name, row.category, row.region].some((value) => value.toLocaleLowerCase().includes("ada")),
  ).length;
  assert(output.summary.filteredRowCount === expected, "search filtered row count");
  assertPositive(output.summary.visibleRowCount, "search visible row count");
}

function validateNumericSort(index: JsVizTableIndex) {
  const output = index.getTypedTable(numericSortQuery);
  const scoreColumn = output.typedColumns.find((column) => column.id === "score");
  assert(scoreColumn?.type === "number", "numeric sort score column");
  assertDescending(Array.from(scoreColumn.values), "score desc");
}

function validateStringSort(index: JsVizTableIndex) {
  const output = index.getTable(stringSortQuery);
  const categories = output.rows.map((row) => String(row.cells[2]?.value ?? ""));
  assertAscending(categories, "category asc");
  assertStableWithinTies(
    output.rows.map((row) => ({
      key: String(row.cells[2]?.value ?? ""),
      sourceIndex: row.sourceIndex,
    })),
    "category stable tie sort",
  );
}

function validateMultiSort(index: JsVizTableIndex) {
  const output = index.getTable(multiSortQuery);
  for (let rowIndex = 1; rowIndex < output.rows.length; rowIndex++) {
    const previous = output.rows[rowIndex - 1]!;
    const current = output.rows[rowIndex]!;
    const previousCategory = String(previous.cells[2]?.value ?? "");
    const currentCategory = String(current.cells[2]?.value ?? "");
    const previousScore = Number(previous.cells[4]?.value ?? 0);
    const currentScore = Number(current.cells[4]?.value ?? 0);
    assert(
      previousCategory < currentCategory ||
        (previousCategory === currentCategory && previousScore >= currentScore),
      "category asc score desc order",
    );
  }
}

function validateBooleanSort(index: JsVizTableIndex) {
  const output = index.getTypedTable(booleanSortQuery);
  const activeColumn = output.typedColumns.find((column) => column.id === "active");
  assert(activeColumn?.type === "boolean", "boolean sort active column");
  const values = Array.from(activeColumn.values);
  for (let index = 1; index < values.length; index++) {
    assert(values[index - 1]! <= values[index]!, "active asc order");
  }
}

function validateCombinedNumeric(index: JsVizTableIndex, expected: number) {
  const output = index.getTypedTable(combinedNumericQuery);
  const scoreColumn = output.typedColumns.find((column) => column.id === "score");
  assert(output.summary.filteredRowCount === expected, "combined numeric filtered row count");
  assert(
    output.summary.visibleRowCount <= combinedNumericQuery.rowLimit,
    "combined numeric row limit",
  );
  assert(scoreColumn?.type === "number", "combined numeric score column");
  assertDescending(Array.from(scoreColumn.values), "combined numeric score desc");
}

function validateCombined(index: JsVizTableIndex) {
  const output = index.getTypedTable(combinedQuery);
  assertPositive(output.summary.filteredRowCount, "combined filtered row count");
  assert(output.summary.visibleRowCount <= combinedQuery.rowLimit, "combined row limit");
  validateTypedColumns(output);
}

function validateWasmParity(
  jsIndex: JsVizTableIndex,
  wasmIndex: ReturnType<typeof createTableIndex>,
  query: VizTableQuery,
) {
  const expected = jsIndex.getTypedTable(query);
  const actual = wasmIndex.getTypedTable(query);
  assert(
    JSON.stringify(typedTableSnapshot(actual)) === JSON.stringify(typedTableSnapshot(expected)),
    "experimental wasm table parity",
  );
}

function typedTableSnapshot(output: ReturnType<JsVizTableIndex["getTypedTable"]>) {
  return {
    rowIds: output.rowIds,
    sourceIndex: Array.from(output.sourceIndex),
    summary: output.summary,
  };
}

function validateTypedColumns(output: ReturnType<JsVizTableIndex["getTypedTable"]>) {
  const score = output.typedColumns.find((column) => column.id === "score");
  const active = output.typedColumns.find((column) => column.id === "active");
  const nullableScore = output.typedColumns.find((column) => column.id === "nullableScore");
  assert(score?.type === "number" && score.values instanceof Float64Array, "typed score column");
  assert(active?.type === "boolean" && active.values instanceof Uint8Array, "typed active column");
  assert(
    nullableScore?.type === "number" && nullableScore.validity instanceof Uint8Array,
    "typed nullable score validity",
  );
}

function assertDescending(values: readonly number[], label: string) {
  for (let index = 1; index < values.length; index++) {
    assert(values[index - 1]! >= values[index]!, label);
  }
}

function assertAscending(values: readonly string[], label: string) {
  for (let index = 1; index < values.length; index++) {
    assert(values[index - 1]!.localeCompare(values[index]!) <= 0, label);
  }
}

function assertStableWithinTies(
  values: Array<{ key: string; sourceIndex: number }>,
  label: string,
) {
  for (let index = 1; index < values.length; index++) {
    const previous = values[index - 1]!;
    const current = values[index]!;
    if (previous.key === current.key) {
      assert(previous.sourceIndex < current.sourceIndex, label);
    }
  }
}
