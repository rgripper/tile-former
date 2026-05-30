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
  fertility: number;         // [0, 1] — derived in Stage 11 from rock + climate + moisture
  ore: string | undefined;   // ore type id from oreRates, set in Stage 12
  water: boolean;
  waterType: "pond" | undefined;
  surfaceType: "rocky" | "sandy" | undefined;
  riparian: boolean;
};
