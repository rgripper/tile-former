import { useEffect, useState } from "react";
import { renderVoronoi } from "./renderVoronoi";
import { Application } from "pixi.js";
import { generateCells } from "./generateCells";

const { chunks, mountainRanges } = generateCells();
const app = new Application();
await app.init({
  width: 800,
  height: 600,
  backgroundColor: 0x1099bb,
});

await renderVoronoi({
  app,
  chunks,
  mountainRanges: [mountainRanges],
});

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
