import {
  IDENTITY_TRANSFORM,
  type DisplayList,
  type Paint,
  type PathCommand,
  validateDisplayList,
} from "../core/display-list";

export type MapsSnapshotPoint = { readonly x: number; readonly y: number };

export type MapsScreenSnapshotPrimitive =
  | {
      readonly kind: "line";
      readonly points: readonly MapsSnapshotPoint[];
      readonly stroke: string;
      readonly strokeWidth: number;
    }
  | {
      readonly kind: "polygon";
      readonly rings: readonly (readonly MapsSnapshotPoint[])[];
      readonly fill?: string;
      readonly stroke?: string;
      readonly strokeWidth?: number;
    }
  | {
      readonly kind: "circle";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
    }
  | {
      readonly angle: number;
      readonly kind: "direction-marker";
      readonly x: number;
      readonly y: number;
    };

export type MapsScreenSnapshot = {
  readonly provenance: {
    readonly generatedBy: string;
    readonly sourceFixture: string;
    readonly sourceRepository: "moritzbrantner/maps";
    readonly sourceRevision: string;
  };
  readonly background: string;
  readonly height: number;
  readonly primitives: readonly MapsScreenSnapshotPrimitive[];
  readonly schema: "maps-2d-lab-screen-frame/v1";
  readonly width: number;
};

export function mapsScreenSnapshotToDisplayList(snapshot: MapsScreenSnapshot): DisplayList {
  if (snapshot.schema !== "maps-2d-lab-screen-frame/v1") {
    throw new Error("unsupported Maps 2d-lab snapshot schema");
  }
  if (
    snapshot.provenance.sourceRepository !== "moritzbrantner/maps" ||
    !/^[0-9a-f]{40}$/.test(snapshot.provenance.sourceRevision)
  ) {
    throw new Error("Maps 2d-lab snapshot must pin an exact Maps source revision");
  }

  const commands = snapshot.primitives.map(toCommand);
  const displayList: DisplayList = {
    width: snapshot.width,
    height: snapshot.height,
    background: snapshot.background,
    commands,
  };
  validateDisplayList(displayList);
  return displayList;
}

function toCommand(primitive: MapsScreenSnapshotPrimitive): PathCommand {
  switch (primitive.kind) {
    case "line":
      return pathCommand(primitive.points, false, {
        stroke: primitive.stroke,
        strokeWidth: primitive.strokeWidth,
      });
    case "polygon": {
      if (primitive.rings.length !== 1) {
        throw new Error(
          "Maps polygon holes are unsupported by this lab adapter; keep Maps as the semantic oracle",
        );
      }
      const ring = primitive.rings[0];
      if (!ring) throw new Error("Maps polygon snapshot is missing its outer ring");
      return pathCommand(ring, true, {
        fill: primitive.fill,
        stroke: primitive.stroke,
        strokeWidth: primitive.strokeWidth,
      });
    }
    case "circle":
      throw new Error(
        "Maps circles are unsupported by this lab adapter; do not approximate product semantics",
      );
    case "direction-marker":
      throw new Error(
        "Maps direction markers are unsupported by this lab adapter; do not approximate product semantics",
      );
  }
}

function pathCommand(
  points: readonly MapsSnapshotPoint[],
  closed: boolean,
  paint: Paint,
): PathCommand {
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new Error("Maps snapshot contains a non-finite screen-space point");
  }

  return {
    kind: "path",
    points: new Float32Array(points.flatMap((point) => [point.x, point.y])),
    closed,
    transform: IDENTITY_TRANSFORM,
    paint,
  };
}
