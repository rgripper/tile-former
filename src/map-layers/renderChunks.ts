import { Application, Graphics } from "pixi.js";
import { Delaunay } from "d3-delaunay";
import { Edge } from "./Edge";
import { AreaChunk } from "./generateCells";

export async function renderChunks({
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

  graphics.stroke(colors.mountain);

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

// type Point = [number, number];

// type Path = Point[];

// /// returns a closed rounded path being a shape that envelops the path at the specified distance
// /// for N points in a path it would generate a shape with N + 2 or more points
// function envelopePath(path: Path, distance: number): Path {

// }
