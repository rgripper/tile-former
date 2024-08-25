import { Application, Graphics } from "pixi.js";
import { useEffect, useState } from "react";
import { generateVoronoi, groupCells, mergePolygons2 } from "./generateVoronoi";
import { rand } from "../config";
import { generateVoronoiMap } from "./generateVoronoiMap";

export const voronoiResult = generateVoronoi({ width: 800, height: 600 }, 50);

const app = await generateVoronoiMap(voronoiResult);

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
