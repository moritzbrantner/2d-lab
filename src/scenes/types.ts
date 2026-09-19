import type { DisplayList } from "../core/display-list";

/** Lab-internal benchmark workload. This is not a product scene contract. */
export interface BenchmarkWorkload {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  create(timeSeconds: number): DisplayList;
}
