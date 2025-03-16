import { Branch } from "./generateCurvedTopShape";

export function renderBranch({
  ctx,
  branch: { shapePoints, topPointPairs },
}: {
  ctx: CanvasRenderingContext2D;
  branch: Branch;
}) {
  ctx.beginPath();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;

  // Move to first point
  ctx.moveTo(shapePoints[0].x, shapePoints[0].y);

  // Draw lines to each point
  for (let i = 1; i < shapePoints.length; i++) {
    ctx.lineTo(shapePoints[i].x, shapePoints[i].y);
  }

  // Connect back to the first point
  ctx.lineTo(shapePoints[0].x, shapePoints[0].y);

  // Stroke the path
  ctx.stroke();
  ctx.closePath();

  // Draw top point pairs with different color
  ctx.strokeStyle = "#00f";
  ctx.lineWidth = 3;

  topPointPairs.forEach((pair, index) => {
    ctx.beginPath();
    ctx.moveTo(pair.start.x, pair.start.y);
    ctx.lineTo(pair.end.x, pair.end.y);
    ctx.stroke();

    // Draw points with varying colors to show the sequence
    const hue = (index * 30) % 360;
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;

    // Start point
    ctx.beginPath();
    ctx.arc(pair.start.x, pair.start.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // End point (last segment only)
    if (index === topPointPairs.length - 1) {
      ctx.beginPath();
      ctx.arc(pair.end.x, pair.end.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
