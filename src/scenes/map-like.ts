import type {
  Affine2D,
  DisplayList,
  PathCommand,
} from "../core/display-list";
import type { SceneFixture } from "./types";

function path(
  points: readonly number[],
  paint: PathCommand["paint"],
  transform: Affine2D,
  closed = false,
): PathCommand {
  return {
    kind: "path",
    points: new Float32Array(points),
    closed,
    transform,
    paint,
  };
}

function createMapLikeScene(timeSeconds: number): DisplayList {
  const commands: PathCommand[] = [];
  const panX = Math.sin(timeSeconds * 0.55) * 18;
  const panY = Math.cos(timeSeconds * 0.4) * 10;
  const zoom = 1 + Math.sin(timeSeconds * 0.27) * 0.025;
  const world: Affine2D = [zoom, 0, 0, zoom, panX, panY];

  for (let row = 0; row < 20; row += 1) {
    for (let column = 0; column < 30; column += 1) {
      const x = column * 42 - 35;
      const y = row * 38 - 18;
      const inset = ((row * 17 + column * 29) % 7) * 0.65;
      commands.push(
        path(
          [
            x + inset,
            y + inset,
            x + 35 - inset,
            y + 1,
            x + 37,
            y + 29 - inset,
            x + 2,
            y + 31,
          ],
          {
            fill:
              (row + column) % 5 === 0
                ? "#dce7cf"
                : (row + column) % 3 === 0
                  ? "#e7dfca"
                  : "#ece8dc",
            stroke: "#d5cfbf",
            strokeWidth: 0.8,
          },
          world,
          true,
        ),
      );
    }
  }

  for (let row = 0; row <= 20; row += 2) {
    const y = row * 38;
    commands.push(
      path(
        [-80, y, 1300, y + Math.sin(row) * 6],
        { stroke: "#b7afa0", strokeWidth: row % 4 === 0 ? 3.2 : 1.5 },
        world,
      ),
    );
  }

  for (let column = 0; column <= 30; column += 3) {
    const x = column * 42;
    commands.push(
      path(
        [x, -60, x + Math.cos(column) * 9, 820],
        { stroke: "#b7afa0", strokeWidth: column % 6 === 0 ? 3 : 1.4 },
        world,
      ),
    );
  }

  const river: number[] = [];
  for (let index = 0; index < 32; index += 1) {
    const x = -40 + index * 43;
    const y = 330 + Math.sin(index * 0.7 + timeSeconds * 0.15) * 38;
    river.push(x, y);
  }
  commands.push(path(river, { stroke: "#76a9c5", strokeWidth: 13 }, world));
  commands.push(path(river, { stroke: "#afd0df", strokeWidth: 8 }, world));

  return {
    width: 1200,
    height: 720,
    background: "#f4f1e8",
    commands,
  };
}

export const mapLikeScene: SceneFixture = {
  id: "map-like",
  name: "Map-like geometry",
  description:
    "Hundreds of filled blocks, road segments and a changing river under a shared pan/zoom transform. This stresses command count, transform handling and repeated path drawing.",
  create: createMapLikeScene,
};
