// Flat ("minecrafty") tone resolver shared by the substrate and mat stages.
//
// A material's generator hands us a *dominant-biased structural* base — a
// low-amplitude, low-frequency field centered on one ramp step. Quantizing it
// yields mostly the dominant tone, with the off-dominant pixels forming
// contiguous soft patches (because the field is low frequency), NOT isolated
// speckle. Structural features (cracks) push the base below 0 → darkest step;
// sheen/sparkle push above 3 → highlight. On top of that a tiny per-pixel
// accent (~3.5%, ±1 only) adds the last bit of life — the fine tonal fleck
// (e.g. darker-green flecks in grass) that keeps flat fills from reading dead:
//
//   ~85% dominant tone (solid) · ~12% one step off (patches) · ~3.5% accent

import type { Ramp } from "./types.ts";
import { hash2D } from "./rng.ts";

// Fraction of pixels that get a single-step accent. Kept low so accents read
// as occasional flecks, not grain — the bulk of variation is the base patches.
const ACCENT = 0.965;

const clampIdx = (i: number) => (i < 0 ? 0 : i > 3 ? 3 : i);

// base: continuous position on the 0..3 ramp. Generators center it on the
// material's dominant step with only low-amplitude low-frequency wobble;
// structural features (cracks) push below 0 → darkest step, sheen/sparkle push
// above 3 → highlight. tileBias: whole-tile dominant offset (0 unless tile
// variation is on).
export function resolveTone(
  base: number,
  wx: number,
  wy: number,
  ramp: Ramp,
  seed: number,
  tileBias: number,
): number {
  let idx = Math.round(clampIdx(base + tileBias));
  if (hash2D(wx, wy, seed ^ 0x1971d9d5) >= ACCENT) {
    idx += hash2D(wx, wy, seed ^ 0x1a2b3c4d) < 0.5 ? -1 : 1;
  }
  return ramp[clampIdx(idx)]!;
}
