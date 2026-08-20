// The master palette: the ONLY colors any stage of the pipeline may emit.
//
// Cozy-horror register (Kingdom, Noita): low saturation everywhere except the
// four reserved accents, shadows shifted cool and highlights warm within each
// ramp, and a deliberately narrow value band shared by the terrain ramps.
//
// That last point is the load-bearing one. The terrain ramps (earth, clay,
// verdant, duff, moss, muck, water) all sit at luminance ~34/57/85/110 — they
// differ from each other almost purely in *hue*. Adjacent biomes therefore read
// flat and toy-like rather than as competing depth cues, which leaves *value*
// free to separate feature layers from the ground so patches and decorations
// read as objects sitting on it. Getting this backwards is what makes
// generated terrain look like soup. sand/frost/snow break the band on purpose:
// they are meant to read as bright ground.
//
// 13 ramps × 4 steps + 4 accents = 56 colors. Values were generated from an
// HSL specification (hue/saturation/lightness endpoints per ramp, lerped over
// the four steps with a small mid-step chroma bump) and then frozen here as
// hex, so this file is directly art-directable. Adding a color is a deliberate
// art decision; generators may never mix, blend, or interpolate — they pick a
// ramp step, and anything derived (climate tints) is snapped back onto the
// palette by `snapToPalette`.

import type { Ramp } from "../types.ts";

export const RAMP_IDS = [
  "stone",
  "sand",
  "earth",
  "clay",
  "muck",
  "frost",
  "snow",
  "verdant",
  "straw",
  "moss",
  "pallid",
  "duff",
  "water",
] as const;
export type RampId = (typeof RAMP_IDS)[number];

// Each ramp is dark → highlight. Shadows lean cool (toward violet for warm
// hues, toward blue for cool ones), highlights lean warm (toward yellow).
export const MASTER_RAMPS: Record<RampId, Ramp> = {
  // Cool grey bedrock and rubble.
  stone:   [0x292e38, 0x444d5a, 0x636d78, 0x878d92],
  // Muted wind-sorted sand — ochre, never a saturated desert yellow.
  sand:    [0x5b4a33, 0x8e7345, 0xb69d61, 0xc9bc92],
  // Default earth horizon.
  earth:   [0x31231b, 0x513b2a, 0x6d543b, 0x856f51],
  // Red-brown lateritic / impermeable ground.
  clay:    [0x38231f, 0x59382d, 0x77503f, 0x916b55],
  // Dark olive-brown waterlogged organics (mud, peat).
  muck:    [0x211f18, 0x373325, 0x4e4732, 0x635840],
  // Pale blue-grey permafrost.
  frost:   [0x3d4551, 0x57687c, 0x768ca1, 0xa0afbb],
  // Cool near-white snowpack.
  snow:    [0x6f7d95, 0x91a0b5, 0xb7c4d1, 0xe0e6eb],
  // Dusty living green — deliberately not vivid.
  verdant: [0x202c1b, 0x374b29, 0x526838, 0x6f824a],
  // Straw / steppe yellow-green.
  straw:   [0x353720, 0x56552d, 0x746e3b, 0x8d824e],
  // Deep desaturated shade green (moss, cushion).
  moss:    [0x1b271d, 0x2b402b, 0x3f583c, 0x566d4f],
  // Grey-green crust (lichen).
  pallid:  [0x3a3f37, 0x575f4e, 0x778065, 0x969c81],
  // Warm brown forest duff and litter.
  duff:    [0x2b1f17, 0x493524, 0x644d33, 0x7a6548],
  // Standing water.
  water:   [0x182c3f, 0x234862, 0x326780, 0x4a8396],
};

// Reserved accents — the only saturated colors in the world. Terrain must
// never use these; they exist so that when one appears it *means* something.
export const ACCENTS = {
  // Near-black, cool. Contact outlines under features and the deepest shadow.
  void: 0x13151b,
  // Warm firelight / lamps.
  ember: 0xc87637,
  // Danger, blood.
  blood: 0x8a2e34,
  // The uncanny note: sickly yellow-green. Use sparingly.
  bile: 0x94a23f,
} as const;
export type AccentId = keyof typeof ACCENTS;

// Every legal color, for snapping and for the designer's palette inspector.
export const ALL_PALETTE_COLORS: readonly number[] = [
  ...RAMP_IDS.flatMap((id) => MASTER_RAMPS[id]),
  ...Object.values(ACCENTS),
];

// Luma-weighted RGB distance. Perceptually crude next to CIELAB, but the
// palette is coarse enough that weighting for the eye's green sensitivity is
// all that's needed to keep snaps from drifting across hue families.
function colorDistance(a: number, b: number): number {
  const dr = ((a >> 16) & 0xff) - ((b >> 16) & 0xff);
  const dg = ((a >> 8) & 0xff) - ((b >> 8) & 0xff);
  const db = (a & 0xff) - (b & 0xff);
  return 0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db;
}

// Nearest legal color. This is the enforcement point for palette discipline:
// anything computed (climate tints, per-biome shifts) passes through here, so
// no stage can introduce an off-palette color even by accident. A grass ramp
// shifted toward yellow for a dry climate lands on `straw` steps by itself,
// which is exactly the intended result.
export function snapToPalette(color: number): number {
  let best = ALL_PALETTE_COLORS[0]!;
  let bestD = Infinity;
  for (const candidate of ALL_PALETTE_COLORS) {
    const d = colorDistance(color, candidate);
    if (d < bestD) {
      bestD = d;
      best = candidate;
    }
  }
  return best;
}

export function snapRampToPalette(ramp: Ramp): Ramp {
  return ramp.map(snapToPalette) as Ramp;
}
