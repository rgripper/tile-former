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
export function growTileClusters<Tile>(
  tileMap: Tile[][],
  resolveBiomeId: (index: Point) => number,
  next: () => number,
  startPoints: Point[]
): (Tile & { biomeId: number })[][] {
  const queue: [number, number, number][] = [];

  const gridWidth = tileMap.length;
  const gridHeight = tileMap[0].length;
  const newGrid = copyTileMap(tileMap);

  // Initialize starting points
  for (const { x, y } of startPoints) {
    const biomeId = resolveBiomeId({ x, y });
    newGrid[x][y].biomeId = biomeId;
    queue.push([x, y, biomeId]);
  }

  // BFS for spreading
  while (queue.length > 0) {
    const [x, y, ancestorBiomeId] = queue.shift()!;

    for (const [nx, ny] of getNeighbors(x, y, gridWidth, gridHeight)) {
      const tile = newGrid[nx][ny];
      if (tile.biomeId === null) {
        if (next() < SPREAD_PROBABILITY) {
          tile.biomeId = resolveBiomeId({ x: nx, y: ny });
        } else {
          tile.biomeId = ancestorBiomeId;
        }
        queue.push([nx, ny, tile.biomeId]);
      }
    }
  }

  return newGrid as (Tile & { biomeId: number })[][];
}

function copyTileMap<Tile>(
  tileMap: Tile[][]
): (Tile & { biomeId: number | null })[][] {
  return Array.from({ length: tileMap.length }, (_, x) =>
    Array.from({ length: tileMap[0].length }, (_, y) => ({
      ...tileMap[x][y],
      biomeId: null,
    }))
  );
}

// Choose random starting points

export function pickRandomIndexes<T>(
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

export function pickRandomIndexesSparsely<T>({
  count,
  next,
  minimumDistance,
}: {
  count: number;
  next: () => Point;
  minimumDistance: number;
}): Point[] {
  const points: Point[] = [];

  function isFarEnough(point: Point): boolean {
    return points.every(
      (p) =>
        Math.abs(p.x - point.x) >= minimumDistance &&
        Math.abs(p.y - point.y) >= minimumDistance
    );
  }

  while (points.length < count) {
    const point = next();
    if (isFarEnough(point)) {
      points.push(point);
    }
  }

  return points;
}
// generate unresolved grid -> cluster-resolve tiles
