// Builds a representative DesignInput from a Biome's parameter distributions.
// Used by presets and the biome-gallery preview. The fertility / moisture /
// forest heuristics approximate what the tilegen pipeline derives — good
// enough to validate taxonomy coverage per biome, not a pipeline replacement.

import type { Biome } from "@tile-former/tilegen";
import { ALL_ROCK_TYPE_IDS } from "@tile-former/tilegen";
import type { DesignInput } from "./types.ts";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function biomeToInput(biome: Biome): DesignInput {
  const p = biome.paramDist;
  const temperature = p.temperature.mean;
  const precipitation = clamp01(p.precipitation.mean);
  const drainage = clamp01(p.drainage.mean);
  // High drainage sheds water before plants can use it.
  const effectiveMoisture = clamp01(precipitation * (1 - 0.35 * drainage));
  // Warm + moist ≈ fertile; deviates from tilegen's rock-aware derivation.
  const warmBand = clamp01((temperature - 0) / 10) * clamp01((32 - temperature) / 10);
  const fertility = clamp01(0.15 + 0.5 * effectiveMoisture + 0.3 * warmBand);
  const forested = /forest|taiga|rainforest/i.test(biome.name);

  return {
    temperature,
    effectiveMoisture,
    drainage,
    groundLight: clamp01(p.light.mean),
    altitude: clamp01(p.altitude.mean),
    fertility,
    riparian: 0,
    forestDensity: forested ? 0.6 : 0.05,
    // Deterministic per-biome rock pick, just for gallery variety.
    rockType: ALL_ROCK_TYPE_IDS[biome.id % ALL_ROCK_TYPE_IDS.length]!,
    water: false,
    biomeId: biome.id,
  };
}
