import { describe, expect, it } from "vitest";
import { TILE_H, TILE_W } from "./types.ts";
import { insideDiamond, rowSpan } from "./pixels.ts";
import { latticeAt } from "./lattice.ts";
import {
  buildMaskSet,
  CODE_EMPTY,
  CODE_FULL,
  cornerIndex,
  CORNER_TILE_OFFSETS,
  MASK_CODES,
  maskAt,
  nominalInside,
  nominalSigned,
  renderMask,
  SPILL_AMP,
} from "./masks.ts";

const SEED = 0xa715c3;
const BLOCKS = 32;
const VARIANTS = 2;

// --- Geometry ----------------------------------------------------------------
//
// The corner numbering is load-bearing in three places at once (mask lookup, the
// compositor's code construction, and the altitude AND), so pin it down.

describe("dual-cell corner geometry", () => {
  it("indexes corners as (v ? 2 : 0) | (u ? 1 : 0)", () => {
    for (let i = 0; i < 4; i++) {
      const [du, dv] = CORNER_TILE_OFFSETS[i]!;
      expect(cornerIndex(du, dv)).toBe(i);
    }
  });

  // The unit lattice square's corners are the diamond's screen corners, in the
  // order documented at the top of masks.ts. Checked through `latticeAt` so the
  // claim is about the actual transform, not a restatement of it.
  it("puts corner 0 at the diamond's top and corner 3 at its bottom", () => {
    const corner = (x: number, y: number) => {
      const [u, v] = latticeAt(x, y);
      return cornerIndex(u < 0.5 ? 0 : 1, v < 0.5 ? 0 : 1);
    };
    expect(corner(TILE_W / 2, 0)).toBe(0); // top
    expect(corner(TILE_W - 1, TILE_H / 2)).toBe(1); // right
    expect(corner(0, TILE_H / 2)).toBe(2); // left
    expect(corner(TILE_W / 2, TILE_H - 1)).toBe(3); // bottom
  });
});

// --- The overhang-only rule ---------------------------------------------------
//
// PLAN.md states it as a hard rule rather than a preference, because two other
// guarantees are derived from it: the lowest-priority material draws code 15 and
// therefore nothing peeks through underneath it, and a cliff's upper lip always
// overlaps the face instead of leaving a gap. If this test fails, both of those
// silently stop being true.

describe("overhang-only rule", () => {
  it("never recedes inside the nominal corner region", () => {
    let recessions = 0;
    for (let code = 0; code < MASK_CODES; code++) {
      for (let variant = 0; variant < VARIANTS; variant++) {
        for (let y = 0; y < TILE_H; y++) {
          const [x0, x1] = rowSpan(y);
          for (let x = x0; x <= x1; x++) {
            const [u, v] = latticeAt(x, y);
            if (!nominalInside(code, u, v)) continue;
            if (!maskAt(code, variant, u, v, SEED, BLOCKS)) recessions++;
          }
        }
      }
    }
    expect(recessions).toBe(0);
  });

  it("bounds the overhang below half a cell, so a mask cannot reach a foreign tile centre", () => {
    let overreach = 0;
    for (let code = 1; code < MASK_CODES; code++) {
      for (let variant = 0; variant < VARIANTS; variant++) {
        for (let y = 0; y < TILE_H; y++) {
          const [x0, x1] = rowSpan(y);
          for (let x = x0; x <= x1; x++) {
            const [u, v] = latticeAt(x, y);
            if (!maskAt(code, variant, u, v, SEED, BLOCKS)) continue;
            // Distance *outside* the nominal region, in lattice units.
            const outside = -Math.min(0, nominalSigned(code, u, v));
            if (outside > SPILL_AMP + 1e-9) overreach++;
          }
        }
      }
    }
    expect(overreach).toBe(0);
    expect(SPILL_AMP).toBeLessThan(0.5);
  });

  it("actually overhangs — a mask that only ever equalled its nominal region would pass the rule vacuously", () => {
    for (let code = 1; code < CODE_FULL; code++) {
      let over = 0;
      for (let y = 0; y < TILE_H; y++) {
        const [x0, x1] = rowSpan(y);
        for (let x = x0; x <= x1; x++) {
          const [u, v] = latticeAt(x, y);
          if (!nominalInside(code, u, v) && maskAt(code, 0, u, v, SEED, BLOCKS)) over++;
        }
      }
      expect(over, `code ${code} has no overhang at all`).toBeGreaterThan(20);
    }
  });
});

// --- Degenerate codes ---------------------------------------------------------

describe("degenerate codes", () => {
  it("code 15 is the whole diamond and code 0 is empty", () => {
    const full = renderMask(CODE_FULL, 0, SEED, BLOCKS);
    const empty = renderMask(CODE_EMPTY, 0, SEED, BLOCKS);
    let mismatches = 0;
    for (let y = 0; y < TILE_H; y++) {
      for (let x = 0; x < TILE_W; x++) {
        const o = y * TILE_W + x;
        if ((full.data[o]! > 0) !== insideDiamond(x, y)) mismatches++;
        if (empty.data[o]! > 0) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it("gives codes 0 and 15 a single variant, since they have no boundary to vary", () => {
    const set = buildMaskSet(SEED, VARIANTS, BLOCKS);
    expect(set[CODE_EMPTY]!.length).toBe(1);
    expect(set[CODE_FULL]!.length).toBe(1);
    for (let code = 1; code < CODE_FULL; code++) expect(set[code]!.length).toBe(VARIANTS);
  });
});

// --- Closure under intersection ----------------------------------------------
//
// This is what makes altitude cost nothing (PLAN.md, "Altitude: the outermost
// mask"): "corners at my level" AND "corners with my material or higher" is
// itself a corner code, indexing the same 16-entry set. It only holds if the
// nominal regions are literal quadrant unions, so assert it on the geometry
// rather than trusting the arithmetic.

describe("corner codes are closed under intersection", () => {
  it("nominal(a & b) is exactly nominal(a) ∩ nominal(b)", () => {
    let mismatches = 0;
    for (let a = 0; a < MASK_CODES; a++) {
      for (let b = 0; b < MASK_CODES; b++) {
        for (let y = 0; y < TILE_H; y += 3) {
          const [x0, x1] = rowSpan(y);
          for (let x = x0; x <= x1; x += 3) {
            const [u, v] = latticeAt(x, y);
            const both = nominalInside(a, u, v) && nominalInside(b, u, v);
            if (nominalInside(a & b, u, v) !== both) mismatches++;
          }
        }
      }
    }
    expect(mismatches).toBe(0);
  });
});

// --- Cross-cell continuity ----------------------------------------------------
//
// Two dual cells sharing an edge see the *same two tiles* at that edge's ends:
// cell (c,r)'s corners 0,1 are cell (c,r−1)'s corners 2,3. So their codes agree
// locally and their nominal fields match exactly. What cannot match exactly is
// the spill, because neighbouring cells draw different mask variants and the two
// sides of the edge are genuinely different authoring blocks.
//
// The contract is therefore the one lattice.test.ts already holds the periodic
// primitives to: the jump across the edge must be no larger than jumps that
// occur naturally *inside* a cell. Measured at the time of writing: 1.20% across
// the edge against a 3.86% within-cell block-to-block control.

describe("cross-cell edge continuity", () => {
  const HALF_BLOCK = 1 / (2 * BLOCKS);
  const SAMPLES = 401;

  const disagreementAcrossSharedEdge = () => {
    let bad = 0;
    let n = 0;
    for (let codeA = 1; codeA < MASK_CODES; codeA++) {
      const c0 = codeA & 1;
      const c1 = (codeA >> 1) & 1;
      for (let far = 0; far < 4; far++) {
        // Cell B lies across cell A's v = 0 edge, so B's corners 2,3 are the same
        // two tiles as A's corners 0,1. Its other two corners are unconstrained.
        const codeB = (c0 << 2) | (c1 << 3) | far;
        for (let vA = 0; vA < VARIANTS; vA++) {
          for (let vB = 0; vB < VARIANTS; vB++) {
            for (let i = 0; i < SAMPLES; i++) {
              const u = (i + 0.5) / SAMPLES;
              const a = maskAt(codeA, vA, u, HALF_BLOCK, SEED, BLOCKS);
              const b = maskAt(codeB, vB, u, 1 - HALF_BLOCK, SEED, BLOCKS);
              if (a !== b) bad++;
              n++;
            }
          }
        }
      }
    }
    return bad / n;
  };

  const withinCellBlockStep = () => {
    let bad = 0;
    let n = 0;
    for (let code = 1; code < MASK_CODES; code++) {
      for (let variant = 0; variant < VARIANTS; variant++) {
        for (let row = 4; row < BLOCKS - 4; row++) {
          for (let i = 0; i < SAMPLES; i++) {
            const u = (i + 0.5) / SAMPLES;
            const y0 = (row + 0.5) / BLOCKS;
            const y1 = (row + 1.5) / BLOCKS;
            if (maskAt(code, variant, u, y0, SEED, BLOCKS) !== maskAt(code, variant, u, y1, SEED, BLOCKS)) {
              bad++;
            }
            n++;
          }
        }
      }
    }
    return bad / n;
  };

  it("disagrees across a shared edge less than a cell's own blocks disagree internally", () => {
    const across = disagreementAcrossSharedEdge();
    const within = withinCellBlockStep();
    expect(across).toBeLessThan(within);
    // Absolute guard too, so the test cannot pass by the control degrading.
    expect(across).toBeLessThan(0.02);
  });
});
