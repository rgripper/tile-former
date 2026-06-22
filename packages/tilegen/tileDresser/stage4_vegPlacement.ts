// Stage 4 — Vegetation placement [continuous coords] (presentational)
//
// Plants trees and bushes using Bridson's Poisson-disk sampling, gated by
// treeSuitability / bushSuitability from stages 2–3. Output is stored on each
// tile as `trees[]` and `bushes[]` — arrays of placements (tile-unit coords)
// whose tile membership falls within that tile.
//
// Trees use a variable-radius Poisson disk driven by tile.forestDensity: high
// density → tight packing (forest clusters), low density → wide spacing (open
// parkland). This produces the clustered/sparse contrast that fixed-radius
// sampling cannot generate. Bushes use fixed-radius sampling; their density is
// controlled upstream by stage 3's canopy suppression.
//
// Spatial hash grid (cell = globalMinDist / √2) makes neighbor checks fast.
// Variable-radius trees need a larger search window (±3 cells = 7×7) to find
// all neighbors within the maximum exclusion radius; bushes use the standard
// 5×5 (±2). Each run's grid is discarded after placement.

import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "../tileGenerator/types";
import { createRand } from "../rand";
import { lerp } from "../tileGenerator/utils";

// Tree spacing range. forestDensity = 1 → DENSE spacing (tight forest clusters);
// forestDensity = 0 → SPARSE spacing (open parkland with isolated trees).
const TREE_MIN_DIST_DENSE = 1.3;
const TREE_MIN_DIST_SPARSE = 4.5;
// Minimum centre-to-centre distance between bushes, in tile units.
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
    TREE_MIN_DIST_DENSE,  // global min — determines grid cell size
    3,                     // search radius in cells (7×7 window covers up to ~3.5 × DENSE)
    createRand(seed + "_veg_trees"),
    (x, y) => tiles[Math.floor(x)][Math.floor(y)].treeSuitability,
    (x, y) => {
      const fd = tiles[Math.floor(x)][Math.floor(y)].forestDensity;
      return lerp(TREE_MIN_DIST_SPARSE, TREE_MIN_DIST_DENSE, fd);
    },
    (x, y) => { tiles[Math.floor(x)][Math.floor(y)].trees.push({ x, y }); },
  );

  poissonDisk(
    width,
    height,
    BUSH_MIN_DIST,
    2,
    createRand(seed + "_veg_bushes"),
    (x, y) => tiles[Math.floor(x)][Math.floor(y)].bushSuitability,
    (_x, _y) => BUSH_MIN_DIST,
    (x, y) => { tiles[Math.floor(x)][Math.floor(y)].bushes.push({ x, y }); },
  );
}

type Pt = { x: number; y: number; r: number };  // r = local min dist at accept time
type Rng = ReturnType<typeof createRand>;

// Bridson's Poisson-disk sampling with variable exclusion radius and suitability gate.
//
// globalMinDist: smallest possible localMinDist — sets the grid cell size. Must be
//   ≤ min value returned by localMinDist across the map.
// searchRadius: cells checked in each direction for neighbor queries. Must satisfy
//   searchRadius × (globalMinDist / √2) ≥ max localMinDist so no neighbor is missed.
//   For fixed radius use 2 (5×5); for variable radius use 3+ (7×7 or larger).
// suitability(x, y) → [0, 1]: acceptance probability after spacing passes.
// localMinDist(x, y) → number: minimum distance from this candidate to all others.
// onAccept(x, y): called once per accepted point.
function poissonDisk(
  width: number,
  height: number,
  globalMinDist: number,
  searchRadius: number,
  rand: Rng,
  suitability: (x: number, y: number) => number,
  localMinDist: (x: number, y: number) => number,
  onAccept: (x: number, y: number) => void,
): void {
  const cellSize = globalMinDist / Math.SQRT2;
  const grid = new Map<string, Pt[]>();

  function isFarEnough(x: number, y: number, r: number): boolean {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        const cell = grid.get((cx + dx) + "," + (cy + dy));
        if (!cell) continue;
        for (const p of cell) {
          // Variable-radius rule: use the larger of the two local radii so that
          // neither point falls inside the other's exclusion zone.
          const required = Math.max(r, p.r);
          if ((p.x - x) ** 2 + (p.y - y) ** 2 < required * required) return false;
        }
      }
    }
    return true;
  }

  function accept(x: number, y: number, r: number): Pt {
    const pt: Pt = { x, y, r };
    const key = Math.floor(x / cellSize) + "," + Math.floor(y / cellSize);
    let cell = grid.get(key);
    if (!cell) { cell = []; grid.set(key, cell); }
    cell.push(pt);
    onAccept(x, y);
    return pt;
  }

  function candidateAround(cx: number, cy: number, r: number): { x: number; y: number } {
    // Sample uniformly in the annulus [r, 2r] around the center using the center's
    // local radius — ensures the candidate is outside the center's exclusion zone
    // and close enough to be reached by the active-list mechanism.
    const radius = r * (1 + rand.next());
    const angle = rand.next() * Math.PI * 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  // Find a valid seed point. Without a suitable seed the map is fully barren.
  let seed_: Pt | null = null;
  for (let i = 0; i < 100 && !seed_; i++) {
    const sx = rand.next() * width;
    const sy = rand.next() * height;
    const r = localMinDist(sx, sy);
    if (isFarEnough(sx, sy, r) && rand.next() < suitability(sx, sy)) {
      seed_ = accept(sx, sy, r);
    }
  }
  if (!seed_) return;

  const active: Pt[] = [seed_];

  while (active.length > 0) {
    const idx = Math.floor(rand.next() * active.length);
    const center = active[idx];
    let placed = false;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const c = candidateAround(center.x, center.y, center.r);
      if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) continue;
      const r = localMinDist(c.x, c.y);
      if (isFarEnough(c.x, c.y, r) && rand.next() < suitability(c.x, c.y)) {
        active.push(accept(c.x, c.y, r));
        placed = true;
        break;
      }
    }

    if (!placed) active.splice(idx, 1);
  }
}
