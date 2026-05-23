import { createNoise2D } from "simplex-noise";
import { createRand } from "../rand";
import { pickRandomIndexesSparsely } from "../tileMap/growTileClusters";
import { biomes as defaultBiomes } from "../tileMap/biomes";
import type { Biome } from "../tileMap/Biome";
import type { Tile } from "../tileMap/tile";

// ─── Coordinate ──────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };

// ─── Stage 1 types ───────────────────────────────────────────────────────────

export type BiomeSeed = {
  biome: Biome;
  biomeIndex: number;
  origin: Point;
};

/** Each cell carries its dominant biome seed after Voronoi assignment. */
export type MacroCell = {
  index: Point;
  seed: BiomeSeed;
  baseTemperature: number;
  basePrecipitation: number;
};

// ─── Stage 2 types ───────────────────────────────────────────────────────────

export type LocalProperties = {
  temperature: number;
  precipitation: number;
  drainage: number;
  altitude: number;
  light: number;
  seasonality: number;
};

export type ModifiedCell = MacroCell & {
  local: LocalProperties;
};

// ─── Stage 3 types ───────────────────────────────────────────────────────────

export type BlendWeights = {
  primary: BiomeSeed;
  neighbor?: { seed: BiomeSeed; weight: number };
};

export type EcotoneCell = ModifiedCell & {
  blend: BlendWeights;
};

// ─── Derived ecological values ────────────────────────────────────────────────

export type DerivedValues = {
  effectiveMoisture: number;
  waterlogging: number;
  continentality: number;
};

// ─── Pipeline config ──────────────────────────────────────────────────────────

export type PipelineConfig = {
  width: number;
  height: number;
  seed: string;
  biomes: Biome[];
  seedCount: number;
  ecotoneBlendRadius: number;
  localNoiseScale: number;
};

export const defaultPipelineConfig: PipelineConfig = {
  width: 64,
  height: 64,
  seed: "pipeline1",
  biomes: defaultBiomes,
  seedCount: 20,
  ecotoneBlendRadius: 3,
  localNoiseScale: 0.15,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function noise01(fn: (x: number, y: number) => number, x: number, y: number) {
  return (fn(x, y) + 1) / 2;
}

function sampleRange(range: [number, number], t: number) {
  return lerp(range[0], range[1], clamp(t, 0, 1));
}

function latitudeFactor(y: number, height: number) {
  // 0 at equator (center), 1 at poles (top/bottom edges)
  return Math.abs(y / (height - 1) - 0.5) * 2;
}

function pickEligibleBiome(
  biomes: Biome[],
  temp: number,
  precip: number,
  rand: () => number,
): { biome: Biome; index: number } {
  const eligible: number[] = [];
  for (let i = 0; i < biomes.length; i++) {
    const b = biomes[i];
    if (
      temp >= b.temperatureRange[0] &&
      temp <= b.temperatureRange[1] &&
      precip >= b.precipitationRange[0] &&
      precip <= b.precipitationRange[1]
    ) {
      eligible.push(i);
    }
  }

  if (eligible.length > 0) {
    const idx = eligible[Math.floor(rand() * eligible.length)];
    return { biome: biomes[idx], index: idx };
  }

  // Fallback: biome with smallest normalized distance on temp+precip axes
  // temp range span ~65°C, precip span 1.0 — divide temp by 65 to normalize
  let bestIdx = 0;
  let bestScore = Infinity;
  for (let i = 0; i < biomes.length; i++) {
    const b = biomes[i];
    const td =
      Math.max(0, b.temperatureRange[0] - temp, temp - b.temperatureRange[1]) /
      65;
    const pd = Math.max(
      0,
      b.precipitationRange[0] - precip,
      precip - b.precipitationRange[1],
    );
    const score = td + pd;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return { biome: biomes[bestIdx], index: bestIdx };
}

// ─── Stage 1 — Macro layout (biome regions) ──────────────────────────────────

const CLIMATE_SCALE = 0.04;

export function generateMacroCells(config: PipelineConfig): MacroCell[][] {
  const { width, height, seed, biomes, seedCount } = config;
  const rand = createRand(seed);
  const makeNoise = (s: string) => createNoise2D(createRand(s).next);

  const tempClimate = makeNoise(seed + "_tc");
  const precipClimate = makeNoise(seed + "_pc");

  const minDist = Math.min(width, height) / Math.sqrt(seedCount);
  const seedPoints = pickRandomIndexesSparsely({
    count: seedCount,
    next: () => ({
      x: Math.floor(rand.next() * width),
      y: Math.floor(rand.next() * height),
    }),
    minimumDistance: minDist,
  });

  const seeds: BiomeSeed[] = seedPoints.map((origin) => {
    const latF = latitudeFactor(origin.y, height);
    const baseTemperature =
      lerp(35, -20, latF) +
      tempClimate(origin.x * CLIMATE_SCALE, origin.y * CLIMATE_SCALE) * 6;
    const basePrecipitation = clamp(
      noise01(
        precipClimate,
        origin.x * CLIMATE_SCALE * 0.7,
        origin.y * CLIMATE_SCALE * 0.7,
      ),
      0,
      1,
    );
    const { biome, index: biomeIndex } = pickEligibleBiome(
      biomes,
      baseTemperature,
      basePrecipitation,
      rand.next,
    );
    return { biome, biomeIndex, origin };
  });

  const cells: MacroCell[][] = [];
  for (let x = 0; x < width; x++) {
    cells[x] = [];
    for (let y = 0; y < height; y++) {
      const latF = latitudeFactor(y, height);
      const baseTemperature =
        lerp(35, -20, latF) +
        tempClimate(x * CLIMATE_SCALE, y * CLIMATE_SCALE) * 6;
      const basePrecipitation = clamp(
        noise01(precipClimate, x * CLIMATE_SCALE * 0.7, y * CLIMATE_SCALE * 0.7),
        0,
        1,
      );

      let nearest = seeds[0];
      let minSqDist = Infinity;
      for (const s of seeds) {
        const d = (x - s.origin.x) ** 2 + (y - s.origin.y) ** 2;
        if (d < minSqDist) {
          minSqDist = d;
          nearest = s;
        }
      }

      cells[x][y] = {
        index: { x, y },
        seed: nearest,
        baseTemperature,
        basePrecipitation,
      };
    }
  }

  return cells;
}

// ─── Stage 2 — Local modifiers ────────────────────────────────────────────────

export function applyLocalModifiers(
  macro: MacroCell[][],
  config: PipelineConfig,
): ModifiedCell[][] {
  const { seed, localNoiseScale: scale, height } = config;
  const makeNoise = (s: string) => createNoise2D(createRand(s).next);

  // Applied in axis dependency order: altitude → temperature → precipitation →
  // drainage → light → seasonality
  const altNoise = makeNoise(seed + "_alt");
  const tempNoise = makeNoise(seed + "_tmp");
  const precipNoise = makeNoise(seed + "_prc");
  const drainNoise = makeNoise(seed + "_drn");
  const lightNoise = makeNoise(seed + "_lgt");
  const seasonNoise = makeNoise(seed + "_ssn");

  return macro.map((col, x) =>
    col.map((cell, y) => {
      const { biome } = cell.seed;

      const altitude = sampleRange(
        biome.altitudeRange,
        noise01(altNoise, x * scale, y * scale),
      );

      const temperature = clamp(
        cell.baseTemperature + tempNoise(x * scale, y * scale) * 3,
        biome.temperatureRange[0],
        biome.temperatureRange[1],
      );

      const precipitation = clamp(
        cell.basePrecipitation + precipNoise(x * scale, y * scale) * 0.08,
        biome.precipitationRange[0],
        biome.precipitationRange[1],
      );

      const drainage = sampleRange(
        biome.drainageRange,
        noise01(drainNoise, x * scale, y * scale),
      );

      // Light: blend latitude base with local noise, biome-constrained
      const latF = latitudeFactor(y, height);
      const lightT = lerp(1 - latF, noise01(lightNoise, x * scale, y * scale), 0.35);
      const light = sampleRange(biome.lightRange, lightT);

      const seasonality = sampleRange(
        biome.seasonalityRange,
        noise01(seasonNoise, x * scale, y * scale),
      );

      return { ...cell, local: { temperature, precipitation, drainage, altitude, light, seasonality } };
    }),
  );
}

// ─── Stage 3 — Ecotone blending ───────────────────────────────────────────────

const LOCAL_PROPS = [
  "temperature",
  "precipitation",
  "drainage",
  "altitude",
  "light",
  "seasonality",
] as const;

const DIRS = [
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
];

export function blendEcotones(
  cells: ModifiedCell[][],
  config: PipelineConfig,
): EcotoneCell[][] {
  const { ecotoneBlendRadius } = config;
  const width = cells.length;
  const height = cells[0].length;

  type MutableLocal = { [K in keyof LocalProperties]: number };
  let locals: MutableLocal[][] = cells.map((col) => col.map((c) => ({ ...c.local })));

  // Each pass blends boundary cells with their foreign-seeded neighbours,
  // naturally expanding the ecotone zone one tile per pass.
  for (let pass = 0; pass < ecotoneBlendRadius; pass++) {
    const next: MutableLocal[][] = locals.map((col) => col.map((l) => ({ ...l })));

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const thisSeed = cells[x][y].seed;
        const foreign: Point[] = [];

        for (const { dx, dy } of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && cells[nx][ny].seed !== thisSeed) {
            foreign.push({ x: nx, y: ny });
          }
        }

        if (foreign.length === 0) continue;

        const blendWeight = 0.4 * (foreign.length / DIRS.length);
        const myWeight = 1 - blendWeight;

        for (const prop of LOCAL_PROPS) {
          const foreignAvg =
            foreign.reduce((sum, n) => sum + locals[n.x][n.y][prop], 0) /
            foreign.length;
          next[x][y][prop] = myWeight * locals[x][y][prop] + blendWeight * foreignAvg;
        }
      }
    }

    locals = next;
  }

  return cells.map((col, x) =>
    col.map((cell, y) => ({
      ...cell,
      local: locals[x][y] as LocalProperties,
      blend: { primary: cell.seed },
    })),
  );
}

// ─── Derived ecological values ────────────────────────────────────────────────

export function computeDerivedValues(props: LocalProperties): DerivedValues {
  const { precipitation, drainage, seasonality, temperature } = props;
  return {
    effectiveMoisture: precipitation * (1 - drainage),
    waterlogging: precipitation * (1 - drainage) ** 2,
    continentality: seasonality * (Math.abs(temperature) / 35),
  };
}

// ─── Resolve to Tile ──────────────────────────────────────────────────────────

export function resolveToTile(cell: EcotoneCell): Tile {
  return {
    index: cell.index,
    biomeId: cell.blend.primary.biomeIndex,
    ...cell.local,
  };
}

// ─── Top-level entry point ────────────────────────────────────────────────────

export function generateTileMap(config: PipelineConfig): Tile[][] {
  const macro = generateMacroCells(config);
  const modified = applyLocalModifiers(macro, config);
  const ecotone = blendEcotones(modified, config);
  return ecotone.map((col) => col.map(resolveToTile));
}
