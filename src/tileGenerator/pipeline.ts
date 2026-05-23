import type { Biome } from "../tileMap/Biome";
import type { Tile } from "../tileMap/tile";

// ─── Coordinate ──────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };

// ─── Stage 1 types ───────────────────────────────────────────────────────────

export type BiomeSeed = {
  biome: Biome;
  origin: Point;
};

/** Each cell carries its dominant biome seed after Voronoi assignment. */
export type MacroCell = {
  index: Point;
  seed: BiomeSeed;
  /** Raw temperature drive from latitude gradient, before local modifiers. */
  baseTemperature: number;
  /** Raw precipitation drive from large-scale climate noise. */
  basePrecipitation: number;
};

// ─── Stage 2 types ───────────────────────────────────────────────────────────

/** Full axis values after local modifiers are applied within a biome region. */
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
  /** Neighboring seed and its blend weight [0–1] at an ecotone boundary. */
  neighbor?: { seed: BiomeSeed; weight: number };
};

export type EcotoneCell = ModifiedCell & {
  blend: BlendWeights;
};

// ─── Derived ecological values ────────────────────────────────────────────────

export type DerivedValues = {
  effectiveMoisture: number;  // precipitation × (1 - drainage)
  waterlogging: number;       // precipitation × (1 - drainage)²
  continentality: number;     // seasonality × temperature variance proxy
};

// ─── Pipeline config ──────────────────────────────────────────────────────────

export type PipelineConfig = {
  width: number;
  height: number;
  seed: string;
  biomes: Biome[];
  /** Number of biome seeds to scatter across the map. */
  seedCount: number;
  /** Tile radius for ecotone blending at biome borders. */
  ecotoneBlendRadius: number;
  /** Noise frequency scale for local modifiers (Stage 2). */
  localNoiseScale: number;
};

// ─── Stage functions ──────────────────────────────────────────────────────────

/**
 * Stage 1 — Place biome seeds and assign every cell to its nearest seed via
 * Voronoi. Temperature and precipitation gradients constrain which biomes are
 * eligible at each location.
 */
export function generateMacroCells(_config: PipelineConfig): MacroCell[][] {
  throw new Error("Not implemented");
}

/**
 * Stage 2 — Within each biome region, apply local noise to derive secondary
 * axes (drainage, altitude, light, seasonality). Local modifiers are applied
 * in dependency order per the axis hierarchy.
 */
export function applyLocalModifiers(
  _macro: MacroCell[][],
  _config: PipelineConfig,
): ModifiedCell[][] {
  throw new Error("Not implemented");
}

/**
 * Stage 3 — At biome region boundaries, blend properties from both adjacent
 * biomes. Hard edges (rivers, ridgelines) get narrow blend; open terrain gets
 * wide blend.
 */
export function blendEcotones(
  _cells: ModifiedCell[][],
  _config: PipelineConfig,
): EcotoneCell[][] {
  throw new Error("Not implemented");
}

/**
 * Collapse 6-axis space into ecologically meaningful derived values.
 */
export function computeDerivedValues(_props: LocalProperties): DerivedValues {
  throw new Error("Not implemented");
}

/**
 * Convert a finalized EcotoneCell into a Tile (assigns biomeId and flattens
 * properties).
 */
export function resolveToTile(_cell: EcotoneCell): Tile {
  throw new Error("Not implemented");
}

// ─── Top-level entry point ────────────────────────────────────────────────────

export function generateTileMap(config: PipelineConfig): Tile[][] {
  const macro = generateMacroCells(config);
  const modified = applyLocalModifiers(macro, config);
  const ecotone = blendEcotones(modified, config);
  return ecotone.map((col) => col.map(resolveToTile));
}
