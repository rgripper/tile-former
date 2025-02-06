import { Point } from "./generateTileMap";
import { Tile } from "./tile";

type UnresolvedTile = Omit<Tile, "biome"> & {
  biome?: undefined;
};

function getNeighbors(point: Point, width: number, height: number): Point[] {
  const neighbors: Point[] = [];
  const directions = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ];

  for (const direction of directions) {
    const neighbor = { x: point.x + direction.x, y: point.y + direction.y };
    if (
      neighbor.x >= 0 &&
      neighbor.x < width &&
      neighbor.y >= 0 &&
      neighbor.y < height
    ) {
      neighbors.push(neighbor);
    }
  }

  return neighbors;
}

// given a starting point, resolve biome for all tiles in the grid, that don't have one already, using cellular automata
// if no biome around, pick a one using the likelyBiomeIds function and probability by using next()
// if there are biomes around, pick one of them with probability proportional to the number of biomes around
// update the tileMap with the resolved biomes
export function resolveTiles(
  tileMap: { biomeId?: number }[][],
  likelyBiomeIds: (index: Point) => { confidence: number; biomeId: number }[],
  next: () => number,
  startingPoints: Point[]
) {
  const width = tileMap.length;
  const height = tileMap[0].length;
  const queue: Point[] = [...startingPoints];

  while (queue.length > 0) {
    const point = queue.shift()!;
    const tile = tileMap[point.x][point.y];

    if (tile.biomeId !== undefined) continue;

    const neighbors = getNeighbors(point, width, height);
    const neighborBiomes = neighbors
      .map((neighbor) => tileMap[neighbor.x][neighbor.y].biomeId)
      .filter((biomeId) => biomeId !== undefined) as number[];

    if (neighborBiomes.length > 0) {
      const biomeCounts = neighborBiomes.reduce((counts, biomeId) => {
        counts[biomeId] = (counts[biomeId] || 0) + 1;
        return counts;
      }, {} as Record<number, number>);

      const total = neighborBiomes.length;
      const random = next() * total;
      let cumulative = 0;

      for (const [biomeId, count] of Object.entries(biomeCounts)) {
        cumulative += count;
        if (random < cumulative) {
          tile.biomeId = parseInt(biomeId);
          break;
        }
      }
    } else {
      const biomes = likelyBiomeIds(point);
      const totalProbability = biomes.reduce(
        (sum, { confidence }) => sum + confidence,
        0
      );
      const random = next() * totalProbability;
      let cumulative = 0;

      for (const { confidence, biomeId } of biomes) {
        cumulative += confidence;
        if (random < cumulative) {
          tile.biomeId = biomeId;
          break;
        }
      }
    }

    queue.push(
      ...neighbors.filter(
        (neighbor) => tileMap[neighbor.x][neighbor.y].biomeId === undefined
      )
    );
  }
}

export function pickRandomIndexesSparsely({
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
