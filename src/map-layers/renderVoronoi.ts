import { Application, Graphics } from "pixi.js";
import { Delaunay } from "d3-delaunay";
import { Edge } from "./Edge";
import { AreaChunk } from "./generateCells";

export async function renderVoronoi({
  app,
  chunks,
  mountainRanges,
}: {
  app: Application;
  chunks: AreaChunk[];
  mountainRanges: Edge[][];
}) {
  chunks
    .map((x) =>
      getGraphicsFromPolygonCluster(
        x.cells.map((x) => x.polygon),
        x.isLand ? 0x8dd35f : 0x1ca3ec
      )
    )
    .forEach((g) => app.stage.addChild(g));

  const graphics = new Graphics();

  for (const [start, end] of mountainRanges.flat()) {
    const [startX, startY] = start;
    const [endX, endY] = end;
    graphics
      .moveTo(Math.ceil(startX), Math.ceil(startY))
      .lineTo(Math.ceil(endX), Math.ceil(endY));
  }

  graphics.stroke({
    color: 0xff00a0,
    width: 10,
  });
  app.stage.addChild(graphics);
}

function getGraphicsFromPolygonCluster(
  polygonCluster: Delaunay.Polygon[],
  color: number
) {
  const graphics = new Graphics();

  for (const polygon of polygonCluster) {
    if (polygon) {
      const [firstPoint, ...otherPoints] = polygon;
      if (!firstPoint) {
        continue;
      }
      const [startX, startY] = firstPoint;
      graphics.moveTo(startX, startY);

      for (const [x, y] of otherPoints) {
        graphics.lineTo(x, y);
      }

      graphics.fill(color);
    }
  }

  return graphics;
}
