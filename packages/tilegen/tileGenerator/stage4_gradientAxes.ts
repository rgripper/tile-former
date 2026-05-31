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
import { clamp } from "./utils";
import { getRockType } from "../tileMap/rockTypes";

export function stage4_gradientAxes(grid: PatchCell[][]): void {
  const pw = grid.length;
  const ph = grid[0].length;

  const alt = (x: number, y: number) =>
    grid[clamp(x, 0, pw - 1)][clamp(y, 0, ph - 1)].altitude;

  for (let x = 0; x < pw; x++) {
    for (let y = 0; y < ph; y++) {
      const gx = alt(x + 1, y) - alt(x - 1, y); // east − west
      const gy = alt(x, y + 1) - alt(x, y - 1); // south − north

      const slopeDrainage = clamp(Math.sqrt(gx * gx + gy * gy) / 0.3, 0, 1);
      const { permeability } = getRockType(grid[x][y].rockType);

      // Slope drives most of drainage; rock permeability contributes a baseline
      // so impermeable rock (granite) stays wet even on gentle slopes.
      grid[x][y].drainage = clamp(slopeDrainage * 0.7 + permeability * 0.3, 0, 1);

      // South-facing slope (gy > 0: terrain rises southward) → more light.
      grid[x][y].light = clamp(0.5 + gy * 1.5, 0.1, 1.0);
    }
  }
}
