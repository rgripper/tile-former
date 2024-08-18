import { useEffect, useState } from "react";
import { Atlas, Point } from "./tiles";
import { initPixi } from "./initPixi";

export type IsometricTile = {
  tileTypeId: number;
  center: Point;
  index: Point;
  topLeft: Point;
};

export function TileMapView({
  tileGridData,
  textureAtlas,
  canvasSize,
}: {
  tileGridData: IsometricTile[][];
  textureAtlas: Atlas;
  canvasSize: { width: number; height: number };
}) {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (ref) {
      let unsubscribe = () => {};
      initPixi({
        tileGridData,
        textureAtlas,
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
  }, [canvasSize, ref, textureAtlas, tileGridData]);
  return <div ref={setRef}></div>;
}
