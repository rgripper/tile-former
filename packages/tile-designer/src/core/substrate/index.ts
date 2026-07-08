// Substrate stage (M2): paints the blended ground materials for one tile.
//
// Every generator is a pure function of world pixel coordinates — a tile bake
// passes its world-space origin and pixels are sampled at (ox + x, oy + y),
// so two adjacent tiles that resolve to the same substrate produce one
// continuous field with no seam. The 2:1 iso squash is compensated by
// doubling y-frequency inside the generators so features look isotropic on
// the projected diamond.

import type { Ramp, StyleParams, SubstrateId } from "../types.ts";
import { hash2D } from "../rng.ts";
import { bayer, cellEdge, fbm } from "../noise.ts";
import { insideDiamond, put, type PixelBuffer } from "../pixels.ts";

// Texturing context shared by all generators for a given tile.
type Ctx = { seed: number; arid: number; wet: number };

// Map a [0,1) value onto the 4-step ramp with a mid-heavy distribution:
// mostly indices 1–2, occasional deep shadow (0) and highlight (3).
function rampAt(ramp: Ramp, v: number): number {
  return ramp[v < 0.12 ? 0 : v < 0.58 ? 1 : v < 0.92 ? 2 : 3]!;
}

type Generator = (wx: number, wy: number, ramp: Ramp, c: Ctx) => number;

const generators: Record<SubstrateId, Generator> = {
  bareRock(wx, wy, ramp, c) {
    // Diagonal strata bands + fracture lines along cell boundaries.
    const strata = fbm(wx + wy * 2.4, wy * 2, c.seed, 0.045);
    const grain = hash2D(wx, wy, c.seed ^ 0x1b56c4e9);
    let v = strata * 0.75 + grain * 0.25;
    if (cellEdge(wx, wy * 2, c.seed ^ 0x2545f491, 22) < 0.06) v *= 0.35;
    return rampAt(ramp, v);
  },

  scree(wx, wy, ramp, c) {
    // Clumped rubble: each ~3px clump gets one value, plus per-pixel grain so
    // fragments read as faceted rather than flat.
    const clump = hash2D(Math.floor(wx / 3), Math.floor((wy * 2) / 3), c.seed);
    const grain = hash2D(wx, wy, c.seed ^ 0x7feb352d);
    return rampAt(ramp, clump * 0.7 + grain * 0.3);
  },

  sand(wx, wy, ramp, c) {
    // Wind ripples: horizontal waves whose phase wanders with low-freq noise.
    const wander = fbm(wx, wy * 2, c.seed, 0.02) * 14;
    const ripple = 0.5 + 0.5 * Math.sin((wy * 2 + wander) * 0.7 + wx * 0.05);
    const grain = hash2D(wx, wy, c.seed ^ 0x846ca68b);
    return rampAt(ramp, ripple * 0.55 + grain * 0.45 * ripple + grain * 0.12);
  },

  soil(wx, wy, ramp, c) {
    // Soft organic mottling + speckle; cracked crust when arid.
    const mottle = fbm(wx, wy * 2, c.seed, 0.06);
    const grain = hash2D(wx, wy, c.seed ^ 0x9e3779b9);
    let v = mottle * 0.65 + grain * 0.35;
    if (c.arid > 0.4 && cellEdge(wx, wy * 2, c.seed ^ 0x3c6ef372, 16) < 0.05 * c.arid) v *= 0.4;
    return rampAt(ramp, v);
  },

  clay(wx, wy, ramp, c) {
    // Smooth sheets; polygonal shrinkage cracks grow with aridity, faint
    // sheen highlights when wet.
    const sheet = fbm(wx, wy * 2, c.seed, 0.035);
    const grain = hash2D(wx, wy, c.seed ^ 0x94d049bb);
    let v = sheet * 0.8 + grain * 0.2;
    if (c.arid > 0.15 && cellEdge(wx, wy * 2, c.seed ^ 0xbf58476d, 12) < 0.1 * c.arid) v *= 0.3;
    if (c.wet > 0.3 && grain > 1 - 0.08 * c.wet) v = 0.95;
    return rampAt(ramp, v);
  },

  mud(wx, wy, ramp, c) {
    // Dark, low-contrast slicks with wet sheen speckles.
    const slick = fbm(wx, wy * 2, c.seed, 0.05);
    const grain = hash2D(wx, wy, c.seed ^ 0xd6e8feb8);
    let v = 0.15 + slick * 0.55 + grain * 0.2;
    if (grain > 1 - 0.1 * Math.max(c.wet, 0.4)) v = 0.95; // sheen glints
    return rampAt(ramp, v);
  },

  peat(wx, wy, ramp, c) {
    // Fibrous horizontal streaks over dark ground.
    const streak = hash2D(Math.floor(wx / 4), wy, c.seed);
    const base = fbm(wx, wy * 2, c.seed ^ 0x5851f42d, 0.07);
    const grain = hash2D(wx, wy, c.seed ^ 0x4c957f2d);
    return rampAt(ramp, base * 0.45 + streak * 0.35 + grain * 0.2);
  },

  frozenGround(wx, wy, ramp, c) {
    // Frost-heave polygons: light cell interiors, dark boundary furrows.
    const base = fbm(wx, wy * 2, c.seed, 0.05);
    const grain = hash2D(wx, wy, c.seed ^ 0x2127599b);
    let v = 0.25 + base * 0.5 + grain * 0.25;
    const edge = cellEdge(wx, wy * 2, c.seed ^ 0x85ebca6b, 20);
    if (edge < 0.08) v *= 0.45;
    else if (edge < 0.16) v *= 0.75;
    return rampAt(ramp, v);
  },

  snow(wx, wy, ramp, c) {
    // Bright drifts, soft blue shadowing in dips, sparse sparkle.
    const drift = fbm(wx, wy * 2, c.seed, 0.03);
    const grain = hash2D(wx, wy, c.seed ^ 0xcc9e2d51);
    if (grain > 0.985) return ramp[3]!; // sparkle
    const v = 0.3 + drift * 0.55 + grain * 0.15;
    return rampAt(ramp, v);
  },
};

// Blend field: which substrate owns a pixel. Low-frequency fBm forms the
// large patches; Bayer dither roughens the boundary band so the transition
// reads as interpenetration, not a contour line.
function pickSubstrate(
  subs: StyleParams["surface"]["substrates"],
  wx: number,
  wy: number,
  seed: number,
): SubstrateId {
  const first = subs[0]!;
  if (subs.length === 1) return first.id;
  const n = fbm(wx, wy * 2, seed ^ 0x6c62272e, 0.03);
  const t = n + (bayer(wx, wy) - 0.5) * 0.22;
  return t < first.weight ? first.id : subs[1]!.id;
}

// Paints substrate colors for every diamond pixel of `buf`. (ox, oy) is the
// tile's origin in world pixel space; `seed` is the world seed (NOT per-tile —
// per-tile seeds would break cross-tile continuity).
export function paintSubstrate(
  buf: PixelBuffer,
  style: StyleParams,
  ox: number,
  oy: number,
  seed: number,
): void {
  const ctx: Ctx = { seed, arid: style.texture.arid, wet: style.texture.wet };
  const subs = style.surface.substrates;
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (!insideDiamond(x, y)) continue;
      const wx = ox + x;
      const wy = oy + y;
      const id = pickSubstrate(subs, wx, wy, seed);
      put(buf, x, y, generators[id](wx, wy, style.substrateRamps[id]!, ctx));
    }
  }
}
