import { createNoise2D } from "simplex-noise";
import { Point, IsometricTile } from "./tiles";
import { applyToPoint } from "transformation-matrix";
import { tileTypes, isometrifyingMatrix, isoTileSize } from "./App";
import { rand, tileHeight, tileSide } from "./config";

export function generateInitialParameterMap(
  width: number,
  height: number
): IsometricTile[][] {
  const noise2D = createNoise2D(() => rand.next());

  const tileCenterGrid = getTileCentersInGrid(
    { x: width, y: height },
    tileSide
  );
  const _ = tileCenterGrid[0][tileCenterGrid[0].length - 1].topLeft;
  const gridTopLeft = {
    x: applyToPoint(isometrifyingMatrix, { x: _.x, y: _.y + tileHeight }).x,
    y: applyToPoint(isometrifyingMatrix, tileCenterGrid[0][0].topLeft).y,
  };

  return tileCenterGrid.map((row) =>
    row.map(({ center, topLeft, index }) => {
      const value = (noise2D(index.x / 40, index.y / 40) + 1) / 2;
      const isoCenter = applyToPoint(isometrifyingMatrix, center);
      return {
        tileTypeId: Math.floor(value * tileTypes.length),
        index,
        center: isoCenter,
        topLeft: {
          x: isoCenter.x - isoTileSize.x / 2 - gridTopLeft.x,
          y: isoCenter.y - isoTileSize.y / 2 - gridTopLeft.y,
        },
        value,
      };
    })
  );
}
type RawTile = {
  center: Point;
  index: Point;
  topLeft: Point;
};
function getTileCentersInGrid(gridSize: Point, tileSide: number): RawTile[][] {
  return new Array(gridSize.x).fill(0).map((_, x) =>
    new Array(gridSize.y).fill(0).map((_, y) => ({
      index: { x, y },
      center: {
        x: tileSide * (x + 0.5),
        y: tileSide * (y + 0.5),
      },
      topLeft: {
        x: tileSide * x,
        y: tileSide * y,
      },
    }))
  );
}
