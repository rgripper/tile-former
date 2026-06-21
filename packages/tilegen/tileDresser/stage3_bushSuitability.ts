// Stage 3 — Bush suitability [tile scale] (presentational)
//
// Computes tile.bushSuitability ∈ [0, 1]: base probability weight for
// bush/shrub spawning. Models the same three environmental causes as
// stage2_treeSuitability but with different tolerances and an inverted
// hydrology relationship — riparian zones are peak shrub habitat, not a
// suppression zone.
//
// Causes modelled:
//   1. Soil & moisture variance — same low-freq noise approach as trees, but
//      looser: fertility has a floor so even thin/poor soil supports shrubs.
//   2. Topography — steeper slopes tolerated (shallower root systems).
//   3. Hydrology — inverted near water: peaks in the riparian ecotone, falls off
//      to a non-zero baseline far from water (bushes grow everywhere), zero only
//      on standing water tiles.
//
// Cause NOT modelled here:
//   - Canopy suppression: dense tree cover shades out understory shrubs. Apply
//     at spawn time: bushSuitability_eff = bushSuitability × (1 − canopyDensity).
//     [extension point — mirrors canopy competition note in stage 2]
//
// Combination: as in stage 2, the three factors are multiplied (independence
// assumed). Consequence: waterlogged tiles (hydrologyFactor = 0) are always 0
// regardless of soil quality.
//
// Coordinate convention: y increases southward (screen coords). "North" means
// decreasing y, so gy < 0 indicates a north-facing slope. Same convention as
// stage 2 — see that file for full rationale.

import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "../tileGenerator/types";
import { clamp, lerp, makeNoise2D, VON4 } from "../tileGenerator/utils";

// Same spatial scale as stage 2 (20-tile coherence patches). Different seed suffix
// (_soil_bush vs _soil_suit) decorrelates bush and tree soil patches — a tile with
// poor tree soil might still have good shrub soil (e.g. rocky scrub).
const SOIL_NOISE_SCALE = 0.05;
// Higher floor than trees (0.5 vs 0.3): shrubs root in thinner, drier, or more
// compacted soil than trees can tolerate. The noise still modulates viability;
// it just never drops below 50% of the fertility-adjusted value.
const SOIL_VIABILITY_MIN = 0.5;
// Unlike trees (where fertility = 0 gates the tile to 0), bushes have a fertility
// floor: fertilityFactor = lerp(FERTILITY_FLOOR, 1, fertility), so infertile ground
// still yields FERTILITY_FLOOR × soilViability > 0. This encodes the observation
// that shrubs colonise bare rock, sand, and degraded ground that trees cannot.
const FERTILITY_FLOOR = 0.4;

// Trees fail above gradient ≈ 0.25; bushes tolerate up to ≈ 0.4. Both thresholds
// are measured against the same 2-tile central-difference span (see stage 2).
// At 0.4, a 1-unit altitude rise occurs over ~2.5 tiles — a steep but not vertical
// face where shrubs can still root in crevices.
const SLOPE_KILL_THRESHOLD = 0.4;
// Weaker aspect bias than trees (0.08 vs 0.12): bushes are more drought-tolerant so
// the north/south moisture asymmetry matters less. Same gating and scale-up logic
// as stage 2 (see ASPECT_STRENGTH comment there).
const ASPECT_STRENGTH = 0.08;

// Hydrology profile shape — see riparianHydroFactor() below for the full curve.
const HYDRO_EDGE_FACTOR = 0.55;  // factor at dist=1: partial saturation, still viable
                                  // for willows/alders that tolerate waterlogged soil
const HYDRO_PEAK_DIST = 3;       // distance (tiles) at which the riparian peak is reached.
                                  // tile.riparian covers dist 1–2 (stage 9 BFS); the peak
                                  // at dist 3 sits just beyond that flag's boundary,
                                  // capturing the outer ecotone where shrub density is
                                  // highest in practice.
const HYDRO_RIPARIAN_PEAK = 1.0;
const HYDRO_DECAY_DIST = 8;      // distance at which the factor settles at FAR_BASELINE
const HYDRO_FAR_BASELINE = 0.75; // bushes are moisture-limited even far from water, so
                                  // the peak is in the ecotone, not open ground. 0.75
                                  // (vs 1.0 for trees) reflects this preference. When no
                                  // water exists on the map, all distances are Infinity
                                  // and this baseline applies everywhere.

export function stage3_bushSuitability(
  tiles: Tile[][],
  config: PipelineConfig,
): void {
  const { width, height, seed } = config;
  const soilNoise = makeNoise2D(seed + "_soil_bush");
  const waterDist = computeWaterDist(tiles, width, height);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = tiles[x][y];

      if (tile.water) {
        tile.bushSuitability = 0;
        continue;
      }

      // --- Cause 1: Soil & moisture variance ---
      const rawNoise = soilNoise(x * SOIL_NOISE_SCALE, y * SOIL_NOISE_SCALE); // [-1, 1]
      const soilViability = lerp(SOIL_VIABILITY_MIN, 1.0, (rawNoise + 1) * 0.5);
      // Fertility floor prevents infertile ground from zeroing out bush suitability,
      // unlike the tree formula (fertility × soilViability) which gates hard at 0.
      const fertilityFactor = lerp(FERTILITY_FLOOR, 1.0, tile.fertility);
      const soilFactor = fertilityFactor * soilViability;

      // --- Cause 2: Topography — slope magnitude + aspect ---
      // Central difference over 2-tile span; threshold calibrated to the same span.
      const alt = (tx: number, ty: number) =>
        tiles[clamp(tx, 0, width - 1)][clamp(ty, 0, height - 1)].altitude;
      const gx = alt(x + 1, y) - alt(x - 1, y);
      const gy = alt(x, y + 1) - alt(x, y - 1);
      const slopeMag = Math.sqrt(gx * gx + gy * gy);

      // Quadratic penalty — same shape as trees; only the kill threshold differs.
      const slopePenalty = clamp(slopeMag / SLOPE_KILL_THRESHOLD, 0, 1);
      let topographyFactor = 1 - slopePenalty * slopePenalty;

      // Aspect gate and scale-up are identical to stage 2 (slopeMag > 0.02,
      // full strength at slopeMag ≥ 0.1). Only ASPECT_STRENGTH differs.
      if (slopeMag > 0.02) {
        const northFacing = -gy / slopeMag; // +1 = north-facing (gy < 0)
        topographyFactor += northFacing * ASPECT_STRENGTH * clamp(slopeMag / 0.1, 0, 1);
        topographyFactor = clamp(topographyFactor, 0, 1);
      }

      // --- Cause 3: Hydrology — riparian peak, non-zero far-field baseline ---
      const d = waterDist[x][y];
      const hydrologyFactor = riparianHydroFactor(d);

      tile.bushSuitability = clamp(soilFactor * topographyFactor * hydrologyFactor, 0, 1);
    }
  }
}

// Inverted-V profile: zero at water → ramp to riparian peak → decay to far baseline.
//
//  factor
//   1.0 |          *****
//  0.75 |   *            *************
//  0.55 |  *
//   0.0 | *
//       +--+--+--+--+--+--+--+--+--→ dist (tiles)
//          1  2  3  4  5  6  7  8
//
// The ramp from d=1 to d=HYDRO_PEAK_DIST uses HYDRO_EDGE_FACTOR as the d=1 anchor
// rather than 0, because dist=1 tiles are adjacent to water on land — still viable
// habitat for riparian shrubs (willows, alders) that tolerate saturated soil.
function riparianHydroFactor(d: number): number {
  if (d === 0) return 0;
  if (d === Infinity) return HYDRO_FAR_BASELINE;
  if (d < HYDRO_PEAK_DIST) {
    return lerp(HYDRO_EDGE_FACTOR, HYDRO_RIPARIAN_PEAK, (d - 1) / (HYDRO_PEAK_DIST - 1));
  }
  if (d < HYDRO_DECAY_DIST) {
    return lerp(
      HYDRO_RIPARIAN_PEAK,
      HYDRO_FAR_BASELINE,
      (d - HYDRO_PEAK_DIST) / (HYDRO_DECAY_DIST - HYDRO_PEAK_DIST),
    );
  }
  return HYDRO_FAR_BASELINE;
}

// 4-connected BFS from water tiles — same connectivity as stage 9 riparian BFS.
// Returns Infinity for all tiles when no water exists on the map.
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
