// Stage 2 — Tree suitability [tile scale] (presentational)
//
// Computes tile.treeSuitability ∈ [0, 1]: the base probability weight for
// tree and large-vegetation spawning. This is NOT tree placement — it is a
// static environmental layer that the tree-spawn system consumes.
//
// Causes modelled:
//   1. Soil & moisture variance — low-frequency Simplex noise captures sub-biome
//      patchiness (rocky outcrops, clay pockets) not represented by fertility alone.
//   2. Topography — slope magnitude suppresses rooting; north-facing slopes
//      receive a mild moisture-retention bonus (extension point: configurable axis).
//   3. Hydrology — BFS distance from water tiles produces a soft ecotone falloff
//      rather than a hard cutoff at the riparian boundary.
//
// Causes NOT modelled here:
//   - Canopy competition / self-thinning: dynamic, depends on tree ages/positions.
//     Spawn system should apply: minDist_eff = baseMinDist × maturityFactor(tree).
//     [extension point]
//   - Stochastic seed dispersal: emergent from local-parent spawn mechanic; no
//     static layer needed. [no layer needed]

import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "../tileGenerator/types";
import { clamp, lerp, makeNoise2D, VON4 } from "../tileGenerator/utils";

// Low frequency → large coherent patches (~20 tiles per cycle).
const SOIL_NOISE_SCALE = 0.05;
// Even the least-viable patch retains this fraction of full fertility.
const SOIL_VIABILITY_MIN = 0.3;

// Gradient magnitude at which tree growth is fully suppressed (no root anchorage).
const SLOPE_KILL_THRESHOLD = 0.25;
// Max suitability bonus/malus from aspect. North-facing = wetter; south-facing = drier.
const ASPECT_STRENGTH = 0.12;

// Tiles from water edge that are fully suppressed (root saturation zone).
const HYDRO_INNER_BUFFER = 1;
// Tiles of ecotone gradient beyond the inner buffer.
const HYDRO_ECOTONE_WIDTH = 4;

export function stage2_treeSuitability(
  tiles: Tile[][],
  config: PipelineConfig,
): void {
  const { width, height, seed } = config;
  const soilNoise = makeNoise2D(seed + "_soil_suit");
  const waterDist = computeWaterDist(tiles, width, height);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = tiles[x][y];

      if (tile.water) {
        tile.treeSuitability = 0;
        continue;
      }

      // --- Cause 1: Soil & moisture variance ---
      const rawNoise = soilNoise(x * SOIL_NOISE_SCALE, y * SOIL_NOISE_SCALE); // [-1, 1]
      const soilViability = lerp(SOIL_VIABILITY_MIN, 1.0, (rawNoise + 1) * 0.5);
      // fertility already encodes rock type + climate + moisture at the macro scale;
      // soilViability adds within-biome patchiness on top.
      const soilFactor = tile.fertility * soilViability;

      // --- Cause 2: Topography — slope magnitude + aspect ---
      const alt = (tx: number, ty: number) =>
        tiles[clamp(tx, 0, width - 1)][clamp(ty, 0, height - 1)].altitude;
      const gx = alt(x + 1, y) - alt(x - 1, y);
      const gy = alt(x, y + 1) - alt(x, y - 1);
      const slopeMag = Math.sqrt(gx * gx + gy * gy);

      // Quadratic: gentle slopes tolerated, steeper slopes drop off quickly.
      const slopePenalty = clamp(slopeMag / SLOPE_KILL_THRESHOLD, 0, 1);
      let topographyFactor = 1 - slopePenalty * slopePenalty;

      // Aspect modifier — only meaningful when there is appreciable slope.
      // northFacing ∈ [-1, 1]: +1 = fully north-facing (gy < 0), −1 = south-facing.
      if (slopeMag > 0.02) {
        const northFacing = -gy / slopeMag;
        // Scale by slope so flat terrain has no aspect effect.
        topographyFactor += northFacing * ASPECT_STRENGTH * clamp(slopeMag / 0.1, 0, 1);
        topographyFactor = clamp(topographyFactor, 0, 1);
      }

      // --- Cause 3: Hydrology — ecotone falloff near water ---
      const d = waterDist[x][y];
      const hydrologyFactor =
        d <= HYDRO_INNER_BUFFER
          ? 0
          : clamp((d - HYDRO_INNER_BUFFER) / HYDRO_ECOTONE_WIDTH, 0, 1);

      tile.treeSuitability = clamp(soilFactor * topographyFactor * hydrologyFactor, 0, 1);
    }
  }
}

// BFS over 4-connected grid from all water tiles; returns per-tile Manhattan-ish
// distance to nearest water (Infinity where no water exists on the map).
function computeWaterDist(tiles: Tile[][], width: number, height: number): number[][] {
  const dist: number[][] = Array.from({ length: width }, () =>
    new Array(height).fill(Infinity),
  );
  const queue: Array<[number, number]> = [];

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (tiles[x][y].water) {
        dist[x][y] = 0;
        queue.push([x, y]);
      }
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const [cx, cy] = queue[qi++];
    const nd = dist[cx][cy] + 1;
    for (const [dx, dy] of VON4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (dist[nx][ny] === Infinity) {
        dist[nx][ny] = nd;
        queue.push([nx, ny]);
      }
    }
  }

  return dist;
}
