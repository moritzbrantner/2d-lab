import type { DisplayList } from "../core/display-list";

export interface SceneFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  create(timeSeconds: number): DisplayList;
}
