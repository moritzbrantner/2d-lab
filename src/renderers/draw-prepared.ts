import type { DisplayList } from "../core/display-list";
import { pathDataFloatCount } from "../geometry/flatten";

export function drawPreparedDisplayList(
  context: CanvasRenderingContext2D,
  displayList: DisplayList,
  preparedPoints: Float32Array,
  debugBounds: boolean,
): void {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = displayList.background;
  context.fillRect(0, 0, displayList.width, displayList.height);

  let floatOffset = 0;
  for (const command of displayList.commands) {
    const end = floatOffset + pathDataFloatCount(command);

    context.beginPath();
    context.moveTo(
      preparedPoints[floatOffset] ?? 0,
      preparedPoints[floatOffset + 1] ?? 0,
    );

    if (command.segments) {
      let cursor = floatOffset + 2;
      for (const segment of command.segments) {
        if (segment.kind === "cubic") {
          context.bezierCurveTo(
            preparedPoints[cursor] ?? 0,
            preparedPoints[cursor + 1] ?? 0,
            preparedPoints[cursor + 2] ?? 0,
            preparedPoints[cursor + 3] ?? 0,
            preparedPoints[cursor + 4] ?? 0,
            preparedPoints[cursor + 5] ?? 0,
          );
          cursor += 6;
        } else {
          context.lineTo(
            preparedPoints[cursor] ?? 0,
            preparedPoints[cursor + 1] ?? 0,
          );
          cursor += 2;
        }
      }
    } else {
      for (let offset = floatOffset + 2; offset < end; offset += 2) {
        context.lineTo(
          preparedPoints[offset] ?? 0,
          preparedPoints[offset + 1] ?? 0,
        );
      }
    }

    if (command.closed) {
      context.closePath();
    }
    if (command.paint.fill) {
      context.fillStyle = command.paint.fill;
      context.fill();
    }
    if (command.paint.stroke) {
      context.strokeStyle = command.paint.stroke;
      context.lineWidth = command.paint.strokeWidth ?? 1;
      context.stroke();
    }

    if (debugBounds) {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (let offset = floatOffset; offset < end; offset += 2) {
        const x = preparedPoints[offset] ?? 0;
        const y = preparedPoints[offset + 1] ?? 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      context.strokeStyle = "rgba(220, 38, 38, 0.55)";
      context.lineWidth = 0.75;
      context.strokeRect(minX, minY, maxX - minX, maxY - minY);
    }

    floatOffset = end;
  }

  context.restore();
}
