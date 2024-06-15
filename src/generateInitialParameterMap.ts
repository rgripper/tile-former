import { createNoise2D } from "simplex-noise";
import { Point, IsometricTile } from "./tiles";
import { applyToPoint } from "transformation-matrix";
import { rand, tileSide, tileTypes, isometrifyingMatrix } from "./App";

export function generateInitialParameterMap(
  width: number,
  height: number
): IsometricTile[][] {
  const noise2D = createNoise2D(() => rand.next());

  return getTileCentersInGrid({ x: width, y: height }, tileSide).map((row) =>
    row.map(({ center, topLeft, index }) => {
      const value = (noise2D(index.x / 40, index.y / 40) + 1) / 2;
      return {
        tileTypeId: Math.floor(value * tileTypes.length),
        index,
        topLeft: applyToPoint(isometrifyingMatrix, topLeft),
        center: applyToPoint(isometrifyingMatrix, center),
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
