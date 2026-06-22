// Stage 4 — Vegetation placement [continuous coords] (presentational)
//
// Plants trees and bushes using Bridson's Poisson-disk sampling, gated by
// treeSuitability / bushSuitability from stages 2–3. Output is stored on each
// tile as `trees[]` and `bushes[]` — arrays of placements (tile-unit coords)
// whose tile membership falls within that tile.
//
// Two independent Poisson-disk runs: one for trees, one for bushes. At each
// candidate point the tile's suitability is sampled as an acceptance probability
// — low-suitability zones are thinned, suitability-0 zones (water etc.) receive
// nothing.
//
// Spatial hash grid (cell = minDist / √2) makes neighbor checks O(1): only the
// 5×5 cell window around the candidate needs checking (at most ~25 cells, each
// holding at most one valid point at that cell size). The grid is local to each
// run and discarded after the stage completes; only the per-tile arrays persist.

import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "../tileGenerator/types";
import { createRand } from "../rand";

// Minimum centre-to-centre distance between trees, in tile units.
// At 2.5, a fully-suitable 64×64 map yields ~600 trees.
const TREE_MIN_DIST = 2.5;
// Minimum distance between bushes. Smaller than trees — denser understory.
const BUSH_MIN_DIST = 1.2;
// Bridson standard: exhaust this many attempts around each active point
// before retiring it. Higher values fill gaps better at the cost of extra work.
const MAX_ATTEMPTS = 30;

export function stage4_vegPlacement(tiles: Tile[][], config: PipelineConfig): void {
  const { width, height, seed } = config;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      tiles[x][y].trees = [];
      tiles[x][y].bushes = [];
    }
  }

  poissonDisk(
    width,
    height,
    TREE_MIN_DIST,
    createRand(seed + "_veg_trees"),
    (x, y) => tiles[Math.floor(x)][Math.floor(y)].treeSuitability,
    (x, y) => { tiles[Math.floor(x)][Math.floor(y)].trees.push({ x, y }); },
  );

  poissonDisk(
    width,
    height,
    BUSH_MIN_DIST,
    createRand(seed + "_veg_bushes"),
    (x, y) => tiles[Math.floor(x)][Math.floor(y)].bushSuitability,
    (x, y) => { tiles[Math.floor(x)][Math.floor(y)].bushes.push({ x, y }); },
  );
}

type Pt = { x: number; y: number };
type Rng = ReturnType<typeof createRand>;

// Bridson's Poisson-disk sampling with a per-point suitability acceptance gate.
//
// suitability(x, y) → [0, 1]: extra acceptance probability after spacing passes.
// onAccept(x, y): called once per accepted point; writes to external storage.
function poissonDisk(
  width: number,
  height: number,
  minDist: number,
  rand: Rng,
  suitability: (x: number, y: number) => number,
  onAccept: (x: number, y: number) => void,
): void {
  // cellSize = minDist / √2 guarantees at most one valid point per cell, so a
  // 5×5 cell window is sufficient to find all points within minDist.
  const cellSize = minDist / Math.SQRT2;
  const grid = new Map<string, Pt[]>();

  function isFarEnough(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const cell = grid.get((cx + dx) + "," + (cy + dy));
        if (!cell) continue;
        for (const p of cell) {
          if ((p.x - x) ** 2 + (p.y - y) ** 2 < minDist * minDist) return false;
        }
      }
    }
    return true;
  }

  function accept(x: number, y: number): Pt {
    const pt: Pt = { x, y };
    const key = Math.floor(x / cellSize) + "," + Math.floor(y / cellSize);
    let cell = grid.get(key);
    if (!cell) { cell = []; grid.set(key, cell); }
    cell.push(pt);
    onAccept(x, y);
    return pt;
  }

  function candidateAround(cx: number, cy: number): Pt {
    // Sample uniformly in the annulus [minDist, 2·minDist] around the center.
    const r = minDist * (1 + rand.next());
    const angle = rand.next() * Math.PI * 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }

  // Find a valid seed point. Without a suitable seed the map is fully barren.
  let seed_: Pt | null = null;
  for (let i = 0; i < 100 && !seed_; i++) {
    const sx = rand.next() * width;
    const sy = rand.next() * height;
    if (isFarEnough(sx, sy) && rand.next() < suitability(sx, sy)) {
      seed_ = accept(sx, sy);
    }
  }
  if (!seed_) return;

  const active: Pt[] = [seed_];

  while (active.length > 0) {
    const idx = Math.floor(rand.next() * active.length);
    const center = active[idx];
    let placed = false;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const c = candidateAround(center.x, center.y);
      if (isFarEnough(c.x, c.y) && rand.next() < suitability(c.x, c.y)) {
        active.push(accept(c.x, c.y));
        placed = true;
        break;
      }
    }

    if (!placed) active.splice(idx, 1);
  }
}
