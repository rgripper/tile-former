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
//      receive a mild moisture-retention bonus.
//   3. Hydrology — BFS distance from water tiles produces a soft ecotone falloff
//      rather than a hard cutoff at the riparian boundary.
//
// Causes NOT modelled here:
//   - Canopy competition / self-thinning: dynamic, depends on tree ages/positions.
//     Spawn system should apply: minDist_eff = baseMinDist × maturityFactor(tree).
//     [extension point]
//   - Stochastic seed dispersal: emergent from local-parent spawn mechanic; no
//     static layer needed. [no layer needed]
//
// Combination: the three factors are multiplied. This assumes independence between
// causes — in reality fertile soil and gentle slopes co-occur, but the approximation
// is acceptable at tile resolution. The key consequence is that any factor at zero
// kills suitability entirely: a completely waterlogged tile has treeSuitability = 0
// regardless of how fertile the soil is.
//
// Coordinate convention: y increases southward (screen coords). "North" therefore
// means decreasing y, so gy < 0 indicates a north-facing slope (faces −y). All
// aspect calculations follow this convention.

import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "../tileGenerator/types";
import { clamp, lerp, makeNoise2D, VON4 } from "../tileGenerator/utils";

// At scale 0.025, one Simplex period spans 1/0.025 = 40 tiles — produces large
// patches of dense-forest vs open-land character, independent of soil and terrain.
// Intentionally much coarser than SOIL_NOISE_SCALE so the two signals don't alias.
const FOREST_DENSITY_SCALE = 0.025;

// At scale 0.05, one Simplex period spans 1/0.05 = 20 tiles — large enough to
// produce distinct patches of poor/rich soil within a biome rather than per-tile noise.
const SOIL_NOISE_SCALE = 0.05;
// Even the worst patch retains 30% of fertility as tree-viable soil — barren ground
// is suppressed but not impossible. Calibrated so the noise acts as a ×0.3–1.0
// modulator on fertility rather than a hard gate.
const SOIL_VIABILITY_MIN = 0.3;
// Trees are gated hard by fertility: soilFactor = fertility × soilViability, so
// fertility = 0 (e.g. permafrost, pure bare rock) yields soilFactor = 0 regardless
// of the noise value. This is intentional — the fertility pipeline already encodes
// whether the ground can sustain plant life at all.

// Gradient magnitude (altitude difference over a 2-tile central-difference span)
// at which tree growth is fully suppressed. At 0.25, a 1-unit altitude rise occurs
// over 4 tiles — approximately the steepness of a cliff face in the heightmap.
// Calibrated to match the 0.3 normaliser used by computeDrainage in stage 4.
const SLOPE_KILL_THRESHOLD = 0.25;
// Max suitability bonus/malus from aspect. Kept small (±0.12) so aspect is a
// modifier, not a dominant signal — a south-facing fertile slope should still support
// trees; aspect only tips the balance at the margins.
const ASPECT_STRENGTH = 0.12;

// 1 tile of full suppression at the water's edge (roots would be permanently
// waterlogged). Beyond this, suitability ramps up over HYDRO_ECOTONE_WIDTH tiles.
// When no water exists on the map, all distances are Infinity, so (Infinity - 1)/4
// clamps to 1 — trees get full suitability everywhere.
const HYDRO_INNER_BUFFER = 1;
const HYDRO_ECOTONE_WIDTH = 4;

export function stage2_treeSuitability(
  tiles: Tile[][],
  config: PipelineConfig,
): void {
  const { width, height, seed } = config;
  // Distinct seed suffix (_soil_suit) keeps this layer decorrelated from the
  // altitude fine-noise (_falt), riparian (_riparian), and bush soil (_soil_bush)
  // layers — overlapping seeds would produce spurious spatial correlations.
  const soilNoise = makeNoise2D(seed + "_soil_suit");
  const forestNoise = makeNoise2D(seed + "_forest_density");
  const waterDist = computeWaterDist(tiles, width, height);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = tiles[x][y];

      if (tile.water) {
        tile.forestDensity = 0;
        tile.treeSuitability = 0;
        continue;
      }

      // --- Cause 1: Soil & moisture variance ---
      const rawNoise = soilNoise(x * SOIL_NOISE_SCALE, y * SOIL_NOISE_SCALE); // [-1, 1]
      const soilViability = lerp(SOIL_VIABILITY_MIN, 1.0, (rawNoise + 1) * 0.5);
      // fertility encodes rock type + climate + moisture at the macro scale (set by
      // stage 10); soilViability multiplies on top to add within-biome patchiness.
      // fertility = 0 gates the tile completely — see SOIL_VIABILITY_MIN note above.
      const soilFactor = tile.fertility * soilViability;

      // --- Cause 2: Topography — slope magnitude + aspect ---
      // Central difference over a 2-tile span: gx/gy are altitude differences, not
      // per-tile gradients. SLOPE_KILL_THRESHOLD is calibrated against this same span.
      const alt = (tx: number, ty: number) =>
        tiles[clamp(tx, 0, width - 1)][clamp(ty, 0, height - 1)].altitude;
      const gx = alt(x + 1, y) - alt(x - 1, y);
      const gy = alt(x, y + 1) - alt(x, y - 1);
      const slopeMag = Math.sqrt(gx * gx + gy * gy);

      // Quadratic penalty: gentle slopes (< half threshold) lose little suitability;
      // the curve steepens near the kill threshold so the suppression is not abrupt.
      const slopePenalty = clamp(slopeMag / SLOPE_KILL_THRESHOLD, 0, 1);
      let topographyFactor = 1 - slopePenalty * slopePenalty;

      // Aspect is only meaningful when slope is appreciable — below slopeMag ≈ 0.02
      // the gradient direction is dominated by heightmap quantisation noise.
      // The secondary scale clamp(slopeMag / 0.1, 0, 1) ramps the effect up so
      // aspect reaches full ASPECT_STRENGTH only once slope ≥ 0.1 (well-defined hill).
      if (slopeMag > 0.02) {
        // northFacing ∈ [-1, 1]: +1 = slope faces north (gy < 0), −1 = south-facing.
        // North-facing slopes receive less solar radiation → retain moisture longer.
        const northFacing = -gy / slopeMag;
        topographyFactor += northFacing * ASPECT_STRENGTH * clamp(slopeMag / 0.1, 0, 1);
        topographyFactor = clamp(topographyFactor, 0, 1);
      }

      // --- Cause 3: Hydrology — ecotone falloff near water ---
      // d = Infinity when no water exists → clamp resolves to 1 (full suitability).
      const d = waterDist[x][y];
      const hydrologyFactor =
        d <= HYDRO_INNER_BUFFER
          ? 0
          : clamp((d - HYDRO_INNER_BUFFER) / HYDRO_ECOTONE_WIDTH, 0, 1);

      tile.forestDensity = (forestNoise(x * FOREST_DENSITY_SCALE, y * FOREST_DENSITY_SCALE) + 1) * 0.5;
      tile.treeSuitability = clamp(soilFactor * topographyFactor * hydrologyFactor, 0, 1);
    }
  }
}

// BFS over 4-connected grid from all water tiles; returns per-tile hop-count
// distance to nearest water (Infinity where no water exists on the map).
// 4-connected (not 8) matches the riparian BFS convention in stage 9.
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
