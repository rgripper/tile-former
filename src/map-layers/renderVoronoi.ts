import { Application, Graphics } from "pixi.js";
import { Delaunay } from "d3-delaunay";
import { Edge } from "./Edge";
import { AreaChunk } from "./generateCells";

export async function renderVoronoi({
  app,
  chunks,
  mountainRanges,
  colors,
}: {
  app: Application;
  chunks: AreaChunk[];
  mountainRanges: Edge[];
  colors: {
    land: number;
    water: number;
    mountain: number;
  };
}) {
  chunks
    .map((x) =>
      getGraphicsFromPolygonCluster(
        x.cells.map((x) => x.polygon),
        x.isLand ? colors.land : colors.water
      )
    )
    .forEach((g) => app.stage.addChild(g));

  const graphics = new Graphics();

  for (const [start, end] of mountainRanges) {
    const [startX, startY] = start;
    const [endX, endY] = end;
    graphics
      .moveTo(Math.ceil(startX), Math.ceil(startY))
      .lineTo(Math.ceil(endX), Math.ceil(endY));
  }

  graphics.stroke({
    color: colors.mountain,
    width: 20,
    cap: "round",
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
