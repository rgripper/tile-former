import type { Tile } from "../tileMap/tile";
import type { PatchCell, PipelineConfig } from "./types";
import { clamp, MOORE8, VON4 } from "./utils";

const POND_DEPTH_TOLERANCE = 0.03;
const POND_MIN_AREA = 4;
const POND_MAX_AREA = 50;
const POND_MIN_SEPARATION = 10;
const RIVER_GRADIENT_THRESHOLD = 0.08;
const RIVER_MAX_PATCHES = 40;

export function stage8_waterFeatures(
  tiles: Tile[][],
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  placePonds(tiles, grid, config);
  placeRivers(tiles, grid, config);
}

function placePonds(
  tiles: Tile[][],
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  const { width, height, tilesPerPatch } = config;
  const pw = grid.length;
  const ph = grid[0].length;

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

      // Parent patch must have low drainage.
      const px = clamp(Math.floor(x / tilesPerPatch), 0, pw - 1);
      const py = clamp(Math.floor(y / tilesPerPatch), 0, ph - 1);
      if (grid[px][py].drainage >= 0.30) continue;

      // Flood-fill up to max area within depth tolerance.
      const fill: Array<[number, number]> = [];
      const queue: Array<[number, number]> = [[x, y]];
      const seen = new Set<number>();
      seen.add(tKey(x, y));

      while (queue.length > 0 && fill.length < POND_MAX_AREA) {
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
      for (let d = 1; d <= POND_MIN_SEPARATION; d++) {
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

function placeRivers(
  tiles: Tile[][],
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  const { width, height, tilesPerPatch } = config;
  const pw = grid.length;
  const ph = grid[0].length;

  const patchAlt = (px: number, py: number) =>
    px >= 0 && px < pw && py >= 0 && py < ph
      ? grid[px][py].altitude
      : Infinity;

  const pKey = (x: number, y: number) => x * 1000 + y;
  const visitedPatch = new Set<number>();

  for (let spx = 0; spx < pw; spx++) {
    for (let spy = 0; spy < ph; spy++) {
      if (visitedPatch.has(pKey(spx, spy))) continue;

      // Verify this patch has a qualifying downhill neighbor.
      let hasQualifyingGrad = false;
      for (const [dx, dy] of VON4) {
        if (patchAlt(spx, spy) - patchAlt(spx + dx, spy + dy) > RIVER_GRADIENT_THRESHOLD) {
          hasQualifyingGrad = true;
          break;
        }
      }
      if (!hasQualifyingGrad) continue;

      // Trace steepest-descent chain through patch grid.
      const chain: Array<[number, number]> = [[spx, spy]];
      let [cx, cy] = [spx, spy];

      for (let step = 0; step < RIVER_MAX_PATCHES - 1; step++) {
        let bestGrad = RIVER_GRADIENT_THRESHOLD;
        let next: [number, number] | null = null;
        for (const [dx, dy] of VON4) {
          const g = patchAlt(cx, cy) - patchAlt(cx + dx, cy + dy);
          if (g > bestGrad) { bestGrad = g; next = [cx + dx, cy + dy]; }
        }
        if (!next) break;

        const [nx, ny] = next;
        if (nx < 0 || nx >= pw || ny < 0 || ny >= ph) break;

        chain.push([nx, ny]);

        // Terminate if we've reached a pond.
        const midTX = clamp(nx * tilesPerPatch + Math.floor(tilesPerPatch / 2), 0, width - 1);
        const midTY = clamp(ny * tilesPerPatch + Math.floor(tilesPerPatch / 2), 0, height - 1);
        if (tiles[midTX][midTY].waterType === "pond") break;

        [cx, cy] = [nx, ny];
      }

      if (chain.length < 2) continue;

      // Stamp the lowest tile in each chain patch as a river tile.
      for (const [rpx, rpy] of chain) {
        visitedPatch.add(pKey(rpx, rpy));

        const tx0 = rpx * tilesPerPatch;
        const ty0 = rpy * tilesPerPatch;
        const tx1 = Math.min(tx0 + tilesPerPatch, width);
        const ty1 = Math.min(ty0 + tilesPerPatch, height);

        let lowestX = tx0, lowestY = ty0, lowestAlt = Infinity;
        for (let tx = tx0; tx < tx1; tx++) {
          for (let ty = ty0; ty < ty1; ty++) {
            if (tiles[tx][ty].altitude < lowestAlt) {
              lowestAlt = tiles[tx][ty].altitude;
              lowestX = tx; lowestY = ty;
            }
          }
        }

        tiles[lowestX][lowestY].water = true;
        tiles[lowestX][lowestY].waterType = "river";
      }
    }
  }
}
