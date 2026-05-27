import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";
import type { Tile } from "../tileMap/tile";
import type { PatchCell, PipelineConfig } from "./types";
import { clamp, MOORE8, VON4 } from "./utils";

const RIPARIAN_NOISE_SCALE = 0.18;

const POND_DEPTH_TOLERANCE = 0.03;
const POND_MIN_AREA = 4;
const POND_MAX_AREA = 50;             // at pondDensity = 1
const POND_DRAINAGE_THRESHOLD = 0.30; // at pondDensity = 1

export function stage8_waterFeatures(
  tiles: Tile[][],
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  placePonds(tiles, grid, config);
  smoothPonds(tiles, config);
  placeRiparian(tiles, config);
}

// Two CA iterations to clean up pond shapes:
//   - land tiles with ≥ 6/8 water neighbours → water  (fills interior land specs)
//   - water tiles with ≤ 2/8 water neighbours → land   (erodes isolated spikes)
// Changes are computed from a snapshot and applied all at once (synchronous update).
function smoothPonds(tiles: Tile[][], config: PipelineConfig): void {
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

function placePonds(
  tiles: Tile[][],
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  const { width, height, tilesPerPatch, pondDensity } = config;
  if (pondDensity <= 0) return;

  const pw = grid.length;
  const ph = grid[0].length;

  // Scale all three pond knobs with pondDensity.
  const drainageThreshold = pondDensity * POND_DRAINAGE_THRESHOLD;
  const effectiveMaxArea   = Math.max(POND_MIN_AREA, Math.round(POND_MAX_AREA * pondDensity));
  const effectiveMinSep    = Math.round(30 - pondDensity * 20); // 30 at 0 → 10 at 1

  const tileAlt = (x: number, y: number) => tiles[x]?.[y]?.altitude ?? Infinity;
  const tKey = (x: number, y: number) => x * 10000 + y;

  const fills: Array<Array<[number, number]>> = [];
  const claimed = new Set<number>();

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const alt = tileAlt(x, y);

      // Must be a local minimum across all 8 neighbors.
      let isMin = true;
      for (const [dx, dy] of MOORE8) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (tileAlt(nx, ny) <= alt) { isMin = false; break; }
        }
      }
      if (!isMin || claimed.has(tKey(x, y))) continue;

      // Parent patch must have low enough drainage for the current density.
      const px = clamp(Math.floor(x / tilesPerPatch), 0, pw - 1);
      const py = clamp(Math.floor(y / tilesPerPatch), 0, ph - 1);
      if (grid[px][py].drainage >= drainageThreshold) continue;

      // Flood-fill up to max area within depth tolerance.
      const fill: Array<[number, number]> = [];
      const queue: Array<[number, number]> = [[x, y]];
      const seen = new Set<number>();
      seen.add(tKey(x, y));

      while (queue.length > 0 && fill.length < effectiveMaxArea) {
        const [cx, cy] = queue.shift()!;
        fill.push([cx, cy]);
        for (const [dx, dy] of VON4) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nk = tKey(nx, ny);
          if (seen.has(nk)) continue;
          if (tileAlt(nx, ny) <= alt + POND_DEPTH_TOLERANCE) {
            seen.add(nk);
            queue.push([nx, ny]);
          }
        }
      }

      if (fill.length >= POND_MIN_AREA) fills.push(fill);
    }
  }

  // Largest fills win; enforce minimum separation.
  fills.sort((a, b) => b.length - a.length);

  for (const fill of fills) {
    let tooClose = false;
    outer: for (const [fx, fy] of fill) {
      for (let d = 1; d <= effectiveMinSep; d++) {
        for (const [dx, dy] of VON4) {
          const nx = fx + dx * d, ny = fy + dy * d;
          if (claimed.has(tKey(nx, ny))) { tooClose = true; break outer; }
        }
      }
    }
    if (tooClose) continue;

    for (const [fx, fy] of fill) {
      claimed.add(tKey(fx, fy));
      tiles[fx][fy].water = true;
      tiles[fx][fy].waterType = "pond";
    }
  }
}

// BFS from water tiles to mark adjacent land tiles as riparian (fringe zone).
// Width is 1–2 tiles; distance-2 tiles are gated by tile drainage + noise so
// the band is naturally wider in boggy terrain and narrower on well-drained ground.
function placeRiparian(tiles: Tile[][], config: PipelineConfig): void {
  const { width, height, seed } = config;
  const noise = createNoise2D(createRand(seed + "_riparian").next);

  // BFS up to Chebyshev distance 2 from every water tile.
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
      if (d === 0 || d === Infinity) continue; // water tile or out of range

      const tile = tiles[x][y];

      if (d === 1) {
        tile.riparian = true;
      } else {
        // d === 2: include if drainage is low enough (bog = always, rock = rarely).
        // threshold = drainage * 1.5 - 1.0 → at drainage 0: always; at drainage 1: ~25% chance
        const threshold = tile.drainage * 1.5 - 1.0;
        if (noise(x * RIPARIAN_NOISE_SCALE, y * RIPARIAN_NOISE_SCALE) > threshold) {
          tile.riparian = true;
        }
      }
    }
  }
}
