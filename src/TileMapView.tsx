import { useEffect, useRef, useState } from "react";
import { initApp } from "./initApp.ts";
import { Application, Spritesheet, Texture } from "pixi.js";
import { Tile } from "./tileMap/tile.ts";
import { Viewport } from "pixi-viewport";

export function TileMapView({
  tileMap,
  tileSpritesheet,
}: {
  tileMap: Tile[][];
  tileSpritesheet: Spritesheet;
}) {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const appAndViewportRef = useRef<
    { app: Application; viewport: Viewport } | undefined
  >(undefined);

  useEffect(() => {
    if (ref) {
      let unsubscribe = () => {};
      initApp({
        tileMap,
        tileSpritesheet,
        container: ref,
      }).then(({ app, viewport }) => {
        appAndViewportRef.current = { app, viewport };
        ref.appendChild(app.canvas);
        unsubscribe = () => {
          appAndViewportRef.current = undefined;
          ref.removeChild(app.canvas);
          app.destroy();
        };
      });

      return () => unsubscribe();
    }
  }, [ref, tileSpritesheet, tileMap]);

  return <div className="flex-1 flex" ref={setRef}></div>;
}
