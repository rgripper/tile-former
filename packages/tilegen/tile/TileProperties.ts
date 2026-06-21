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
};
