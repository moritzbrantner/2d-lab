import { createSeededRandom } from "./random";

import type { VizTableColumnDefinition, VizTableColumnarDataset } from "../../src/types";

export type TableFixtureRow = {
  active: boolean;
  amount: number;
  category: string;
  createdAt: number;
  id: string;
  metadata: { bucket: number; flag: string };
  name: string;
  nullableScore: number | null;
  region: string;
  score: number;
};

export const tableColumnDefinitions = [
  { id: "id", type: "string" },
  { id: "name", type: "string" },
  { id: "category", type: "string" },
  { id: "region", type: "string" },
  { id: "score", type: "number" },
  { id: "amount", type: "number" },
  { id: "createdAt", type: "date" },
  { id: "active", type: "boolean" },
  { id: "nullableScore", nullable: true, type: "number" },
  { id: "metadata", type: "json" },
] satisfies VizTableColumnDefinition[];

export function createTableFixture(size: number, seed: number) {
  const random = createSeededRandom(seed ^ size);
  const rows: TableFixtureRow[] = [];
  const rowIds: string[] = [];
  const id: string[] = [];
  const name: string[] = [];
  const category: string[] = [];
  const region: string[] = [];
  const score = new Float64Array(size);
  const amount = new Float64Array(size);
  const createdAt = new Float64Array(size);
  const active = new Uint8Array(size);
  const nullableScore = new Float64Array(size);
  const nullableScoreValidity = new Uint8Array(size);
  const metadata: Array<{ bucket: number; flag: string }> = [];
  const startDate = Date.UTC(2024, 0, 1);

  for (let index = 0; index < size; index++) {
    const rowId = `row-${index.toString().padStart(8, "0")}`;
    const rowCategory = categoryForIndex(index, random.next());
    const rowRegion = regionForIndex(index, random.next());
    const rowScore = scoreForIndex(index, random.normal());
    const rowAmount = amountForIndex(index, random.normal());
    const rowCreatedAt = startDate + index * 60_000 + (index % 24) * 1_000;
    const rowActive = index % 7 !== 0 && random.next() > 0.18;
    const nullable = index % 11 === 0 || random.next() < 0.07;
    const rowNullableScore = nullable ? null : scoreForIndex(index + 17, random.normal());
    const rowName = nameForIndex(index, rowCategory, rowRegion);
    const rowMetadata = {
      bucket: index % 97,
      flag: rowActive ? "enabled" : "disabled",
    };

    rowIds.push(rowId);
    id.push(rowId);
    name.push(rowName);
    category.push(rowCategory);
    region.push(rowRegion);
    score[index] = rowScore;
    amount[index] = rowAmount;
    createdAt[index] = rowCreatedAt;
    active[index] = rowActive ? 1 : 0;
    nullableScore[index] = rowNullableScore ?? Number.NaN;
    nullableScoreValidity[index] = rowNullableScore == null ? 0 : 1;
    metadata.push(rowMetadata);
    rows.push({
      active: rowActive,
      amount: rowAmount,
      category: rowCategory,
      createdAt: rowCreatedAt,
      id: rowId,
      metadata: rowMetadata,
      name: rowName,
      nullableScore: rowNullableScore,
      region: rowRegion,
      score: rowScore,
    });
  }

  const objectDataset = {
    columns: tableColumnDefinitions,
    kind: "table" as const,
    rowIdKey: "id",
    rows,
  };
  const columnarDataset: VizTableColumnarDataset = {
    columns: [
      { id: "id", type: "string", values: id },
      { id: "name", type: "string", values: name },
      { id: "category", type: "string", values: category },
      { id: "region", type: "string", values: region },
      { id: "score", type: "number", values: score },
      { id: "amount", type: "number", values: amount },
      { id: "createdAt", type: "date", values: createdAt },
      { id: "active", type: "boolean", values: active },
      {
        id: "nullableScore",
        nullable: true,
        type: "number",
        validity: nullableScoreValidity,
        values: nullableScore,
      },
      { id: "metadata", type: "json", values: metadata },
    ],
    kind: "table",
    rowIds,
  };

  return {
    columnarDataset,
    objectDataset,
    rows,
  };
}

function categoryForIndex(index: number, randomValue: number) {
  if (index % 29 === 0) {
    return "enterprise";
  }
  if (randomValue < 0.52) {
    return "core";
  }
  if (randomValue < 0.78) {
    return "growth";
  }
  if (randomValue < 0.93) {
    return "edge";
  }
  return `tail-${index % 13}`;
}

function regionForIndex(index: number, randomValue: number) {
  if (index % 37 === 0) {
    return "apac";
  }
  if (randomValue < 0.45) {
    return "na";
  }
  if (randomValue < 0.72) {
    return "eu";
  }
  if (randomValue < 0.9) {
    return "latam";
  }
  return "mea";
}

function scoreForIndex(index: number, normal: number) {
  const seasonal = Math.sin(index / 19) * 18 + Math.cos(index / 101) * 9;
  const repeated = (index % 50) * 0.5;
  return Math.round((55 + seasonal + repeated + normal * 8) * 100) / 100;
}

function amountForIndex(index: number, normal: number) {
  const base = 100 + (index % 200) * 3.25;
  const skew = Math.exp(Math.min(3, Math.max(-2, normal))) * 12;
  return Math.round((base + skew) * 100) / 100;
}

function nameForIndex(index: number, category: string, region: string) {
  const prefixes = ["Ada", "Grace", "Katherine", "Mary", "Radia", "Evelyn", "Hedy"];
  const suffix = index % 31;
  return `${prefixes[index % prefixes.length]} ${category}-${region}-${suffix}`;
}
