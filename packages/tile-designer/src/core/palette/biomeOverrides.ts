import type { PaletteOverride } from "./index.ts";

// Per-biome material restyling, keyed by biome id from tilegen's biomes.ts.
//
// An override repoints a material at a different master ramp and/or moves its
// shade window. It cannot supply raw colors, so no biome can drift off-palette
// — which is the whole reason biome character is expressed this way now. Giving
// rainforest soil the `clay` ramp says "the soil here is lateritic" in one edit
// and is guaranteed to harmonize with every other biome.
//
// Seed set — expand as the biome gallery surfaces biomes that need character.
export const biomeOverrides: Record<number, PaletteOverride> = {
  // Tropical Rainforest — deep lateritic red soil under the canopy.
  1: { soil: { ramp: "clay" } },

  // Savanna — bleached golden standing grass.
  3: { dryGrass: { shade: 1 } },

  // Hot Desert — paler wind-sorted sand than the global default.
  17: { sand: { shade: 1 } },

  // Tropical Swamp / Temperate Wetland — the mineral soil between the pools
  // reads as waterlogged muck rather than a distinct earth horizon.
  12: { soil: { ramp: "muck" } },
  13: { soil: { ramp: "muck" } },

  // Alpine / Alpine Fell — thin skeletal soil over frost-shattered bedrock.
  10: { soil: { ramp: "stone", shade: 1 } },
  28: { soil: { ramp: "stone", shade: 1 } },

  // Cloud Forest / Montane Rainforest — everything is under moss.
  11: { soil: { ramp: "muck" }, leafLitter: { ramp: "moss", shade: 1 } },
  37: { soil: { ramp: "muck" }, leafLitter: { ramp: "moss", shade: 1 } },
};

// Note: Taiga's old "darker, colder needle duff" override is gone because it is
// now the global default — `needleLitter` sits at `duff` shade -1 in
// MATERIAL_STYLES, so every needle-litter biome gets it.
