import { useEffect, useState } from "react";
import { generateVoronoi, groupCells, mergePolygons } from "./generateVoronoi";
import { renderVoronoi } from "./generateVoronoiMap";
import { Application } from "pixi.js";

const voronoiResult = generateVoronoi({ width: 800, height: 600 }, 50);
const groups = groupCells(
  voronoiResult.points,
  Math.ceil(Math.round(voronoiResult.points.length / 5))
).toArray();

const mergedPolygons = groups.map((group) =>
  mergePolygons(
    group.map((cellIndex) => voronoiResult.voronoi.cellPolygon(cellIndex))
  )
);

const app = new Application();
await app.init({
  width: 800,
  height: 600,
  backgroundColor: 0x1099bb,
});

// const groups = groupCells(
//   voronoiResult.points,
//   voronoiResult.voronoi,
//   Math.ceil(Math.round(voronoiResult.points.length / 5))
// ).toArray();

await renderVoronoi(
  app,
  mergedPolygons.map((x) => [x])
);

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
