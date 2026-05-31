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
