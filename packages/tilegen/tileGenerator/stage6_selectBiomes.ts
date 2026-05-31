// Stage 6 — Biome selection [patch scale]
// Spec: BIOME_LOCAL_PIPELINE.md  Full selection spec: BIOME_LOCAL_SELECTION.md
//
// Assigns a biomeId to each patch by cascading through temperature zone,
// moisture regime, and secondary axes (selectBiomeId in cascade.ts).
// Temperature zone and moisture regime are resolved directly from Stage 2 axis
// values — there is no separate coarse/fine noise layer for this step.
// Hard threshold cuts are intentional: Stage 5 blends input axes continuously,
// so biome transitions at borders are smooth without additional blend weights.

import type { PatchCell } from "./types";
import { selectBiomeId } from "./cascade";

export function stage6_selectBiomes(grid: PatchCell[][]): void {
  for (const col of grid) {
    for (const cell of col) {
      cell.biomeId = selectBiomeId(
        cell.altitude,
        cell.temperature,
        cell.precipitation,
        cell.drainage,
      );
    }
  }
}
