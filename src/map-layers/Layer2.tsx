import { useEffect, useState } from "react";
import { generateVoronoi, groupCells } from "./generateVoronoi";
import { generateVoronoiMap } from "./generateVoronoiMap";

export const voronoiResult = generateVoronoi({ width: 800, height: 600 }, 50);
export const groups = groupCells(
  voronoiResult.points,
  voronoiResult.voronoi,
  Math.ceil(Math.round(voronoiResult.points.length / 5))
).toArray();
const app = await generateVoronoiMap(voronoiResult, groups);

export function Layer2() {
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
