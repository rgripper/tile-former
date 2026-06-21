// Stage 7 — CA smoothing [patch scale]
// Spec: BIOME_LOCAL_PIPELINE.md  Full CA spec: BIOME_LOCAL_CA.md
//
// Two-pass cellular automaton on the patch biome grid. Each pass:
//   1. Plurality rule — proposes the modal biome among Moore-8 neighbours.
//   2. Terrain-justification check — commits the replacement only when the
//      cluster is smaller than CLUSTER_SURVIVAL_MIN AND the proposed biome fits
//      the patch's terrain axes at least as well as the current one.
// Each patch exits this stage with a stable biome assignment and rock type.

import type { Biome } from "../tile/Biome";
import type { PatchCell } from "./types";
import { MOORE8, tileKey, VON4 } from "./utils";

const CLUSTER_SURVIVAL_MIN = 7;

export function stage7_caSmoothing(grid: PatchCell[][], biomes: Biome[]): void {
  const pw = grid.length;
  const ph = grid[0].length;

  const biomeById = new Map<number, Biome>();
  for (const b of biomes) biomeById.set(b.id, b);

  for (let pass = 0; pass < 2; pass++) {
    // Level 1: plurality-rule — collect proposed replacements
    const proposed: number[][] = grid.map((col) => col.map((c) => c.biomeId));

    for (let x = 0; x < pw; x++) {
      for (let y = 0; y < ph; y++) {
        const counts = new Map<number, number>();
        for (const [dx, dy] of MOORE8) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && nx < pw && ny >= 0 && ny < ph) {
            const id = grid[nx][ny].biomeId;
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }
        }
        let best = grid[x][y].biomeId,
          bestCount = 0;
        for (const [id, count] of counts) {
          if (count > bestCount) {
            bestCount = count;
            best = id;
          }
        }
        proposed[x][y] = best;
      }
    }

    // Level 2: terrain-justification check before committing each reassignment
    for (let x = 0; x < pw; x++) {
      for (let y = 0; y < ph; y++) {
        const cur = grid[x][y].biomeId;
        const rep = proposed[x][y];
        if (cur === rep) continue;

        const curBiome = biomeById.get(cur);
        const repBiome = biomeById.get(rep);
        if (!curBiome || !repBiome) {
          grid[x][y].biomeId = rep;
          continue;
        }

        const cell = grid[x][y];
        const distTo = (b: Biome) => {
          const dd = Math.max(
            0,
            b.drainageRange[0] - cell.drainage,
            cell.drainage - b.drainageRange[1],
          );
          const da = Math.max(
            0,
            b.altitudeRange[0] - cell.altitude,
            cell.altitude - b.altitudeRange[1],
          );
          return dd + da;
        };

        const clusterSize = measureCluster(grid, x, y, cur, pw, ph);
        if (clusterSize >= CLUSTER_SURVIVAL_MIN) continue;

        if (distTo(curBiome) < distTo(repBiome)) continue;

        grid[x][y].biomeId = rep;
      }
    }
  }
}

function measureCluster(
  grid: PatchCell[][],
  startX: number,
  startY: number,
  targetId: number,
  pw: number,
  ph: number,
): number {
  const visited = new Set<number>();
  const stack: Array<[number, number]> = [[startX, startY]];

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    const k = tileKey(cx, cy, pw);
    if (visited.has(k)) continue;
    visited.add(k);
    if (visited.size >= CLUSTER_SURVIVAL_MIN) return visited.size;
    for (const [dx, dy] of VON4) {
      const nx = cx + dx,
        ny = cy + dy;
      if (
        nx >= 0 &&
        nx < pw &&
        ny >= 0 &&
        ny < ph &&
        grid[nx][ny].biomeId === targetId
      ) {
        stack.push([nx, ny]);
      }
    }
  }

  return visited.size;
}
