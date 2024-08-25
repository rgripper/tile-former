import { Application, Graphics } from "pixi.js";
import { useEffect, useState } from "react";
import { GenerateVoronoi, groupCells } from "./generateVoronoi";
import { rand } from "../config";
import { voronoiResult } from "./Layer2";

async function generateVoronoiMap({ points, voronoi }: GenerateVoronoi) {
  // Initialize PIXI Application
  const app = new Application();
  await app.init({
    width: 800,
    height: 600,
    backgroundColor: 0x1099bb,
  });

  const pointCount = 50;
  const groups = groupCells(points, voronoi, Math.ceil(pointCount / 5));

  for (const group of groups) {
    const graphics = new Graphics();
    graphics.setStrokeStyle({
      width: 2,
    });
    const color = rand.next() * 0xffffff;
    for (const cellIndex of group) {
      const polygon = voronoi.cellPolygon(cellIndex);
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

const app = await generateVoronoiMap(voronoiResult);

export function Layer() {
  const [ref, setRef] = useState<HTMLDivElement | null>();
  useEffect(() => {
    if (ref) {
      ref.appendChild(app.canvas);
      return () => {
        ref.removeChild(app.canvas);
      };
    }
  }, [ref]);

  return <div ref={setRef}></div>;
}
