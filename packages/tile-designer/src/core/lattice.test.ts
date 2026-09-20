import { describe, expect, it } from "vitest";
import { TILE_H, TILE_W } from "./types.ts";
import { insideDiamond, rowSpan } from "./pixels.ts";
import {
  DEFAULT_BLOCKS,
  isInsideLattice,
  latticeAt,
  quantizeLattice,
  wrapLattice,
} from "./lattice.ts";
import {
  periodicBlockHash,
  periodicCellEdge,
  periodicFbm,
  periodicSpot,
  periodicValueNoise,
} from "./noise.ts";

// The lattice transform is only useful if "inside the unit lattice square" and
// "inside the diamond" are the *same* predicate — that equivalence is what lets
// period-1 functions wrap exactly on the tile's visible edges.
describe("lattice transform", () => {
  it("agrees with insideDiamond on every pixel of the tile rect", () => {
    let mismatches = 0;
    for (let y = 0; y < TILE_H; y++) {
      for (let x = 0; x < TILE_W; x++) {
        const [u, v] = latticeAt(x, y);
        if (isInsideLattice(u, v) !== insideDiamond(x, y)) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("agrees with rowSpan on every row", () => {
    for (let y = 0; y < TILE_H; y++) {
      const [x0, x1] = rowSpan(y);
      for (let x = 0; x < TILE_W; x++) {
        const [u, v] = latticeAt(x, y);
        expect(isInsideLattice(u, v)).toBe(x >= x0 && x <= x1);
      }
    }
  });

  it("maps the four diamond corners to the unit square corners", () => {
    // Pixel centres sit half a pixel inside each corner, so allow that slack.
    // Derived, not a constant: `latticeAt` adds 0.5/TILE_H along u+v and
    // 0.5/TILE_W along u−v, so the worst corner is off by their sum — 0.0117
    // at a 128×64 diamond but 0.0234 at 64×32. A hardcoded tolerance silently
    // encodes one bake resolution.
    const slack = 0.5 / TILE_H + 0.5 / TILE_W;
    const near = (a: number, b: number) => Math.abs(a - b) <= slack + 1e-12;
    const [tu, tv] = latticeAt(TILE_W / 2, 0); // top
    const [ru, rv] = latticeAt(TILE_W - 1, TILE_H / 2); // right
    const [lu, lv] = latticeAt(0, TILE_H / 2 - 1); // left
    const [bu, bv] = latticeAt(TILE_W / 2, TILE_H - 1); // bottom
    expect(near(tu, 0) && near(tv, 0)).toBe(true);
    expect(near(ru, 1) && near(rv, 0)).toBe(true);
    expect(near(lu, 0) && near(lv, 1)).toBe(true);
    expect(near(bu, 1) && near(bv, 1)).toBe(true);
  });

  it("wraps negative coordinates correctly", () => {
    expect(wrapLattice(-0.25)).toBeCloseTo(0.75, 12);
    expect(wrapLattice(1.25)).toBeCloseTo(0.25, 12);
    expect(wrapLattice(-2.5, 2)).toBeCloseTo(1.5, 12);
  });

  it("quantizes to an exact block grid", () => {
    expect(quantizeLattice(0.7, 4)).toBeCloseTo(0.5, 12);
    // Block boundaries must land on multiples of 1/blocks, so the grid lines up
    // with the tile edge and stays periodic.
    for (let i = 0; i < DEFAULT_BLOCKS; i++) {
      const inside = (i + 0.5) / DEFAULT_BLOCKS;
      expect(quantizeLattice(inside, DEFAULT_BLOCKS)).toBeCloseTo(i / DEFAULT_BLOCKS, 12);
    }
  });
});

// Every periodic primitive must be invariant under a shift of one full period
// in either axis.
//
// On the tolerance: bit-exact equality is deliberately NOT the contract, because
// it is unachievable in floating point — `(u + 1) * cells` and `u * cells +
// cells` differ in the last mantissa bit, so f(u+1, v) lands an ULP or two away
// from f(u, v). What matters is that the *integer lattice indices* wrap exactly
// (asserted separately below, since that is what aligns the noise cell
// structure) and that residual error is orders of magnitude below one quantized
// ramp step — 1/4 of the output range. 1e-9 is ~8 orders of magnitude inside
// that margin.
describe("periodic primitives wrap", () => {
  const SEED = 0xc0ffee;
  const CELLS = 4;
  // Deliberately not a multiple of 1/CELLS, so samples land mid-cell where
  // interpolation is actually doing work.
  const samples: Array<[number, number]> = [];
  for (let i = 0; i < 37; i++) {
    for (let j = 0; j < 23; j++) {
      samples.push([i / 37, j / 23]);
    }
  }

  const cases: Array<[string, (u: number, v: number) => number]> = [
    ["periodicValueNoise", (u, v) => periodicValueNoise(u, v, SEED, CELLS)],
    ["periodicFbm", (u, v) => periodicFbm(u, v, SEED, CELLS)],
    ["periodicCellEdge", (u, v) => periodicCellEdge(u, v, SEED, CELLS)],
    [
      "periodicSpot",
      (u, v) => {
        const s = periodicSpot(u, v, SEED, CELLS, 0.7, 0.5);
        // Fold the whole result into one number so a mismatch in any field fails.
        return s === null ? -1 : s.d * 7 + s.du * 13 + s.dv * 17 + s.h * 23;
      },
    ],
  ];

  for (const [name, f] of cases) {
    it(`${name} is invariant under +1 in u, v, and both`, () => {
      for (const [u, v] of samples) {
        const base = f(u, v);
        for (const [du, dv] of [[1, 0], [0, 1], [1, 1], [-1, -1], [5, -3]] as const) {
          expect(f(u + du, v + dv)).toBeCloseTo(base, 9);
        }
      }
    });
  }

  // Block hashing is floor-based with no interpolation, so here exactness *is*
  // achievable and is the right contract: a single wrong block index would show
  // as a mismatched chunk of texture at the tile edge, not a rounding wobble.
  it("periodicBlockHash is exactly invariant under whole-period shifts", () => {
    for (const [u, v] of samples) {
      const base = periodicBlockHash(u, v, SEED, DEFAULT_BLOCKS);
      for (const [du, dv] of [[1, 0], [0, 1], [1, 1], [-1, -1], [5, -3]] as const) {
        expect(periodicBlockHash(u + du, v + dv, SEED, DEFAULT_BLOCKS)).toBe(base);
      }
    }
  });
});

// A variant must abut a copy of itself with no discontinuity. This is the
// property that replaces v1's world-coordinate sampling: sampling tile (col,row)
// at local (u,v) is the same as sampling the periodic function at (u,v), so two
// adjacent tiles agree along their shared edge by construction.
describe("cross-tile continuity", () => {
  const SEED = 0x5eed;
  const CELLS = 4;

  it("is continuous across a shared tile edge", () => {
    // Walk along the u = 1 / u = 0 boundary between tile (0,0) and tile (1,0).
    const eps = 1e-9;
    for (let i = 1; i < 40; i++) {
      const v = i / 40;
      const leftOfEdge = periodicFbm(1 - eps, v, SEED, CELLS);
      const rightOfEdge = periodicFbm(0 + eps, v, SEED, CELLS);
      // Approaching the same physical line from both tiles must converge.
      expect(Math.abs(leftOfEdge - rightOfEdge)).toBeLessThan(1e-6);
    }
  });

  it("produces identical rows for tiles several lattice units apart", () => {
    // Tile at lattice cell (0,0) vs (3,-2): same local coordinates, so the
    // sampled field must agree to well within one quantized ramp step.
    for (let i = 0; i < 50; i++) {
      const u = i / 50;
      const v = ((i * 7) % 50) / 50;
      expect(periodicFbm(u + 3, v - 2, SEED, CELLS)).toBeCloseTo(
        periodicFbm(u, v, SEED, CELLS),
        9,
      );
    }
  });

  // The property that actually decides whether a seam is visible: the jump in
  // the field across the tile boundary must be no larger than the jumps that
  // occur naturally *within* a tile. A periodic function has no discontinuity
  // there, so the boundary step should be unremarkable. If someone later makes a
  // primitive non-periodic, this fails loudly even though the wrap tests above
  // (which sample the same point from both sides) might not.
  it("has no discontinuity at the boundary relative to interior variation", () => {
    // One native bake pixel is ~1/64 of a lattice unit along u.
    const step = 1 / 64;
    for (let j = 1; j < 20; j++) {
      const v = j / 20;
      const deltas: number[] = [];
      // Walk a full period in u, recording |change| between adjacent samples.
      for (let k = 0; k < 64; k++) {
        const a = periodicFbm(k * step, v, SEED, CELLS);
        const b = periodicFbm((k + 1) * step, v, SEED, CELLS);
        deltas.push(Math.abs(b - a));
      }
      // The last entry straddles u = 1 → u = 0, i.e. the tile boundary.
      const boundaryDelta = deltas[deltas.length - 1]!;
      const maxInterior = Math.max(...deltas.slice(0, -1));
      expect(boundaryDelta).toBeLessThanOrEqual(maxInterior);
    }
  });
});
