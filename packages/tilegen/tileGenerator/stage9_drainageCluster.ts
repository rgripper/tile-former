// Stage 9 — Drainage cluster pass [tile scale]
// Spec: BIOME_LOCAL_PIPELINE.md
//
// Selects water areas from tiles at altitudeLevel 0 and stamps riparian fringe.
//
// Two config parameters control output:
//   drainageClusterCount — number of water areas to place
//   drainageClusterSize  — cells per water area (BFS fill from seed)

import { createRand } from "../rand";
import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "./types";
import { clamp, makeNoise2D, MOORE8, tileKey, VON4 } from "./utils";

const RIPARIAN_NOISE_SCALE = 0.18;

export function stage9_drainageCluster(
  tiles: Tile[][],
  config: PipelineConfig,
): void {
  placeWater(tiles, config);
  placeRiparian(tiles, config);
}

function placeWater(tiles: Tile[][], config: PipelineConfig): void {
  const { width, height, seed, drainageClusterCount, drainageClusterSize } =
    config;

  if (drainageClusterCount <= 0 || drainageClusterSize <= 0) return;

  const rand = createRand(seed + "_clusters");
  const tKey = (x: number, y: number) => tileKey(x, y, width);

  // Collect all altitudeLevel-0 tiles as candidate seeds.
  const candidates: Array<[number, number]> = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (tiles[x][y].altitudeLevel === 0) candidates.push([x, y]);
    }
  }

  // Shuffle candidates so placement is random across the world.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand.next() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const claimed = new Set<number>();
  let placed = 0;

  for (const [sx, sy] of candidates) {
    if (placed >= drainageClusterCount) break;
    if (claimed.has(tKey(sx, sy))) continue;

    // BFS flood-fill up to drainageClusterSize cells, staying within altitudeLevel 0.
    const fill: Array<[number, number]> = [];
    const queue: Array<[number, number]> = [[sx, sy]];
    const seen = new Set<number>();
    seen.add(tKey(sx, sy));

    while (queue.length > 0 && fill.length < drainageClusterSize) {
      const [cx, cy] = queue.shift()!;
      fill.push([cx, cy]);
      for (const [dx, dy] of VON4) {
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nk = tKey(nx, ny);
        if (seen.has(nk) || claimed.has(nk)) continue;
        if (tiles[nx][ny].altitudeLevel === 0) {
          seen.add(nk);
          queue.push([nx, ny]);
        }
      }
    }

    for (const [fx, fy] of fill) {
      claimed.add(tKey(fx, fy));
      tiles[fx][fy].water = true;
      tiles[fx][fy].waterType = "pond";
    }

    placed++;
  }
}

// BFS from water tiles to mark adjacent land tiles as riparian (fringe zone).
// Width is 1–2 tiles; distance-2 tiles are gated by tile drainage + noise so
// the band is naturally wider in boggy terrain and narrower on well-drained ground.
function placeRiparian(tiles: Tile[][], config: PipelineConfig): void {
  const { width, height, seed } = config;
  const noise = makeNoise2D(seed + "_riparian");

  const dist: number[][] = Array.from({ length: width }, () =>
    new Array(height).fill(Infinity),
  );
  const queue: Array<[number, number]> = [];

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (tiles[x][y].water) {
        dist[x][y] = 0;
        queue.push([x, y]);
      }
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const [cx, cy] = queue[qi++];
    if (dist[cx][cy] >= 2) continue;
    for (const [dx, dy] of MOORE8) {
      const nx = cx + dx,
        ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (dist[nx][ny] === Infinity) {
        dist[nx][ny] = dist[cx][cy] + 1;
        queue.push([nx, ny]);
      }
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const d = dist[x][y];
      if (d === 0 || d === Infinity) continue;

      const tile = tiles[x][y];

      if (d === 1) {
        tile.riparian = 1.0;
      } else {
        // d === 2: value tapers with drainage. threshold ∈ [−1, 0.5]: boggy tiles
        // score high (always > 0), rocky tiles score low (often 0).
        const threshold = tile.drainage * 1.5 - 1.0;
        const noiseVal = noise(x * RIPARIAN_NOISE_SCALE, y * RIPARIAN_NOISE_SCALE);
        tile.riparian = clamp((noiseVal - threshold) / 2, 0, 1);
      }
    }
  }
}
