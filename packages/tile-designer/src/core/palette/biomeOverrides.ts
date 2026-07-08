import type { PaletteOverride } from "./index.ts";

// Per-biome ramp overrides, keyed by biome id from tilegen's biomes.ts.
// Seed examples — expand as the designer surfaces biomes that need character.
export const biomeOverrides: Record<number, PaletteOverride> = {
  // 1: Tropical Rainforest — lateritic red soil, saturated deep grass.
  1: {
    substrates: { soil: [0x5e3222, 0x7e452e, 0x9c5c3c, 0xb8744c] },
    mats: { grass: [0x1e5518, 0x2e7224, 0x3e9032, 0x52ae44] },
  },
  // 3: Savanna — golden dry grass over laterite.
  3: {
    mats: { dryGrass: [0x9c8028, 0xbe9e3a, 0xdcba52, 0xf0d470] },
  },
  // 17: Hot Desert — paler wind-sorted sand.
  17: {
    substrates: { sand: [0xbe9a68, 0xdcba80, 0xf0d49a, 0xfae8bc] },
  },
  // 8: Taiga — darker, colder needle duff.
  8: {
    mats: { needleLitter: [0x3a2e20, 0x4e3f2a, 0x605034, 0x726040] },
  },
};
