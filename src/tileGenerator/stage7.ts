import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";
import type { Tile } from "../tileMap/tile";
import type { PatchCell, PipelineConfig } from "./types";
import { clamp } from "./utils";

export function stage7_expandTiles(
  grid: PatchCell[][],
  config: PipelineConfig,
): Tile[][] {
  const { width, height, tilesPerPatch, seed, localNoiseScale } = config;
  const pw = grid.length;
  const ph = grid[0].length;

  const makeNoise = (s: string) => createNoise2D(createRand(s).next);
  const fineAlt = makeNoise(seed + "_falt");
  const finePrc = makeNoise(seed + "_fprc");
  const tileScale = localNoiseScale * tilesPerPatch;

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

      // Drainage from tile-level gradient.
      const gx = tileAltitude(tx + 1, ty) - tileAltitude(tx - 1, ty);
      const gy = tileAltitude(tx, ty + 1) - tileAltitude(tx, ty - 1);
      const drainage = clamp(Math.sqrt(gx * gx + gy * gy) / 0.3, 0, 1);

      // Light from tile slope aspect (south-facing → more light).
      const light = clamp(0.5 + gy * 1.5, 0.1, 1.0);

      const precipitation = clamp(
        patch.precipitation + finePrc(tx * tileScale, ty * tileScale) * 0.03,
        0, 1,
      );

      const effectiveMoisture = precipitation * (1 - drainage);

      tiles[tx][ty] = {
        index: { x: tx, y: ty },
        biomeId: patch.biomeId,
        altitude,
        temperature: patch.temperature,
        precipitation,
        drainage,
        light,
        seasonality: config.segmentBase.seasonality,
        effectiveMoisture,
        continentality,
        water: false,
        waterType: undefined,
      };
    }
  }

  return tiles;
}
