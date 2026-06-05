// Stage 4 — Patch-level secondary axes [patch scale]
// Spec: BIOME_LOCAL_PIPELINE.md
//
// Derives drainage and light from terrain geometry and rock type; both are
// used by biome selection (Stage 6) and CA (Stage 7).
//
// Drainage combines slope gradient with rock permeability:
//   slopeDrainage = clamp(gradient / 0.3, 0, 1)
//   drainage      = slopeDrainage × 0.7 + rockPermeability × 0.3
// Convention: 0 = fully waterlogged, 1 = fully free-draining.
// Light = slope aspect (south-facing slope → higher value).

import type { PatchCell } from "./types";
import { clamp, computeDrainage, computeLight } from "./utils";
import { getRockType } from "../tile/rockTypes";

export function stage4_gradientAxes(grid: PatchCell[][]): void {
  const pw = grid.length;
  const ph = grid[0].length;

  const alt = (x: number, y: number) =>
    grid[clamp(x, 0, pw - 1)][clamp(y, 0, ph - 1)].altitude;

  for (let x = 0; x < pw; x++) {
    for (let y = 0; y < ph; y++) {
      const gx = alt(x + 1, y) - alt(x - 1, y); // east − west
      const gy = alt(x, y + 1) - alt(x, y - 1); // south − north

      const { permeability } = getRockType(grid[x][y].rockType);
      grid[x][y].drainage = computeDrainage(gx, gy, permeability);
      grid[x][y].light = computeLight(gy);
    }
  }
}
