// Substrate stage (M2): paints the blended ground materials for one tile.
//
// Every generator is a pure function of world pixel coordinates — a tile bake
// passes its world-space origin and pixels are sampled at (ox + x, oy + y),
// so two adjacent tiles that resolve to the same substrate produce one
// continuous field with no seam. The 2:1 iso squash is compensated by
// doubling y-frequency inside the generators so features look isotropic on
// the projected diamond.

import type { Ramp, RenderStyle, StyleParams, SubstrateId } from "../types.ts";
import { hash2D } from "../rng.ts";
import { bayer, cellEdge, fbm } from "../noise.ts";
import { insideDiamond, put, type PixelBuffer } from "../pixels.ts";
import { rampAt } from "../palette/index.ts";
import { resolveTone } from "../tone.ts";

// Texturing context shared by all generators for a given tile.
type Ctx = { seed: number; arid: number; wet: number; render: RenderStyle; tileBias: number };

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

// Flat-mode base fields: a dominant-centered ramp *position* (0..3, one unit =
// one ramp step) for each substrate — NOT a full-range field. The value sits on
// the material's dominant step `D` with only low-amplitude low-frequency wobble
// (`(field − 0.5) * AMP`), so quantizing it yields mostly the dominant tone with
// off-dominant pixels clustered into soft patches rather than speckle. Cracks/
// edges subtract enough to reach step 0; sheen/sparkle push past 3. Values may
// fall outside [0,3]; resolveTone clamps.
type BaseGen = (wx: number, wy: number, c: Ctx) => number;

// Low-frequency structural field in [0,1] (no per-pixel grain).
const field = (wx: number, wy: number, seed: number, freq: number) => fbm(wx, wy * 2, seed, freq);

const baseGenerators: Record<SubstrateId, BaseGen> = {
  bareRock(wx, wy, c) {
    // Diagonal strata around a mid-grey dominant; fracture lines drop to dark.
    let v = 1.4 + (fbm(wx + wy * 2.4, wy * 2, c.seed, 0.045) - 0.5) * 1.1;
    if (cellEdge(wx, wy * 2, c.seed ^ 0x2545f491, 22) < 0.06) v -= 1.6;
    return v;
  },

  scree(wx, wy, c) {
    // Faceted rubble: each ~3px clump carries one tone around a light dominant.
    const clump = hash2D(Math.floor(wx / 3), Math.floor((wy * 2) / 3), c.seed);
    return 1.7 + (clump - 0.5) * 1.3;
  },

  sand(wx, wy, c) {
    // Wind ripples as gentle light/dark banding on a bright dominant.
    const wander = fbm(wx, wy * 2, c.seed, 0.02) * 14;
    const ripple = 0.5 + 0.5 * Math.sin((wy * 2 + wander) * 0.7 + wx * 0.05);
    return 2.0 + (ripple - 0.5) * 1.0;
  },

  soil(wx, wy, c) {
    let v = 1.3 + (field(wx, wy, c.seed, 0.06) - 0.5) * 1.1;
    if (c.arid > 0.4 && cellEdge(wx, wy * 2, c.seed ^ 0x3c6ef372, 16) < 0.05 * c.arid) v -= 1.6;
    return v;
  },

  clay(wx, wy, c) {
    let v = 1.4 + (field(wx, wy, c.seed, 0.035) - 0.5) * 1.0;
    if (c.arid > 0.15 && cellEdge(wx, wy * 2, c.seed ^ 0xbf58476d, 12) < 0.1 * c.arid) v -= 1.9;
    if (c.wet > 0.3 && hash2D(wx, wy, c.seed ^ 0x94d049bb) > 1 - 0.05 * c.wet) v = 3.6; // sheen glint
    return v;
  },

  mud(wx, wy, c) {
    let v = 1.1 + (field(wx, wy, c.seed, 0.05) - 0.5) * 1.0;
    if (hash2D(wx, wy, c.seed ^ 0xd6e8feb8) > 1 - 0.06 * Math.max(c.wet, 0.4)) v = 3.6; // sheen
    return v;
  },

  peat(wx, wy, c) {
    // Fibrous horizontal streaks (per 4px column) around a dark dominant.
    const streak = hash2D(Math.floor(wx / 4), wy, c.seed);
    const base = field(wx, wy, c.seed ^ 0x5851f42d, 0.07);
    return 1.1 + (base * 0.5 + streak * 0.5 - 0.5) * 1.2;
  },

  frozenGround(wx, wy, c) {
    let v = 1.9 + (field(wx, wy, c.seed, 0.05) - 0.5) * 1.0;
    const edge = cellEdge(wx, wy * 2, c.seed ^ 0x85ebca6b, 20);
    if (edge < 0.08) v -= 1.6;
    else if (edge < 0.16) v -= 0.7;
    return v;
  },

  snow(wx, wy, c) {
    if (hash2D(wx, wy, c.seed ^ 0xcc9e2d51) > 0.985) return 3.6; // sparkle
    return 2.6 + (field(wx, wy, c.seed, 0.03) - 0.5) * 1.0;
  },
};

// Blend field: which substrate owns a pixel. Low-frequency fBm forms the
// large patches. Feathered mode adds a Bayer-dither band so the transition
// reads as interpenetration; crisp mode thresholds hard for a clean edge.
function pickSubstrate(
  subs: StyleParams["surface"]["substrates"],
  wx: number,
  wy: number,
  seed: number,
  crisp: boolean,
): SubstrateId {
  const first = subs[0]!;
  if (subs.length === 1) return first.id;
  const n = fbm(wx, wy * 2, seed ^ 0x6c62272e, 0.03);
  const t = crisp ? n : n + (bayer(wx, wy) - 0.5) * 0.22;
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
  render: RenderStyle,
  tileBias: number,
): void {
  const ctx: Ctx = { seed, arid: style.texture.arid, wet: style.texture.wet, render, tileBias };
  const subs = style.surface.substrates;
  const crisp = render.crispEdges;
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      if (!insideDiamond(x, y)) continue;
      const wx = ox + x;
      const wy = oy + y;
      const id = pickSubstrate(subs, wx, wy, seed, crisp);
      const ramp = style.substrateRamps[id]!;
      if (render.legacyGrain) {
        put(buf, x, y, generators[id](wx, wy, ramp, ctx));
      } else {
        put(buf, x, y, resolveTone(baseGenerators[id](wx, wy, ctx), wx, wy, ramp, seed, tileBias));
      }
    }
  }
}
