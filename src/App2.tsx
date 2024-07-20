import { useEffect, useState } from "react";
import { Atlas, Point } from "./tiles";
import { initPixi } from "./initPixi";

export type IsometricTile = {
  tileTypeId: number;
  center: Point;
  index: Point;
  topLeft: Point;
};

export function AppPixi({
  tileGridData,
  textureAtlas,
}: {
  tileGridData: IsometricTile[][];
  textureAtlas: Atlas;
}) {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (ref) {
      let unsubscribe = () => {};
      initPixi({
        tileGridData,
        textureAtlas,
      }).then((x) => {
        ref.appendChild(x.canvas);

        unsubscribe = () => {
          ref.removeChild(x.canvas);
          x.destroy();
        };
      });

      return () => unsubscribe();
    }
  }, [ref, textureAtlas, tileGridData]);
  return <div ref={setRef}></div>;
}
