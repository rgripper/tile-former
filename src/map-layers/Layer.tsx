import { useEffect, useState } from "react";
import { renderVoronoi } from "./renderVoronoi";
import { Application } from "pixi.js";
import { generateCells } from "./generateCells";

const { chunks, mountainRanges } = generateCells();

async function createAndRenderMap() {
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
  return app;
}

export function Layer() {
  const [ref, setRef] = useState<HTMLDivElement | null>();

  const [app, setApp] = useState<Application>();
  useEffect(() => {
    createAndRenderMap().then((app) => setApp(app));
  }, []);

  useEffect(() => {
    if (ref && app) {
      ref.appendChild(app.canvas);
      return () => {
        ref.removeChild(app.canvas);
      };
    }
  }, [app, ref]);

  return <div ref={setRef} className="flex justify-center"></div>;
}
