import { Point } from "./generateTileMap";
import { Tile } from "./tile";

type UnresolvedTile = Omit<Tile, "biome"> & {
  biome?: undefined;
};

type Grid<T extends Tile | UnresolvedTile> = T[][];

const SPREAD_PROBABILITY = 0.2; // Chance to spread to neighboring tiles

// Get neighboring coordinates
function getNeighbors(
  x: number,
  y: number,
  width: number,
  height: number
): [number, number][] {
  const directions = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0], // Up, Right, Down, Left
  ];
  return directions
    .map(([dx, dy]) => [x + dx, y + dy] as [number, number])
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height);
}

// Grow islands from starting points
export function growTileClusters<Tile, Biome>(
  grid: Tile[][],
  resolveBiomeId: (index: Point) => number,
  biomes: Biome[],
  startPoints: Point[]
): (Tile & { biomeId: number })[][] {
  const queue: [number, number, number][] = [];

  const gridWidth = grid.length;
  const gridHeight = grid[0].length;
  const newGrid: (Tile & { biomeId: number | null })[][] = Array.from(
    { length: grid.length },
    (_, x) =>
      Array.from({ length: grid[0].length }, (_, y) => ({
        ...grid[x][y],
        biomeId: null,
      }))
  );

  console.log(startPoints);
  // Initialize starting points
  for (const { x, y } of startPoints) {
    const biomeId = resolveBiomeId({ x, y });
    newGrid[x][y].biomeId = biomeId;
    console.log("Starting point", x, y, newGrid[x][y]);
    queue.push([x, y, biomeId]);
  }

  console.log(newGrid);

  // BFS for spreading
  while (queue.length > 0) {
    const [x, y, ancestorBiomeId] = queue.shift()!;

    for (const [nx, ny] of getNeighbors(x, y, gridWidth, gridHeight)) {
      const tile = newGrid[nx][ny];
      if (tile.biomeId === null) {
        if (Math.random() < SPREAD_PROBABILITY) {
          tile.biomeId = resolveBiomeId({ x: nx, y: ny });
        } else {
          tile.biomeId = ancestorBiomeId;
        }
        queue.push([nx, ny, tile.biomeId]);
      }
    }
  }

  // now render the grid to the console
  for (let y = 0; y < gridHeight; y++) {
    let row = y.toString() + ": ";
    for (let x = 0; x < gridWidth; x++) {
      row += newGrid[x][y].biomeId;
    }
    console.log(row);
  }

  return newGrid as (Tile & { biomeId: number })[][];
}

// Choose random starting points

export function pickRandomIndexesSparsely<T>(
  grid: T[][],
  count: number,
  next: (existing: Point[], grid: T[][]) => Point
): Point[] {
  const points: Point[] = [];
  while (points.length < count) {
    const point = next(points, grid);
    points.push(point);
  }
  return points;
}

// generate unresolved grid -> cluster-resolve tiles
