import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";
import type { Biome } from "../tileMap/Biome";
import type { Tile } from "../tileMap/tile";
import { biomes as defaultBiomes } from "../tileMap/biomes";
import {
  biomeCascade,
  ALTITUDE_MONTANE_THRESHOLD,
  TEMP_ZONE_ADJACENCY,
  type TemperatureZoneLabel,
} from "../tileMap/biomeVariants";

// ─── Water feature constants ──────────────────────────────────────────────────

const POND_DEPTH_TOLERANCE = 0.03;
const POND_MIN_AREA = 4;
const POND_MAX_AREA = 50;
const POND_MIN_SEPARATION = 10;
const RIVER_GRADIENT_THRESHOLD = 0.08;
const RIVER_MAX_PATCHES = 40;

// ─── Types ────────────────────────────────────────────────────────────────────

export type SegmentBase = {
  altitude: number;       // [0, 1]
  temperature: number;    // °C
  precipitation: number;  // [0, 1]
  light: number;          // [0, 1]
};

export type SegmentNeighbors = {
  north?: SegmentBase;
  south?: SegmentBase;
  east?: SegmentBase;
  west?: SegmentBase;
};

// Patch-scale cell (~50 m × 50 m, covers tilesPerPatch × tilesPerPatch tiles).
type PatchCell = {
  index: { x: number; y: number };
  altitude: number;
  temperature: number;
  precipitation: number;
  drainage: number;
  light: number;
  biomeId: number; // biome.id (1-based), set in Stage 5
};

export type PipelineConfig = {
  width: number;          // tile grid width
  height: number;         // tile grid height
  tilesPerPatch: number;  // tiles per patch side (patch grid = ceil(w/t) × ceil(h/t))
  seed: string;
  segmentBase: SegmentBase;
  neighbors?: SegmentNeighbors;
  localNoiseScale: number;
  borderBlendWidth: number; // blend band width in patches
  biomes: Biome[];
};

export const defaultSegmentBase: SegmentBase = {
  altitude: 0.15,
  temperature: 12,
  precipitation: 0.45,
  light: 0.55,
};

export const defaultPipelineConfig: PipelineConfig = {
  width: 64,
  height: 64,
  tilesPerPatch: 4,
  seed: "pipeline1",
  segmentBase: defaultSegmentBase,
  localNoiseScale: 0.15,
  borderBlendWidth: 3,
  biomes: defaultBiomes,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Cascade lookup ───────────────────────────────────────────────────────────

function selectBiomeId(
  altitude: number,
  temperature: number,
  precipitation: number,
  drainage: number,
): number {
  const branch =
    altitude > ALTITUDE_MONTANE_THRESHOLD
      ? biomeCascade.montane
      : biomeCascade.lowland;

  let tempNode = branch[0];
  for (const node of branch) {
    if (temperature >= node.tempLowerBound) tempNode = node;
    else break;
  }

  let moistNode = tempNode.moisture[0];
  for (const node of tempNode.moisture) {
    if (precipitation >= node.precipLowerBound) moistNode = node;
    else break;
  }

  let slot = moistNode.slots[0];
  for (const s of moistNode.slots) {
    if (drainage >= s.drainageLowerBound) slot = s;
    else break;
  }

  return slot.biomeId;
}

function getTemperatureZone(temp: number): TemperatureZoneLabel {
  if (temp >= 35) return "hot";
  if (temp >= 18) return "warm";
  if (temp >= 5) return "temperate";
  if (temp >= -5) return "cold";
  return "arctic";
}

// ─── Stage 1 — Base anchoring ─────────────────────────────────────────────────

function stage1_initGrid(config: PipelineConfig): PatchCell[][] {
  const { width, height, tilesPerPatch, segmentBase } = config;
  const pw = Math.ceil(width / tilesPerPatch);
  const ph = Math.ceil(height / tilesPerPatch);

  const grid: PatchCell[][] = [];
  for (let x = 0; x < pw; x++) {
    grid[x] = [];
    for (let y = 0; y < ph; y++) {
      grid[x][y] = {
        index: { x, y },
        altitude: segmentBase.altitude,
        temperature: segmentBase.temperature,
        precipitation: segmentBase.precipitation,
        drainage: 0.5,
        light: segmentBase.light,
        biomeId: 0,
      };
    }
  }
  return grid;
}

// ─── Stage 2 — Local noise axes ──────────────────────────────────────────────

function stage2_noiseAxes(grid: PatchCell[][], config: PipelineConfig): void {
  const { seed, localNoiseScale: scale, segmentBase } = config;
  const makeNoise = (s: string) => createNoise2D(createRand(s).next);

  const altNoise = makeNoise(seed + "_alt");
  const tmpNoise = makeNoise(seed + "_tmp");
  const prcNoise = makeNoise(seed + "_prc");

  for (const col of grid) {
    for (const cell of col) {
      const { x, y } = cell.index;

      cell.altitude = clamp(
        segmentBase.altitude + altNoise(x * scale, y * scale) * 0.15,
        0,
        1,
      );

      // Temperature: base + local variation ± 3°C − altitude lapse rate.
      // Lapse rate: ~6°C per 1000 m elevation ≈ 30°C per unit altitude.
      const altLapse = (cell.altitude - segmentBase.altitude) * 30;
      cell.temperature =
        segmentBase.temperature +
        tmpNoise(x * scale, y * scale) * 3 -
        altLapse;

      cell.precipitation = clamp(
        segmentBase.precipitation + prcNoise(x * scale, y * scale) * 0.08,
        0,
        1,
      );
    }
  }
}

// ─── Stage 3 — Gradient axes ──────────────────────────────────────────────────

function stage3_gradientAxes(grid: PatchCell[][]): void {
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

// ─── Stage 4 — Segment border blending ───────────────────────────────────────

function stage4_blendBorders(
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  const { neighbors, borderBlendWidth, segmentBase } = config;
  if (!neighbors) return;

  const pw = grid.length;
  const ph = grid[0].length;
  const myZone = getTemperatureZone(segmentBase.temperature);

  type BorderEntry = {
    base: SegmentBase;
    inBand: (x: number, y: number) => boolean;
    distFromEdge: (x: number, y: number) => number;
  };

  const borders: BorderEntry[] = [];

  if (neighbors.north) {
    const nZone = getTemperatureZone(neighbors.north.temperature);
    if (TEMP_ZONE_ADJACENCY[myZone].includes(nZone))
      borders.push({
        base: neighbors.north,
        inBand: (_x, y) => y < borderBlendWidth,
        distFromEdge: (_x, y) => y,
      });
  }
  if (neighbors.south) {
    const nZone = getTemperatureZone(neighbors.south.temperature);
    if (TEMP_ZONE_ADJACENCY[myZone].includes(nZone))
      borders.push({
        base: neighbors.south,
        inBand: (_x, y) => y >= ph - borderBlendWidth,
        distFromEdge: (_x, y) => ph - 1 - y,
      });
  }
  if (neighbors.east) {
    const nZone = getTemperatureZone(neighbors.east.temperature);
    if (TEMP_ZONE_ADJACENCY[myZone].includes(nZone))
      borders.push({
        base: neighbors.east,
        inBand: (x, _y) => x >= pw - borderBlendWidth,
        distFromEdge: (x, _y) => pw - 1 - x,
      });
  }
  if (neighbors.west) {
    const nZone = getTemperatureZone(neighbors.west.temperature);
    if (TEMP_ZONE_ADJACENCY[myZone].includes(nZone))
      borders.push({
        base: neighbors.west,
        inBand: (x, _y) => x < borderBlendWidth,
        distFromEdge: (x, _y) => x,
      });
  }

  if (borders.length === 0) return;

  for (let x = 0; x < pw; x++) {
    for (let y = 0; y < ph; y++) {
      for (const b of borders) {
        if (!b.inBand(x, y)) continue;
        const t = b.distFromEdge(x, y) / borderBlendWidth; // 0 at edge → 1 at inner boundary
        const cell = grid[x][y];
        cell.altitude = lerp(b.base.altitude, cell.altitude, t);
        cell.temperature = lerp(b.base.temperature, cell.temperature, t);
        cell.precipitation = lerp(b.base.precipitation, cell.precipitation, t);
        cell.light = lerp(b.base.light, cell.light, t);
        // drainage is gradient-derived; blend toward 0.5 (flat) at the edge
        cell.drainage = lerp(0.5, cell.drainage, t);
      }
    }
  }
}

// ─── Stage 5 — Biome selection ────────────────────────────────────────────────

function stage5_selectBiomes(grid: PatchCell[][]): void {
  for (const col of grid) {
    for (const cell of col) {
      cell.biomeId = selectBiomeId(
        cell.altitude,
        cell.temperature,
        cell.precipitation,
        cell.drainage,
      );
    }
  }
}

// ─── Stage 6 — CA smoothing ───────────────────────────────────────────────────

const CLUSTER_SURVIVAL_MIN = 7;

const MOORE8: ReadonlyArray<[number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];
const VON4: ReadonlyArray<[number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
];

function stage6_caSmoothing(grid: PatchCell[][], biomes: Biome[]): void {
  const pw = grid.length;
  const ph = grid[0].length;

  const biomeById = new Map<number, Biome>();
  for (const b of biomes) biomeById.set(b.id, b);

  for (let pass = 0; pass < 2; pass++) {
    // Level 1: plurality-rule — collect proposed replacements
    const proposed: number[][] = grid.map((col) =>
      col.map((c) => c.biomeId),
    );

    for (let x = 0; x < pw; x++) {
      for (let y = 0; y < ph; y++) {
        const counts = new Map<number, number>();
        for (const [dx, dy] of MOORE8) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < pw && ny >= 0 && ny < ph) {
            const id = grid[nx][ny].biomeId;
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }
        }
        let best = grid[x][y].biomeId, bestCount = 0;
        for (const [id, count] of counts) {
          if (count > bestCount) { bestCount = count; best = id; }
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
        if (!curBiome || !repBiome) { grid[x][y].biomeId = rep; continue; }

        // Distance on the three terrain-derived axes
        const cell = grid[x][y];
        const distTo = (b: Biome) => {
          const dd = Math.max(0, b.drainageRange[0] - cell.drainage, cell.drainage - b.drainageRange[1]);
          const da = Math.max(0, b.altitudeRange[0] - cell.altitude, cell.altitude - b.altitudeRange[1]);
          const dl = Math.max(0, b.lightRange[0] - cell.light, cell.light - b.lightRange[1]);
          return dd + da + dl;
        };

        // Keep cluster intact if it's large enough
        const clusterSize = measureCluster(grid, x, y, cur, pw, ph);
        if (clusterSize >= CLUSTER_SURVIVAL_MIN) continue;

        // Keep if terrain justifies current biome better than proposed replacement
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
    const k = cx * 10000 + cy;
    if (visited.has(k)) continue;
    visited.add(k);
    if (visited.size >= CLUSTER_SURVIVAL_MIN) return visited.size; // early exit
    for (const [dx, dy] of VON4) {
      const nx = cx + dx, ny = cy + dy;
      if (
        nx >= 0 && nx < pw && ny >= 0 && ny < ph &&
        grid[nx][ny].biomeId === targetId
      ) {
        stack.push([nx, ny]);
      }
    }
  }

  return visited.size;
}

// ─── Stage 7 — Tile-scale modifier pass ──────────────────────────────────────

function stage7_expandTiles(
  grid: PatchCell[][],
  config: PipelineConfig,
): Tile[][] {
  const { width, height, tilesPerPatch, seed, localNoiseScale } = config;
  const pw = grid.length;
  const ph = grid[0].length;

  // Fine-resolution noise for tile-scale elevation and precipitation variation.
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

  // Helper: tile altitude at (tx, ty) including fine noise.
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

      // Seasonality increases toward colder temperatures.
      const seasonality = clamp(1 - (patch.temperature + 20) / 55, 0, 1);

      const effectiveMoisture = precipitation * (1 - drainage);

      tiles[tx][ty] = {
        index: { x: tx, y: ty },
        biomeId: patch.biomeId,
        altitude,
        temperature: patch.temperature,
        precipitation,
        drainage,
        light,
        seasonality,
        effectiveMoisture,
        continentality,
        water: false,
        waterType: undefined,
      };
    }
  }

  return tiles;
}

// ─── Stage 8 — Water features ─────────────────────────────────────────────────

function stage8_waterFeatures(
  tiles: Tile[][],
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  placePonds(tiles, grid, config);
  placeRivers(tiles, grid, config);
}

function placePonds(
  tiles: Tile[][],
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  const { width, height, tilesPerPatch } = config;
  const pw = grid.length;
  const ph = grid[0].length;

  const tileAlt = (x: number, y: number) => tiles[x]?.[y]?.altitude ?? Infinity;
  const tKey = (x: number, y: number) => x * 10000 + y;

  const fills: Array<Array<[number, number]>> = [];
  const claimed = new Set<number>();

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const alt = tileAlt(x, y);

      // Must be a local minimum across all 8 neighbors.
      let isMin = true;
      for (const [dx, dy] of MOORE8) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (tileAlt(nx, ny) <= alt) { isMin = false; break; }
        }
      }
      if (!isMin || claimed.has(tKey(x, y))) continue;

      // Parent patch must have low drainage.
      const px = clamp(Math.floor(x / tilesPerPatch), 0, pw - 1);
      const py = clamp(Math.floor(y / tilesPerPatch), 0, ph - 1);
      if (grid[px][py].drainage >= 0.30) continue;

      // Flood-fill up to max area within depth tolerance.
      const fill: Array<[number, number]> = [];
      const queue: Array<[number, number]> = [[x, y]];
      const seen = new Set<number>();
      seen.add(tKey(x, y));

      while (queue.length > 0 && fill.length < POND_MAX_AREA) {
        const [cx, cy] = queue.shift()!;
        fill.push([cx, cy]);
        for (const [dx, dy] of VON4) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nk = tKey(nx, ny);
          if (seen.has(nk)) continue;
          if (tileAlt(nx, ny) <= alt + POND_DEPTH_TOLERANCE) {
            seen.add(nk);
            queue.push([nx, ny]);
          }
        }
      }

      if (fill.length >= POND_MIN_AREA) fills.push(fill);
    }
  }

  // Largest fills win; enforce minimum separation.
  fills.sort((a, b) => b.length - a.length);

  for (const fill of fills) {
    let tooClose = false;
    outer: for (const [fx, fy] of fill) {
      for (let d = 1; d <= POND_MIN_SEPARATION; d++) {
        for (const [dx, dy] of VON4) {
          const nx = fx + dx * d, ny = fy + dy * d;
          if (claimed.has(tKey(nx, ny))) { tooClose = true; break outer; }
        }
      }
    }
    if (tooClose) continue;

    for (const [fx, fy] of fill) {
      claimed.add(tKey(fx, fy));
      tiles[fx][fy].water = true;
      tiles[fx][fy].waterType = "pond";
    }
  }
}

function placeRivers(
  tiles: Tile[][],
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  const { width, height, tilesPerPatch } = config;
  const pw = grid.length;
  const ph = grid[0].length;

  const patchAlt = (px: number, py: number) =>
    px >= 0 && px < pw && py >= 0 && py < ph
      ? grid[px][py].altitude
      : Infinity;

  const pKey = (x: number, y: number) => x * 1000 + y;
  const visitedPatch = new Set<number>();

  for (let spx = 0; spx < pw; spx++) {
    for (let spy = 0; spy < ph; spy++) {
      if (visitedPatch.has(pKey(spx, spy))) continue;

      // Verify this patch has a qualifying downhill neighbor.
      let hasQualifyingGrad = false;
      for (const [dx, dy] of VON4) {
        if (patchAlt(spx, spy) - patchAlt(spx + dx, spy + dy) > RIVER_GRADIENT_THRESHOLD) {
          hasQualifyingGrad = true;
          break;
        }
      }
      if (!hasQualifyingGrad) continue;

      // Trace steepest-descent chain through patch grid.
      const chain: Array<[number, number]> = [[spx, spy]];
      let [cx, cy] = [spx, spy];

      for (let step = 0; step < RIVER_MAX_PATCHES - 1; step++) {
        let bestGrad = RIVER_GRADIENT_THRESHOLD;
        let next: [number, number] | null = null;
        for (const [dx, dy] of VON4) {
          const g = patchAlt(cx, cy) - patchAlt(cx + dx, cy + dy);
          if (g > bestGrad) { bestGrad = g; next = [cx + dx, cy + dy]; }
        }
        if (!next) break;

        const [nx, ny] = next;
        if (nx < 0 || nx >= pw || ny < 0 || ny >= ph) break;

        chain.push([nx, ny]);

        // Terminate if we've reached a pond.
        const midTX = clamp(nx * tilesPerPatch + Math.floor(tilesPerPatch / 2), 0, width - 1);
        const midTY = clamp(ny * tilesPerPatch + Math.floor(tilesPerPatch / 2), 0, height - 1);
        if (tiles[midTX][midTY].waterType === "pond") break;

        [cx, cy] = [nx, ny];
      }

      if (chain.length < 2) continue;

      // Stamp the lowest tile in each chain patch as a river tile.
      for (const [rpx, rpy] of chain) {
        visitedPatch.add(pKey(rpx, rpy));

        const tx0 = rpx * tilesPerPatch;
        const ty0 = rpy * tilesPerPatch;
        const tx1 = Math.min(tx0 + tilesPerPatch, width);
        const ty1 = Math.min(ty0 + tilesPerPatch, height);

        let lowestX = tx0, lowestY = ty0, lowestAlt = Infinity;
        for (let tx = tx0; tx < tx1; tx++) {
          for (let ty = ty0; ty < ty1; ty++) {
            if (tiles[tx][ty].altitude < lowestAlt) {
              lowestAlt = tiles[tx][ty].altitude;
              lowestX = tx; lowestY = ty;
            }
          }
        }

        tiles[lowestX][lowestY].water = true;
        tiles[lowestX][lowestY].waterType = "river";
      }
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function generateTileMap(config: PipelineConfig): Tile[][] {
  const grid = stage1_initGrid(config);
  stage2_noiseAxes(grid, config);
  stage3_gradientAxes(grid);
  stage4_blendBorders(grid, config);
  stage5_selectBiomes(grid);
  stage6_caSmoothing(grid, config.biomes);
  const tiles = stage7_expandTiles(grid, config);
  stage8_waterFeatures(tiles, grid, config);
  return tiles;
}
