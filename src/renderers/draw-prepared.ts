import type { DisplayList } from "../core/display-list";

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
    const end = floatOffset + command.points.length;

    context.beginPath();
    context.moveTo(
      preparedPoints[floatOffset] ?? 0,
      preparedPoints[floatOffset + 1] ?? 0,
    );

    for (let offset = floatOffset + 2; offset < end; offset += 2) {
      context.lineTo(
        preparedPoints[offset] ?? 0,
        preparedPoints[offset + 1] ?? 0,
      );
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
