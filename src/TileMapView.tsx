import { useEffect, useState } from "react";
import { initApp } from "./initApp.ts";
import { Spritesheet, Texture } from "pixi.js";
import { Tile } from "./tile.ts";

export function TileMapView({
  tileMap,
  tileSpritesheet,
  canvasSize,
}: {
  tileMap: Tile[][];
  tileSpritesheet: Spritesheet;
  canvasSize: { width: number; height: number };
}) {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (ref) {
      let unsubscribe = () => {};
      initApp({
        tileMap,
        tileSpritesheet,
        size: canvasSize,
      }).then((x) => {
        ref.appendChild(x.canvas);

        unsubscribe = () => {
          ref.removeChild(x.canvas);
          x.destroy();
        };
      });

      return () => unsubscribe();
    }
  }, [canvasSize, ref, tileSpritesheet, tileMap]);
  return <div ref={setRef}></div>;
}
