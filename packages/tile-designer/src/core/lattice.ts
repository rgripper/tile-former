// Tile-lattice space: the coordinate system every material generator works in
// from the dual-grid redesign on.
//
// --- Why this exists ---
//
// v1 sampled all noise at world *pixel* coordinates, which bought seamlessness
// but made every tile's texture unique (see PLAN.md, "Why v1 has to be
// replaced"). v2 needs the opposite: a small set of variant textures that abut
// each other invisibly. That requires generating a function that is *periodic*,
// and the natural period is one tile.
//
// --- The load-bearing geometric fact ---
//
// An isometric diamond is a sheared square. Take the tile's top corner as the
// origin and these two basis vectors in screen pixels:
//
//     e_u = ( TILE_W/2,  TILE_H/2)      (down-right)
//     e_v = (-TILE_W/2,  TILE_H/2)      (down-left)
//
// Then the unit square in (u, v) maps exactly onto the diamond:
//
//     (0,0) → top corner        (1,0) → right corner
//     (0,1) → left corner       (1,1) → bottom corner
//
// So **the diamond is the unit square in lattice space**, and "inside the
// diamond" is simply `0 ≤ u < 1 and 0 ≤ v < 1`. A function periodic with
// period 1 in u and v therefore matches automatically across all four diamond
// edges — no special-casing of the diagonal edges required. That is the whole
// seamlessness mechanism in v2.
//
// It also means the lattice *is* the tile grid: for tile (col, row) at world
// pixel origin (ox, oy) = ((col−row)·TILE_W/2, (col+row)·TILE_H/2), a pixel's
// global lattice coordinate is exactly (col + u, row + v). Neighbouring tiles
// are neighbouring integer lattice cells, which is why v1's world-pixel noise
// was equivalent to sampling a *non*-periodic function over this same space.
//
// --- Bonus: the 2:1 squash disappears ---
//
// Lattice space is the undistorted ground plane; the 2:1 look is entirely in the
// projection. v1's generators had to double their y-frequency by hand to undo
// the squash (and `spotField` carried an explicit `* 2` iso correction).
// Generators written in lattice space need none of that — circles are circles.

import { TILE_H, TILE_W } from "./types.ts";

// Screen-pixel length of one lattice unit along either basis vector:
// |e_u| = hypot(TILE_W/2, TILE_H/2). Use this to pick generator frequencies —
// a feature of size 1/n lattice units is roughly PX_PER_LATTICE_UNIT/n pixels
// across at native bake resolution, which is 1:1 with screen pixels.
export const PX_PER_LATTICE_UNIT = Math.hypot(TILE_W / 2, TILE_H / 2);

// Tile-local pixel (x, y) → lattice (u, v), using pixel centres so this agrees
// exactly with `insideDiamond` / `rowSpan` in pixels.ts.
//
// Inverting dx = (u−v)·TILE_W/2, dy = (u+v)·TILE_H/2 with dx measured from the
// top corner gives u = dy/TILE_H + dx/TILE_W, v = dy/TILE_H − dx/TILE_W.
export function latticeAt(x: number, y: number): [u: number, v: number] {
  const dx = x + 0.5 - TILE_W / 2;
  const dy = y + 0.5;
  const a = dy / TILE_H;
  const b = dx / TILE_W;
  return [a + b, a - b];
}

// True when the lattice coordinate falls in this tile's cell. Equivalent to
// `insideDiamond(x, y)` for any pixel — asserted by the lattice test.
export function isInsideLattice(u: number, v: number): boolean {
  return u >= 0 && u < 1 && v >= 0 && v < 1;
}

// Wraps a lattice coordinate into [0, period). Negative-safe, unlike `%`.
export function wrapLattice(v: number, period = 1): number {
  return ((v % period) + period) % period;
}

// Snaps a lattice coordinate down to a coarse authoring block — v2's
// replacement for v1's `grainCoord`.
//
// `blocks` MUST be an integer number of blocks per period, or the result stops
// being periodic and seams reappear. Chunkiness is now a property of the
// authoring grid rather than something applied to world pixels after the fact.
//
// At the native 64×32 bake a whole lattice cell covers 1024 px, so `blocks`
// of 32 gives exactly one native px — and one screen px — per block.
export function quantizeLattice(v: number, blocks: number): number {
  return Math.floor(v * blocks) / blocks;
}

// Number of authoring blocks per lattice unit that lands one block on one
// screen pixel. The bake is now 1:1 with the screen diamond, so one block is
// one native pixel is one screen pixel — which is also *why* the bake is 1:1:
// a 2× bake stored each of these blocks as 4 pixels carrying no extra
// information (types.ts, TILE_W). Provided as the default "chunky but not
// mushy" starting grid for generators.
export const DEFAULT_BLOCKS = 32;
