import type { TileProperties } from "./TileProperties.ts";

// effectiveMoisture is a derived axis (precipitation × (1 − drainage)), not a raw TileProperty.
export type PrimaryAxis = keyof TileProperties | "effectiveMoisture";

export type BiomeVariant = {
  name: string;
  biomeId: number | null;  // null = not yet defined in biomes.ts
  lowerBound: number | null; // null = not yet derived; last variant runs to axis max
};

export type BiomeFamily = {
  name: string;
  primaryAxis: PrimaryAxis;
  // lowerBound units follow primaryAxis: °C for "temperature", 0–1 for all others
  variants: BiomeVariant[]; // ordered ascending by lowerBound
};

// Thresholds derived from range boundaries in biomes.ts.
// Entries with null biomeId or null lowerBound are stubs — they need corresponding
// biome definitions and/or axis data before they can be used in generation.
export const biomeFamilies: BiomeFamily[] = [
  {
    // Boreal Bog drainageRange [0, 0.15], Taiga [0.05, 0.35] — threshold at Bog's upper bound.
    // Subalpine Forest not yet in biomes.ts.
    name: "Cold Forests",
    primaryAxis: "drainage",
    variants: [
      { name: "Boreal Bog",       biomeId: 14,   lowerBound: 0.00 },
      { name: "Taiga",            biomeId: 8,    lowerBound: 0.15 },
      { name: "Subalpine Forest", biomeId: null, lowerBound: 0.35 },
    ],
  },
  {
    // effectiveMoisture = precipitation × (1 − drainage)
    // Mediterranean (id 7) proxy for dry end: ~[0.05, 0.32]
    // Temperate Forest (id 5):                ~[0.20, 0.68]
    // Temperate Wetland (id 13):              ~[0.26, 1.00]
    // Thresholds at range-overlap midpoints. Temperate Rainforest not yet in biomes.ts.
    name: "Temperate Forests",
    primaryAxis: "effectiveMoisture",
    variants: [
      { name: "Dry Oak Woodland",     biomeId: 7,    lowerBound: 0.00 },
      { name: "Temperate Forest",     biomeId: 5,    lowerBound: 0.30 },
      { name: "Temperate Rainforest", biomeId: null, lowerBound: 0.60 },
    ],
  },
  {
    // Tundra altitudeRange [0, 0.30], Alpine [0.45, 1.00] — threshold at gap midpoint.
    // Alpine Meadow and Polar Desert not yet split out as separate biomes.
    name: "Tundra",
    primaryAxis: "altitude",
    variants: [
      { name: "Tundra",  biomeId: 9,  lowerBound: 0.00 },
      { name: "Alpine",  biomeId: 10, lowerBound: 0.38 },
    ],
  },

  // --- Incomplete families: thresholds not yet derivable from biomes.ts ---

  {
    // Thresholds split the existing Grassland (id 6) range [0.15, 0.45] by precipitation.
    // Prairie and Steppe share biomeId 6 — they are the same biome at different moisture levels
    // until Prairie is defined as a distinct entry in biomes.ts.
    // Semi-arid Scrub (id 15): precipitationRange [0.05, 0.20], threshold at its upper bound.
    name: "Grasslands",
    primaryAxis: "precipitation",
    variants: [
      { name: "Semi-arid Scrub", biomeId: 15, lowerBound: 0.00 },
      { name: "Steppe",          biomeId: 6,  lowerBound: 0.20 },
      { name: "Prairie",         biomeId: 6,  lowerBound: 0.32 },
    ],
  },
  {
    // Thresholds at the natural range boundaries: 15°C and 35°C.
    // Cold Desert (id 16): [-15, 15], Desert (id 4): [15, 35], Hot Desert (id 17): [35, 55]
    // lowerBound is in °C — see BiomeFamily note above.
    name: "Deserts",
    primaryAxis: "temperature",
    variants: [
      { name: "Cold Desert", biomeId: 16, lowerBound: -20 },
      { name: "Desert",      biomeId: 4,  lowerBound: 15  },
      { name: "Hot Desert",  biomeId: 17, lowerBound: 35  },
    ],
  },
  {
    // Primary axis switched from salinity (not a TileProperties axis) to temperature (°C).
    // Three wetland biomes already span the full temperature range cleanly:
    // Boreal Bog [-15, 5], Temperate Wetland [-5, 20], Tropical Swamp [20, 35]
    // Thresholds at the natural range boundaries: 5°C and 20°C.
    name: "Wetlands",
    primaryAxis: "temperature",
    variants: [
      { name: "Boreal Bog",        biomeId: 14, lowerBound: -20 },
      { name: "Temperate Wetland", biomeId: 13, lowerBound: 5   },
      { name: "Tropical Swamp",    biomeId: 12, lowerBound: 20  },
    ],
  },
];
