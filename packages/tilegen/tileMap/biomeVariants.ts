// Three-level biome cascade: temperature zone → moisture regime → drainage tiebreaker.
// altitude > ALTITUDE_MONTANE_THRESHOLD is checked first and routes to the montane branch.

export type TemperatureZoneLabel = "arctic" | "cold" | "temperate" | "warm" | "hot";
export type MoistureLabel = "arid" | "semi-arid" | "mesic" | "wet";

// Leaf in the cascade. Covers from drainageLowerBound up to the next slot's bound (or 1.0).
export type DrainageSlot = {
  biomeId: number;
  drainageLowerBound: number; // 0–1
};

// Level-2 node: one moisture regime within a temperature zone.
// Covers from precipLowerBound up to the next node's bound (or 1.0).
export type MoistureNode = {
  label: MoistureLabel;
  precipLowerBound: number;
  slots: readonly DrainageSlot[]; // ≥ 1, ordered ascending by drainageLowerBound
};

// Level-1 node: one temperature zone.
// Covers from tempLowerBound (°C) up to the next node's bound.
export type TemperatureNode = {
  label: TemperatureZoneLabel;
  tempLowerBound: number;            // °C
  moisture: readonly MoistureNode[]; // ordered ascending by precipLowerBound
};

// Root of the cascade. altitude > ALTITUDE_MONTANE_THRESHOLD → montane branch.
export type BiomeCascade = {
  montane: readonly TemperatureNode[];
  lowland:  readonly TemperatureNode[];
};

// --- Temperature zone adjacency ---

// Zones ordered cold→hot. Adjacent entries are the only pairs that can share a segment border.
// Level 1 coarse noise uses this to constrain which second zone a border patch may blend toward:
// a border between Cold and Warm is impossible without Temperate in between.
export const TEMP_ZONE_ORDER: readonly TemperatureZoneLabel[] = [
  "arctic", "cold", "temperate", "warm", "hot",
];

// For each zone: which zones it can directly border (itself + immediate neighbours in TEMP_ZONE_ORDER).
export const TEMP_ZONE_ADJACENCY: Readonly<Record<TemperatureZoneLabel, readonly TemperatureZoneLabel[]>> = {
  arctic:    ["arctic", "cold"],
  cold:      ["arctic", "cold", "temperate"],
  temperate: ["cold",   "temperate", "warm"],
  warm:      ["temperate", "warm", "hot"],
  hot:       ["warm",  "hot"],
};

// --- Thresholds ---

// altitude (0–1) above which a patch is routed to the montane branch.
export const ALTITUDE_MONTANE_THRESHOLD = 0.40;

// Temperature zone lower bounds (°C).
// Derived from temperatureRange midpoints in biomes.ts:
//   arctic    — midpoints < −5 °C  (Tundra: −8)
//   cold      — midpoints −5 to  5 °C  (Taiga: −5, Boreal Bog: −5, Cold Desert: 0)
//   temperate — midpoints  5 to 18 °C  (Temperate Forest: 12, Grassland: 14.5, Mediterranean: 17)
//   warm      — midpoints 18 to 35 °C  (tropical biomes: 25–28, Desert: 25, Savanna: 26.5)
//   hot       — midpoints > 35 °C  (Hot Desert: 45)
export const TEMP_COLD_LB      = -5;
export const TEMP_TEMPERATE_LB =  5;
export const TEMP_WARM_LB      = 18;
export const TEMP_HOT_LB       = 35;

// Precipitation lower bounds for moisture regime buckets.
// Derived from precipitationRange boundaries in biomes.ts:
//   arid      — midpoints < 0.15  (Desert: 0.075, Cold Desert: 0.075, Hot Desert: 0.05)
//   semi-arid — midpoints 0.15–0.35  (Tundra: 0.25, Grassland: 0.30, Mediterranean: 0.30)
//   mesic     — midpoints 0.35–0.60  (Taiga: 0.375, Tropical Dry Forest: 0.475, Boreal Bog: 0.50)
//   wet       — midpoints > 0.60  (Tropical Rainforest: 0.85, Tropical Swamp: 0.80)
// 0.15 = Desert precipitationRange upper bound; 0.35 = Alpine precipitationRange lower bound;
// 0.60 = Tropical Swamp precipitationRange lower bound.
export const PRECIP_SEMI_ARID_LB = 0.15;
export const PRECIP_MESIC_LB     = 0.35;
export const PRECIP_WET_LB       = 0.60;

// --- Helpers (module-private) ---

function single(id: number): readonly DrainageSlot[] {
  return [{ biomeId: id, drainageLowerBound: 0.00 }];
}

function arid(slots: readonly DrainageSlot[]): MoistureNode {
  return { label: "arid", precipLowerBound: 0.00, slots };
}
function semiArid(slots: readonly DrainageSlot[]): MoistureNode {
  return { label: "semi-arid", precipLowerBound: PRECIP_SEMI_ARID_LB, slots };
}
function mesic(slots: readonly DrainageSlot[]): MoistureNode {
  return { label: "mesic", precipLowerBound: PRECIP_MESIC_LB, slots };
}
function wet(slots: readonly DrainageSlot[]): MoistureNode {
  return { label: "wet", precipLowerBound: PRECIP_WET_LB, slots };
}

// --- Cascade ---

export const biomeCascade: BiomeCascade = {
  // altitude > 0.40 → montane branch, regardless of temperature.
  montane: [
    {
      label: "arctic", tempLowerBound: -30,
      moisture: [
        arid(single(27)),     // Alpine Desert
        semiArid(single(28)), // Alpine Fell
        // Alpine (id 10): altitudeRange [0.45, 1], precip [0.35, 0.75], temp [−20, 8]
        // midpoint altitude 0.725 > 0.40 → montane; precip midpoint 0.55 → mesic
        mesic(single(10)),
        wet(single(29)),      // Alpine Bog
      ],
    },
    {
      label: "cold", tempLowerBound: TEMP_COLD_LB,
      moisture: [
        arid(single(30)),     // Subalpine Steppe
        semiArid(single(31)), // Subalpine Heath
        mesic(single(32)),    // Subalpine Forest
        wet(single(33)),      // Subalpine Bog
      ],
    },
    {
      label: "temperate", tempLowerBound: TEMP_TEMPERATE_LB,
      moisture: [
        arid(single(34)),     // Montane Steppe
        semiArid(single(35)), // Montane Scrub
        mesic(single(36)),    // Montane Forest
        wet(single(37)),      // Montane Rainforest
      ],
    },
    {
      label: "warm", tempLowerBound: TEMP_WARM_LB,
      moisture: [
        arid(single(38)),     // Tropical Alpine Desert
        semiArid(single(39)), // Montane Dry Scrub
        mesic(single(40)),    // Subtropical Montane Forest
        // Cloud Forest (id 11): altitudeRange [0.30, 0.65], precip [0.55, 1], temp [15, 28]
        // altitude midpoint 0.475 > 0.40 → montane; precip midpoint 0.775 → wet
        wet(single(11)),
      ],
    },
    {
      label: "hot", tempLowerBound: TEMP_HOT_LB,
      moisture: [
        arid(single(41)),     // Highland Desert
        semiArid(single(42)), // Montane Thorn Scrub
        mesic(single(43)),    // Afromontane Forest
        wet(single(44)),      // Montane Tropical Forest
      ],
    },
  ],

  // altitude ≤ 0.40 → lowland branch.
  lowland: [
    {
      label: "arctic", tempLowerBound: -30,
      moisture: [
        arid(single(18)),  // Polar Desert
        // Tundra (id 9): precip midpoint 0.25 → semi-arid; drainage [0, 0.20] → single slot
        semiArid(single(9)),
        mesic(single(19)), // Arctic Heath
        wet(single(20)),   // Arctic Marsh
      ],
    },
    {
      label: "cold", tempLowerBound: TEMP_COLD_LB,
      moisture: [
        // Cold Desert (id 16): precip midpoint 0.075 → arid
        arid(single(16)),
        semiArid(single(21)), // Cold Steppe
        // Boreal Bog (id 14): drainageRange [0, 0.15] midpoint 0.075 → lower slot
        // Taiga      (id  8): drainageRange [0.05, 0.35] midpoint 0.20  → upper slot
        // Threshold 0.15 = Boreal Bog drainageRange upper bound.
        mesic([
          { biomeId: 14, drainageLowerBound: 0.00 },
          { biomeId: 8,  drainageLowerBound: 0.15 },
        ]),
        wet(single(22)),  // Cold Rainforest
      ],
    },
    {
      label: "temperate", tempLowerBound: TEMP_TEMPERATE_LB,
      moisture: [
        // Semi-arid Scrub (id 15): precip midpoint 0.125 → arid
        arid(single(15)),
        // Mediterranean (id 7): drainageRange [0.30, 0.65] midpoint 0.475 → lower slot
        // Grassland     (id 6): drainageRange [0.35, 0.70] midpoint 0.525 → upper slot
        // Threshold 0.50 = midpoint of the overlap zone [0.35, 0.65].
        semiArid([
          { biomeId: 7, drainageLowerBound: 0.00 },
          { biomeId: 6, drainageLowerBound: 0.50 },
        ]),
        mesic(single(23)), // Temperate Shrubland
        // Temperate Wetland (id 13): drainageRange [0, 0.25] midpoint 0.125 → lower slot
        // Temperate Forest  (id  5): drainageRange [0.20, 0.55] midpoint 0.375 → upper slot
        // Threshold 0.25 = Temperate Wetland drainageRange upper bound.
        wet([
          { biomeId: 13, drainageLowerBound: 0.00 },
          { biomeId: 5,  drainageLowerBound: 0.25 },
        ]),
      ],
    },
    {
      label: "warm", tempLowerBound: TEMP_WARM_LB,
      moisture: [
        // Desert (id 4): precip midpoint 0.075 → arid
        arid(single(4)),
        // Savanna (id 3): precip midpoint 0.325 → semi-arid
        semiArid(single(3)),
        // Tropical Dry Forest (id 2): precip midpoint 0.475 → mesic
        mesic(single(2)),
        // Tropical Swamp      (id 12): drainageRange [0, 0.20] midpoint 0.10 → lower slot
        // Tropical Rainforest (id  1): drainageRange [0.05, 0.35] midpoint 0.20 → upper slot
        // Threshold 0.20 = Tropical Swamp drainageRange upper bound.
        wet([
          { biomeId: 12, drainageLowerBound: 0.00 },
          { biomeId: 1,  drainageLowerBound: 0.20 },
        ]),
      ],
    },
    {
      label: "hot", tempLowerBound: TEMP_HOT_LB,
      moisture: [
        // Hot Desert (id 17): precip midpoint 0.05 → arid
        arid(single(17)),
        semiArid(single(24)), // Thorn Scrub
        mesic(single(25)),    // Tropical Monsoon Forest
        wet(single(26)),      // Tropical Monsoon Rainforest
      ],
    },
  ],
};
