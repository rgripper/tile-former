// TileProperties → StyleParams. Pure and deterministic: every visual decision
// downstream (bake stages, scatter placement) reads only from the result.
//
// Substrate/mat selection uses score functions over raw properties — the
// legacy tilegen `surfaceType` is deliberately ignored (see PLAN.md,
// "Surface taxonomy"). Scores are heuristics tuned via the biome gallery.

import type {
  DesignInput,
  MatId,
  StyleParams,
  SubstrateId,
  SurfaceSpec,
} from "./types.ts";
import { getPalette, shiftRamp } from "./palette/index.ts";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
// Rising edge: 0 at a, 1 at b (a < b).
const rise = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
// Falling edge: 1 at a, 0 at b (a < b).
const fall = (x: number, a: number, b: number) => clamp01((b - x) / (b - a));
// Trapezoid: 0 below a, 1 between b and c, 0 above d.
const band = (x: number, a: number, b: number, c: number, d: number) =>
  Math.min(rise(x, a, b), fall(x, c, d));

// --- Substrates ---

export function scoreSubstrates(i: DesignInput): Record<SubstrateId, number> {
  const t = i.temperature;
  const m = i.effectiveMoisture;
  const d = i.drainage;
  const f = i.fertility;
  const sandyRock = i.rockType === "sedimentary" || i.rockType === "limestone";

  return {
    // Persistent snowpack: very cold AND enough precipitation to feed it —
    // hyperarid cold (Polar Desert) stays frozenGround/scree instead.
    snow: fall(t, -25, -8) * rise(m, 0.15, 0.45),

    // Permafrost flats: cold + impermeable ground.
    frozenGround: fall(t, -8, 2) * fall(d, 0.1, 0.5),

    // Organic waterlogged accumulation: cool, wet, no drainage.
    peat: fall(t, 0, 12) * rise(m, 0.5, 0.8) * fall(d, 0.05, 0.25),

    // Wetland muck; riparian margins qualify even with decent drainage.
    mud: Math.max(
      fall(d, 0.05, 0.3) * rise(m, 0.5, 0.85) * rise(t, -2, 10),
      i.riparian * rise(m, 0.3, 0.6) * rise(t, -2, 8) * 0.8,
    ),

    // Warm wet lowlands over impermeable ground (rainforest/monsoon floors).
    clay: fall(d, 0.15, 0.45) * rise(t, 10, 22) * rise(m, 0.35, 0.6),

    // Granular weathering: arid + free-draining, strongly favored on
    // sediment-forming rock.
    sand: rise(d, 0.5, 0.8) * fall(m, 0.1, 0.35) * (sandyRock ? 1 : 0.4),

    // Frost-shattered rubble: freeze–thaw band + fast drainage, boosted at altitude.
    scree:
      rise(d, 0.45, 0.75) *
      band(t, -30, -15, 0, 10) *
      (0.5 + 0.5 * rise(i.altitude, 0.3, 0.6)),

    // Exposed bedrock: thin/no soil on impermeable or steep ground.
    bareRock: rise(1 - f, 0.5, 0.85) * rise(d, 0.4, 0.7),

    // Default earth — scales with fertility, retreats when frozen.
    soil: (0.25 + 0.55 * f) * rise(t, -12, -2),
  };
}

// --- Mats ---

export function scoreMats(i: DesignInput): Record<MatId, number> {
  const t = i.temperature;
  const m = i.effectiveMoisture;
  const f = i.fertility;
  const light = i.groundLight;

  return {
    grass: clamp01(1.4 * f * rise(m, 0.15, 0.45) * rise(t, 0, 10) * rise(light, 0.15, 0.4)),
    dryGrass: clamp01(1.3 * f * band(m, 0.05, 0.15, 0.35, 0.55) * rise(t, 0, 15) * rise(light, 0.2, 0.5)),
    moss: rise(m, 0.5, 0.8) * fall(light, 0.25, 0.6) * band(t, -5, 2, 18, 25),
    lichen: fall(t, -10, 5) * fall(f, 0.1, 0.4) * rise(m, 0.1, 0.3),
    leafLitter: i.forestDensity * rise(t, 5, 15),
    needleLitter: i.forestDensity * band(t, -20, -10, 5, 12),
    sedge: clamp01(Math.max(i.riparian, fall(i.drainage, 0.05, 0.25) * rise(m, 0.5, 0.8)) * rise(f, 0.1, 0.4) * rise(t, -5, 5)),
    cushion: rise(i.altitude, 0.4, 0.6) * band(t, -30, -20, -5, 2) * rise(f, 0.05, 0.2),
  };
}

// Below this fraction of the winner's score, the runner-up substrate is
// dropped and the tile renders as a single material.
const SECOND_SUBSTRATE_MIN_RATIO = 0.35;
const MAT_COVERAGE_MIN = 0.08;
const MAX_MATS = 3;

export function resolveSurface(i: DesignInput): SurfaceSpec {
  const scores = scoreSubstrates(i);
  const ranked = (Object.entries(scores) as Array<[SubstrateId, number]>).sort(
    (a, b) => b[1] - a[1],
  );
  const [first, second] = ranked as [
    [SubstrateId, number],
    [SubstrateId, number],
  ];
  const substrates: SurfaceSpec["substrates"] = [];
  if (first[1] <= 0) {
    substrates.push({ id: "soil", weight: 1 }); // degenerate input; never blank
  } else if (second[1] > first[1] * SECOND_SUBSTRATE_MIN_RATIO) {
    const total = first[1] + second[1];
    substrates.push(
      { id: first[0], weight: first[1] / total },
      { id: second[0], weight: second[1] / total },
    );
  } else {
    substrates.push({ id: first[0], weight: 1 });
  }

  const mats = (Object.entries(scoreMats(i)) as Array<[MatId, number]>)
    .filter(([, c]) => c > MAT_COVERAGE_MIN)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_MATS)
    .map(([id, coverage]) => ({ id, coverage: clamp01(coverage) }));

  return { substrates, mats };
}

// --- Full style resolution ---

export function resolveStyle(i: DesignInput): StyleParams {
  const surface = resolveSurface(i);
  const palette = getPalette(i.biomeId);

  const substrateRamps: StyleParams["substrateRamps"] = {};
  for (const s of surface.substrates) {
    substrateRamps[s.id] = palette.substrates[s.id];
  }

  const matRamps: StyleParams["matRamps"] = {};
  for (const mat of surface.mats) {
    let ramp = palette.mats[mat.id];
    if (mat.id === "grass") {
      // Climate tint: dry → yellow-green, wet → deep green; cold desaturates.
      const dryness = 1 - i.effectiveMoisture;
      const coldness = fall(i.temperature, 0, 12);
      ramp = shiftRamp(ramp, dryness * 0.045, -coldness * 0.25, dryness * 0.04);
    }
    matRamps[mat.id] = ramp;
  }

  return {
    water: i.water,
    surface,
    substrateRamps,
    matRamps,
    texture: {
      arid: fall(i.effectiveMoisture, 0.08, 0.35) * rise(i.temperature, -5, 8),
      wet: Math.max(i.riparian, rise(i.effectiveMoisture, 0.7, 0.95)),
    },
    scatter: {
      fern:
        rise(i.effectiveMoisture, 0.4, 0.7) *
        fall(i.groundLight, 0.3, 0.7) *
        rise(i.temperature, 2, 12),
      reed: i.riparian * rise(i.effectiveMoisture, 0.4, 0.7) * rise(i.temperature, 0, 10),
      flower:
        i.fertility *
        rise(i.groundLight, 0.3, 0.6) *
        band(i.effectiveMoisture, 0.15, 0.3, 0.6, 0.8) *
        rise(i.temperature, 2, 12),
    },
  };
}
