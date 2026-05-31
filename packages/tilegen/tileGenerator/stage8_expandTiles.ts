// Stage 8 — Tile-level modifier pass [tile scale]
// Spec: BIOME_LOCAL_PIPELINE.md
//
// Expands the patch grid to full tile resolution. Each tile inherits its biome
// from the parent patch. Elevation, drainage, and light are recomputed from
// terrain geometry. Temperature and precipitation are sampled from the biome's
// paramDist distributions (N(mean,stddev), clamped to biome range), grounding
// tile parameters in biome character rather than raw noise.
// effectiveMoisture = precipitation × (1 − drainage) is derived last.

import { createRand } from "../rand";
import type { Tile } from "../tileMap/tile";
import type { Biome } from "../tileMap/Biome";
import type { PatchCell, PipelineConfig } from "./types";
import { clamp, computeDrainage, computeLight, makeNoise2D, sampleNormal } from "./utils";
import { getRockType } from "../tileMap/rockTypes";

export function stage8_expandTiles(
  grid: PatchCell[][],
  config: PipelineConfig,
): Tile[][] {
  const { width, height, tilesPerPatch, seed, localNoiseScale } = config;
  const pw = grid.length;
  const ph = grid[0].length;

  const fineAlt = makeNoise2D(seed + "_falt");
  const tileScale = localNoiseScale * tilesPerPatch;

  const biomeById = new Map<number, Biome>(config.biomes.map(b => [b.id, b]));

  // Continentality: temperature std-dev across all patches, normalized.
  let tempSum = 0, tempSumSq = 0, patchCount = 0;
  for (const col of grid) {
    for (const cell of col) {
      tempSum += cell.temperature;
      tempSumSq += cell.temperature * cell.temperature;
      patchCount++;
    }
  }
  const tempMean = tempSum / patchCount;
  const tempVariance = tempSumSq / patchCount - tempMean * tempMean;
  const continentality = clamp(Math.sqrt(tempVariance) / 20, 0, 1);

  const tileAltitude = (tx: number, ty: number): number => {
    const px = clamp(Math.floor(tx / tilesPerPatch), 0, pw - 1);
    const py = clamp(Math.floor(ty / tilesPerPatch), 0, ph - 1);
    return clamp(
      grid[px][py].altitude + fineAlt(tx * tileScale, ty * tileScale) * 0.05,
      0, 1,
    );
  };

  const tiles: Tile[][] = [];

  for (let tx = 0; tx < width; tx++) {
    tiles[tx] = [];
    for (let ty = 0; ty < height; ty++) {
      const px = clamp(Math.floor(tx / tilesPerPatch), 0, pw - 1);
      const py = clamp(Math.floor(ty / tilesPerPatch), 0, ph - 1);
      const patch = grid[px][py];

      const altitude = tileAltitude(tx, ty);

      const gx = tileAltitude(tx + 1, ty) - tileAltitude(tx - 1, ty);
      const gy = tileAltitude(tx, ty + 1) - tileAltitude(tx, ty - 1);

      const { permeability } = getRockType(patch.rockType);
      const drainage = computeDrainage(gx, gy, permeability);
      const light = computeLight(gy);

      const biome = biomeById.get(patch.biomeId);
      let temperature: number;
      let precipitation: number;

      if (biome) {
        const r = createRand(`${seed}_pd_${tx}_${ty}`);
        temperature = clamp(
          sampleNormal(biome.paramDist.temperature.mean, biome.paramDist.temperature.stddev, r.next(), r.next()),
          biome.temperatureRange[0], biome.temperatureRange[1],
        );
        precipitation = clamp(
          sampleNormal(biome.paramDist.precipitation.mean, biome.paramDist.precipitation.stddev, r.next(), r.next()),
          biome.precipitationRange[0], biome.precipitationRange[1],
        );
      } else {
        temperature = patch.temperature;
        precipitation = patch.precipitation;
      }

      const effectiveMoisture = precipitation * (1 - drainage);

      tiles[tx][ty] = {
        index: { x: tx, y: ty },
        biomeId: patch.biomeId,
        altitude,
        temperature,
        precipitation,
        drainage,
        light,
        seasonality: config.segmentBase.seasonality,
        effectiveMoisture,
        continentality,
        rockType: patch.rockType,
        fertility: 0,
        ore: undefined,
        water: false,
        waterType: undefined,
        surfaceType: undefined,
        riparian: false,
      };
    }
  }

  return tiles;
}
