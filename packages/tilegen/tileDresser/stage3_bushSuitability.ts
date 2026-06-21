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
//   3. Hydrology — inverted near water: peaks in the riparian ecotone (dist 2–3),
//      falls off to a non-zero baseline far from water (bushes grow everywhere),
//      zero only on standing water tiles themselves.
//
// Cause NOT modelled here:
//   - Canopy suppression: dense tree cover shades out understory shrubs. Apply
//     at spawn time: bushSuitability_eff = bushSuitability × (1 − canopyDensity).
//     [extension point — mirrors canopy competition note in stage 2]

import type { Tile } from "../tile/tile";
import type { PipelineConfig } from "../tileGenerator/types";
import { clamp, lerp, makeNoise2D, VON4 } from "../tileGenerator/utils";

const SOIL_NOISE_SCALE = 0.05;
// Bushes root in thinner soil — even infertile tiles retain a floor of viability.
const SOIL_VIABILITY_MIN = 0.5;
// Fertility influence is partial: low-fertility ground is still usable for shrubs.
const FERTILITY_FLOOR = 0.4;

// Slope tolerance is higher than trees (shallower roots, lower centre of gravity).
const SLOPE_KILL_THRESHOLD = 0.4;
// Mild aspect bias — same directional logic as trees, slightly weaker.
const ASPECT_STRENGTH = 0.08;

// Hydrology shape: ramp from 0 at water → peak at HYDRO_PEAK_DIST →
// decay to FAR_BASELINE beyond HYDRO_DECAY_DIST.
const HYDRO_EDGE_FACTOR = 0.55;   // factor at dist=1 (immediate water-adjacent land)
const HYDRO_PEAK_DIST = 3;        // distance at which riparian peak is reached
const HYDRO_RIPARIAN_PEAK = 1.0;
const HYDRO_DECAY_DIST = 8;       // distance at which far-baseline is reached
const HYDRO_FAR_BASELINE = 0.75;  // baseline far from water (bushes grow everywhere)

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
      // Fertility has a floor: even on poor soil, a fraction of viability survives.
      const fertilityFactor = lerp(FERTILITY_FLOOR, 1.0, tile.fertility);
      const soilFactor = fertilityFactor * soilViability;

      // --- Cause 2: Topography — slope magnitude + aspect ---
      const alt = (tx: number, ty: number) =>
        tiles[clamp(tx, 0, width - 1)][clamp(ty, 0, height - 1)].altitude;
      const gx = alt(x + 1, y) - alt(x - 1, y);
      const gy = alt(x, y + 1) - alt(x, y - 1);
      const slopeMag = Math.sqrt(gx * gx + gy * gy);

      const slopePenalty = clamp(slopeMag / SLOPE_KILL_THRESHOLD, 0, 1);
      let topographyFactor = 1 - slopePenalty * slopePenalty;

      if (slopeMag > 0.02) {
        const northFacing = -gy / slopeMag;
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

// Inverted-V hydrology profile peaking in the riparian ecotone.
// d=0 (water): 0
// d=1: HYDRO_EDGE_FACTOR (partial saturation, still viable for riparian shrubs)
// d=HYDRO_PEAK_DIST: HYDRO_RIPARIAN_PEAK
// d=HYDRO_DECAY_DIST+: HYDRO_FAR_BASELINE
// Infinity (no water on map): HYDRO_FAR_BASELINE
function riparianHydroFactor(d: number): number {
  if (d === 0) return 0;
  if (d === Infinity) return HYDRO_FAR_BASELINE;
  if (d < HYDRO_PEAK_DIST) {
    // Ramp from EDGE_FACTOR at d=1 to RIPARIAN_PEAK at d=HYDRO_PEAK_DIST.
    return lerp(HYDRO_EDGE_FACTOR, HYDRO_RIPARIAN_PEAK, (d - 1) / (HYDRO_PEAK_DIST - 1));
  }
  if (d < HYDRO_DECAY_DIST) {
    // Decay from peak to far-baseline.
    return lerp(
      HYDRO_RIPARIAN_PEAK,
      HYDRO_FAR_BASELINE,
      (d - HYDRO_PEAK_DIST) / (HYDRO_DECAY_DIST - HYDRO_PEAK_DIST),
    );
  }
  return HYDRO_FAR_BASELINE;
}

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
