import { Application, Graphics } from "pixi.js";
import { rand } from "../config";
import { GenerateVoronoi, mergePolygons } from "./generateVoronoi";

export async function generateVoronoiMap(
  { points, voronoi }: GenerateVoronoi,
  groups: number[][]
) {
  // Initialize PIXI Application
  const app = new Application();
  await app.init({
    width: 800,
    height: 600,
    backgroundColor: 0x1099bb,
  });

  const mergedPolygons = groups.map((group) =>
    mergePolygons(group.map((cellIndex) => voronoi.cellPolygon(cellIndex)))
  );

  for (const polygon of mergedPolygons) {
    const graphics = new Graphics();
    graphics.setStrokeStyle({
      width: 2,
    });
    const color = rand.next() * 0xffffff;

    if (polygon) {
      const [[startX, startY], ...otherPoints] = polygon;
      graphics.moveTo(startX, startY);

      for (const [x, y] of otherPoints) {
        graphics.lineTo(x, y);
      }

      graphics.closePath();
      graphics.fill(color);
      app.stage.addChild(graphics);
    }
  }

  // Render points
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    const graphics = new Graphics();
    graphics.fill(0xff0000);
    graphics.circle(x, y, 3);

    app.stage.addChild(graphics);
  }

  return app;
}
