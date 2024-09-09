import { useEffect, useState } from "react";
import { Application } from "pixi.js";

export function ChunkMapLayer({ app }: { app: Application }) {
  const [ref, setRef] = useState<HTMLDivElement | null>();

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

export const ChunkMapFeature = {
  Water: 0,
  Land: 1,
  Mountain: 2,
};

export type ChunkMapFeature = 0 | 1 | 2;

export function getChunkMap({
  app,
  colors,
}: {
  app: Application;
  colors: { land: number; water: number; mountain: number };
}): ChunkMapFeature[][] {
  // water is 0, land is 1, mountain is 2
  const { width, height } = app.renderer;
  const map: ChunkMapFeature[][] = new Array(height)
    .fill(0)
    .map(() => new Array(width).fill(0));
  const { pixels } = app.renderer.extract.pixels(app.stage);

  const heightMap = new Array(height)
    .fill(0)
    .map(() => new Array(width).fill(0));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const color = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
      heightMap[y][x] =
        color === colors.water
          ? ChunkMapFeature.Water
          : color === colors.land
          ? ChunkMapFeature.Land
          : ChunkMapFeature.Mountain;
    }
  }

  return heightMap;
}
