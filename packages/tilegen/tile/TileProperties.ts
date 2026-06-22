import type { RockTypeId } from "./rockTypes";

export type TileProperties = {
  temperature: number;
  precipitation: number;
  drainage: number;
  light: number;       // [0, 1] — base insolation from segmentBase (latitude/climate baseline)
  cliffShadow: number; // [0, 1] — fraction of light blocked by surrounding cliff walls
  groundLight: number; // [0, 1] — final light reaching the ground (light * (1 - cliffShadow) * forest modifiers)
  altitude: number;
  altitudeLevel: number; // [0, 10] — discretized altitude, Math.round(altitude * 10)
  seasonality: number;
  effectiveMoisture: number;
  continentality: number;
  rockType: RockTypeId;
  fertility: number; // [0, 1] — derived in Stage "fertility" from rock + climate + moisture
  mineableResource: string | undefined; // resource type id from mineableResourceRates, set in Stage "Mineable Resource"
  water: boolean;
  waterType: "pond" | undefined;
  surfaceType: "rocky" | "sandy" | undefined;
  riparian: boolean;
  // [0, 1] — base probability weight for tree/large-vegetation spawning.
  // Combines soil viability, topography, and hydrology. Set by dresser stage 2.
  // Does NOT include canopy competition (applied per-tree at spawn time) or
  // seed dispersal (emergent from local-parent spawn mechanic).
  treeSuitability: number;
  // [0, 1] — base probability weight for bush/shrub spawning.
  // Same causes as treeSuitability but with different tolerances: looser soil
  // requirements, steeper slope tolerance, and hydrology inverted — riparian
  // zones are peak habitat rather than suppression zones.
  // Does NOT include canopy suppression (applied at spawn time).
  bushSuitability: number;
  // Continuous-coordinate placements (tile units) of trees and bushes whose
  // tile membership falls within this tile. Set by dresser stage 4.
  trees: Array<{ x: number; y: number }>;
  bushes: Array<{ x: number; y: number }>;
};
