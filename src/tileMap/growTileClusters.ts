import { Point } from "./generateTileMap";

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

function pickWeighted(entries: [number, number][], random: number): number {
  let cumulative = 0;
  for (let i = 0; i < entries.length; i++) {
    cumulative += entries[i][1];
    if (random < cumulative || i === entries.length - 1) {
      return entries[i][0];
    }
  }
  return entries[entries.length - 1][0];
}

export function resolveTiles(
  tileMap: { biomeId?: number }[][],
  likelyBiomeIds: (index: Point) => { confidence: number; biomeId: number }[],
  next: () => number,
  startingPoints: Point[]
) {
  const width = tileMap.length;
  const height = tileMap[0].length;
  const queue: Point[] = [...startingPoints];
  const queued = new Set<number>(startingPoints.map((p) => p.y * width + p.x));
  let head = 0;

  while (head < queue.length) {
    const point = queue[head++];
    const tile = tileMap[point.x][point.y];

    if (tile.biomeId !== undefined) continue;

    const neighbors = getNeighbors(point, width, height);
    const neighborBiomes = neighbors
      .map((neighbor) => tileMap[neighbor.x][neighbor.y].biomeId)
      .filter((biomeId) => biomeId !== undefined) as number[];

    if (neighborBiomes.length > 0) {
      const biomeCounts = neighborBiomes.reduce(
        (counts, biomeId) => {
          counts[biomeId] = (counts[biomeId] || 0) + 1;
          return counts;
        },
        {} as Record<number, number>
      );
      const entries = Object.entries(biomeCounts).map(
        ([id, count]) => [parseInt(id), count] as [number, number]
      );
      tile.biomeId = pickWeighted(entries, next() * neighborBiomes.length);
    } else {
      const biomes = likelyBiomeIds(point);
      const total = biomes.reduce((sum, { confidence }) => sum + confidence, 0);
      const entries = biomes.map(
        ({ biomeId, confidence }) => [biomeId, confidence] as [number, number]
      );
      tile.biomeId = pickWeighted(entries, next() * total);
    }

    for (const neighbor of neighbors) {
      if (tileMap[neighbor.x][neighbor.y].biomeId === undefined) {
        const key = neighbor.y * width + neighbor.x;
        if (!queued.has(key)) {
          queued.add(key);
          queue.push(neighbor);
        }
      }
    }
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

  function isFarEnough(point: Point, minDist: number): boolean {
    return points.every(
      (p) =>
        Math.abs(p.x - point.x) >= minDist &&
        Math.abs(p.y - point.y) >= minDist
    );
  }

  let runs = 0;
  while (points.length < count) {
    runs++;
    const effectiveDist = minimumDistance * Math.min(1, count / runs);
    const point = next();
    if (isFarEnough(point, effectiveDist)) {
      points.push(point);
    }
  }

  return points;
}
