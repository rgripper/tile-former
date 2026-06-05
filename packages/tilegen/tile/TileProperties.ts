import type { RockTypeId } from "./rockTypes";

export type TileProperties = {
  temperature: number;
  precipitation: number;
  drainage: number;
  light: number;
  altitude: number;
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
