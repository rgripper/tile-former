import type { PatchCell } from "./types";
import { clamp } from "./utils";

export function stage3_gradientAxes(grid: PatchCell[][]): void {
  const pw = grid.length;
  const ph = grid[0].length;

  const alt = (x: number, y: number) =>
    grid[clamp(x, 0, pw - 1)][clamp(y, 0, ph - 1)].altitude;

  for (let x = 0; x < pw; x++) {
    for (let y = 0; y < ph; y++) {
      const gx = alt(x + 1, y) - alt(x - 1, y); // east − west
      const gy = alt(x, y + 1) - alt(x, y - 1); // south − north

      // Steeper slope → better drainage. Max gradient in ±0.15-amplitude noise ≈ 0.3.
      grid[x][y].drainage = clamp(Math.sqrt(gx * gx + gy * gy) / 0.3, 0, 1);

      // South-facing slope (gy > 0: terrain rises southward) → more light.
      // North-facing (gy < 0) → less light.
      grid[x][y].light = clamp(0.5 + gy * 1.5, 0.1, 1.0);
    }
  }
}
