import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";
import type { Tile } from "../tileMap/tile";
import type { PipelineConfig } from "./types";
import { clamp, MOORE8, VON4 } from "./utils";

const RIPARIAN_NOISE_SCALE = 0.18;

// Tiles whose drainage falls below this threshold after rock-permeability
// application are eligible cluster seeds (impermeable geology + flat ground).
const CANDIDATE_DRAIN_THRESHOLD = 0.35;

// Minimum number of tiles a fill must cover to be stamped as a cluster.
const CLUSTER_MIN_AREA = 4;

// Tiles within a cluster whose drainage drops below this become water.
const WATER_DRAIN_THRESHOLD = 0.15;

// Base altitude tolerance for the cluster flood-fill; scaled by drainageClusterDepth.
const ALT_TOLERANCE_BASE = 0.02;

export function stage9_drainageCluster(
  tiles: Tile[][],
  config: PipelineConfig,
): void {
  placeClusters(tiles, config);
  smoothClusters(tiles, config);
  placeRiparian(tiles, config);
}

function placeClusters(tiles: Tile[][], config: PipelineConfig): void {
  const {
    width,
    height,
    seed,
    drainageClusterChance,
    drainageClusterBreadth,
    drainageClusterDepth,
  } = config;

  if (drainageClusterChance <= 0) return;

  const rand = createRand(seed + "_clusters");
  const tileAlt = (x: number, y: number) => tiles[x]?.[y]?.altitude ?? Infinity;
  const tKey = (x: number, y: number) => x * 10000 + y;

  // Altitude tolerance: deeper depth allows the fill to climb higher from the minimum.
  const altTolerance = ALT_TOLERANCE_BASE * (0.5 + drainageClusterDepth);

  // Find candidate seeds: local altitude minima with low geology-influenced drainage.
  const candidates: Array<[number, number]> = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = tiles[x][y];
      if (tile.drainage >= CANDIDATE_DRAIN_THRESHOLD) continue;

      const alt = tileAlt(x, y);
      let isMin = true;
      for (const [dx, dy] of MOORE8) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (tileAlt(nx, ny) <= alt) { isMin = false; break; }
        }
      }
      if (isMin) candidates.push([x, y]);
    }
  }

  // Sort by drainage ascending so the most waterlogged candidates are tried first.
  candidates.sort(([ax, ay], [bx, by]) => tiles[ax][ay].drainage - tiles[bx][by].drainage);

  const maxArea = Math.max(
    CLUSTER_MIN_AREA,
    Math.round(Math.PI * drainageClusterBreadth * drainageClusterBreadth * 0.5),
  );

  const claimed = new Set<number>();

  for (const [sx, sy] of candidates) {
    if (rand.next() > drainageClusterChance) continue;
    if (claimed.has(tKey(sx, sy))) continue;

    const seedAlt = tileAlt(sx, sy);

    // BFS flood-fill within altitude tolerance, up to maxArea tiles.
    const fill: Array<[number, number, number]> = []; // [x, y, dist]
    const queue: Array<[number, number, number]> = [[sx, sy, 0]];
    const seen = new Set<number>();
    seen.add(tKey(sx, sy));

    while (queue.length > 0 && fill.length < maxArea) {
      const entry = queue.shift()!;
      const [cx, cy, dist] = entry;
      fill.push([cx, cy, dist]);
      if (dist >= drainageClusterBreadth) continue;
      for (const [dx, dy] of VON4) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nk = tKey(nx, ny);
        if (seen.has(nk) || claimed.has(nk)) continue;
        if (tileAlt(nx, ny) <= seedAlt + altTolerance) {
          seen.add(nk);
          queue.push([nx, ny, dist + 1]);
        }
      }
    }

    if (fill.length < CLUSTER_MIN_AREA) continue;

    const maxDist = Math.max(...fill.map(([, , d]) => d), 1);

    for (const [fx, fy, dist] of fill) {
      claimed.add(tKey(fx, fy));

      // Drainage suppression tapers from center (full depth) to edge (zero).
      const distFactor = 1 - dist / (maxDist + 1);
      const suppression = drainageClusterDepth * distFactor;
      const tile = tiles[fx][fy];
      tile.drainage = clamp(tile.drainage * (1 - suppression), 0, 1);
      tile.effectiveMoisture = tile.precipitation * (1 - tile.drainage);

      if (tile.drainage < WATER_DRAIN_THRESHOLD) {
        tile.water = true;
        tile.waterType = "pond";
      }
    }
  }
}

// Two CA iterations to clean up cluster water shapes:
//   - land tiles with ≥ 6/8 water neighbours → water  (fills interior land specs)
//   - water tiles with ≤ 2/8 water neighbours → land   (erodes isolated spikes)
function smoothClusters(tiles: Tile[][], config: PipelineConfig): void {
  const { width, height } = config;

  const isWater = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height && tiles[x][y].water;

  for (let iter = 0; iter < 2; iter++) {
    const toAdd: Array<[number, number]> = [];
    const toRemove: Array<[number, number]> = [];

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let wn = 0;
        for (const [dx, dy] of MOORE8) {
          if (isWater(x + dx, y + dy)) wn++;
        }
        if (tiles[x][y].water) {
          if (wn <= 2) toRemove.push([x, y]);
        } else {
          if (wn >= 6) toAdd.push([x, y]);
        }
      }
    }

    for (const [x, y] of toRemove) {
      tiles[x][y].water = false;
      tiles[x][y].waterType = undefined;
    }
    for (const [x, y] of toAdd) {
      tiles[x][y].water = true;
      tiles[x][y].waterType = "pond";
    }
  }
}

// BFS from water tiles to mark adjacent land tiles as riparian (fringe zone).
// Width is 1–2 tiles; distance-2 tiles are gated by tile drainage + noise so
// the band is naturally wider in boggy terrain and narrower on well-drained ground.
function placeRiparian(tiles: Tile[][], config: PipelineConfig): void {
  const { width, height, seed } = config;
  const noise = createNoise2D(createRand(seed + "_riparian").next);

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
      const nx = cx + dx, ny = cy + dy;
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
        tile.riparian = true;
      } else {
        // d === 2: include if drainage is low (bog = always, rock = rarely).
        const threshold = tile.drainage * 1.5 - 1.0;
        if (noise(x * RIPARIAN_NOISE_SCALE, y * RIPARIAN_NOISE_SCALE) > threshold) {
          tile.riparian = true;
        }
      }
    }
  }
}
