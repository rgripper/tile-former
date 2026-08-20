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
import { getPalette, tintRamp } from "./palette/index.ts";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
// Rising edge: 0 at a, 1 at b (a < b).
const rise = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
// Falling edge: 1 at a, 0 at b (a < b).
const fall = (x: number, a: number, b: number) => clamp01((b - x) / (b - a));
// Trapezoid: 0 below a, 1 between b and c, 0 above d.
const band = (x: number, a: number, b: number, c: number, d: number) =>
  Math.min(rise(x, a, b), fall(x, c, d));

// --- Substrates ---

// --- Calibration note (2026-08-17) ---
// These curves are tuned against the *measured* property ranges the tilegen
// pipeline actually emits, not against an assumed [0,1]. Over nine climate
// segments (see PLAN.md "Real-map measurement"):
//
//   drainage           p10 0.28  p50 0.50  p90 0.79     (full range after the
//                                                        computeDrainage fix)
//   effectiveMoisture  p50 0.03 (hot dry) … 0.44 (hot wet); never above ~0.63
//   fertility          p50 0.14 (alpine) … 0.46 (temperate); never above 0.75
//
// The moisture ceiling is the one that catches people out: `effectiveMoisture =
// precipitation × (1 − drainage)`, so it is structurally capped well below 1 and
// any threshold written above ~0.6 is dead code. Before the drainage fix these
// curves were compensating for a drainage band that never exceeded 0.38; they
// were rebalanced when that was corrected. **If the generator's property
// distributions move, re-measure before touching these numbers.**

export function scoreSubstrates(i: DesignInput): Record<SubstrateId, number> {
  const t = i.temperature;
  const m = i.effectiveMoisture;
  const d = i.drainage;
  const f = i.fertility;
  const sandyRock = i.rockType === "sedimentary" || i.rockType === "limestone";
  // Hot, bone-dry, free-draining ground: an aeolian sand sea. Loose sand
  // mantles the bedrock here, so this both drives sand up and holds bareRock
  // down (see below) — otherwise warm deserts read as infertile bare rock.
  // The drainage term is deliberately weak: a sand sea is defined by heat and
  // aridity, and loose sand is free-draining as a *consequence*. Gating it on
  // high drainage (as `rise(d, 0.4, 0.7)` did) left hot deserts resolving to
  // soil 61% / sand 39%, because median drainage is only 0.50.
  const aeolian = rise(t, 15, 30) * fall(m, 0.03, 0.12) * rise(d, 0.2, 0.5);
  // Soil-forming potential. Bedrock only stays *bare* where nothing can build a
  // horizon over it: infertile, and neither wet enough nor warm enough for
  // vegetation to colonise. Without this term bareRock wins on every
  // low-fertility tile regardless of climate, which floods temperate and
  // montane-forest maps with exposed rock.
  const barren = rise(1 - f, 0.62, 0.9) * fall(m, 0.12, 0.4);

  return {
    // Persistent snowpack: very cold AND enough precipitation to feed it —
    // hyperarid cold (Polar Desert) stays frozenGround/scree instead.
    snow: 1.5 * fall(t, -30, -6) * rise(m, 0.06, 0.22),

    // Permafrost flats: exposed frozen *ground*, which is a sub-polar material —
    // banded rather than open-ended cold, so genuinely polar temperatures yield
    // to snow cover instead of showing bare permafrost everywhere.
    frozenGround: band(t, -22, -13, 0, 2) * fall(d, 0.3, 0.7),

    // Organic waterlogged accumulation: cool, wet, poorly drained.
    peat: fall(t, 0, 12) * rise(m, 0.3, 0.5) * fall(d, 0.25, 0.5),

    // Wetland muck; riparian margins qualify even with decent drainage.
    mud: Math.max(
      fall(d, 0.25, 0.55) * rise(m, 0.32, 0.55) * rise(t, -2, 10),
      i.riparian * rise(m, 0.2, 0.45) * rise(t, -2, 8) * 0.8,
    ),

    // Warm wet lowlands over impermeable ground (rainforest/monsoon floors).
    clay: fall(d, 0.35, 0.65) * rise(t, 10, 22) * rise(m, 0.25, 0.45),

    // Granular weathering: arid + free-draining. Favored on sediment-forming
    // rock; other rock is penalized, but that penalty relaxes under a hot
    // aeolian regime (any rock weathers to sand there) so warm deserts stay
    // sandy regardless of rock while cold dry ground keeps its rocky/soil read.
    // The moisture gate is tight: at the old fall(m, 0.1, 0.35) a *temperate*
    // map (m ≈ 0.23) scored 12% sand. The temperature floor keeps sand out of
    // polar maps (where dry tiles were scoring 15% sand) while still allowing
    // it in a cold desert around −8 °C.
    sand:
      rise(d, 0.3, 0.6) *
      fall(m, 0.02, 0.1) *
      rise(t, -18, -4) *
      (sandyRock ? 1 : 0.4 + 0.5 * aeolian),

    // Frost-shattered rubble: freeze–thaw band + fast drainage, and genuinely
    // altitude-gated rather than merely altitude-boosted — scree is a
    // mountain-and-tundra material, not something temperate lowland produces.
    scree:
      rise(d, 0.5, 0.8) *
      band(t, -30, -15, 2, 12) *
      rise(i.altitude, 0.25, 0.55),

    // Exposed bedrock: thin/no soil on infertile, well-drained, unvegetated
    // ground — but an aeolian sand sea buries it, so it yields to sand in warm
    // deserts. Altitude helps: ridges shed their regolith.
    bareRock:
      barren *
      rise(d, 0.5, 0.82) *
      (0.55 + 0.45 * rise(i.altitude, 0.3, 0.65)) *
      (1 - 0.7 * aeolian),

    // Default earth — scales with fertility, retreats when frozen and thins out
    // under a hot aeolian regime (no vegetation to build a soil horizon there).
    // Keyed on `aeolian`, not raw moisture, so cold/temperate steppes that share
    // a desert's low moisture keep their soil.
    soil: (0.32 + 0.6 * f) * rise(t, -12, -2) * (1 - 0.85 * aeolian),
  };
}

// --- Mats ---

export function scoreMats(i: DesignInput): Record<MatId, number> {
  const t = i.temperature;
  const m = i.effectiveMoisture;
  const f = i.fertility;
  const light = i.groundLight;

  // Same calibration caveat as scoreSubstrates: `groundLight` is capped by the
  // segment's `light` constant (measured max 0.55), so any threshold above that
  // is dead code — the old dryGrass `rise(light, 0.2, 0.5)` was only just inside
  // it. Moisture thresholds are pulled down to the measured ~0.63 ceiling.
  return {
    grass: clamp01(1.4 * f * rise(m, 0.1, 0.32) * rise(t, 0, 10) * rise(light, 0.12, 0.35)),
    dryGrass: clamp01(1.3 * f * band(m, 0.03, 0.1, 0.26, 0.45) * rise(t, 0, 15) * rise(light, 0.15, 0.4)),
    moss: rise(m, 0.32, 0.55) * fall(light, 0.25, 0.55) * band(t, -5, 2, 18, 25),
    lichen: fall(t, -10, 5) * fall(f, 0.1, 0.4) * rise(m, 0.06, 0.22),
    leafLitter: i.forestDensity * rise(t, 5, 15),
    needleLitter: i.forestDensity * band(t, -20, -10, 5, 12),
    sedge: clamp01(Math.max(i.riparian, fall(i.drainage, 0.25, 0.5) * rise(m, 0.32, 0.55)) * rise(f, 0.1, 0.4) * rise(t, -5, 5)),
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
    substrateRamps[s.id] = palette[s.id];
  }

  const matRamps: StyleParams["matRamps"] = {};
  for (const mat of surface.mats) {
    let ramp = palette[mat.id];
    if (mat.id === "grass") {
      // Climate tint: dry → yellow-green, wet → deep green; cold desaturates.
      // tintRamp snaps the result back onto the master palette, so a dry
      // climate slides grass onto `straw` steps rather than inventing an
      // intermediate green — climate moves between authored ramps.
      const dryness = 1 - i.effectiveMoisture;
      const coldness = fall(i.temperature, 0, 12);
      ramp = tintRamp(ramp, dryness * 0.045, -coldness * 0.25, dryness * 0.04);
    }
    matRamps[mat.id] = ramp;
  }

  return {
    water: i.water,
    surface,
    substrateRamps,
    matRamps,
    staticScatter: {
      // Exposed stones where drainage is high and soil development thin.
      pebble: clamp01(rise(i.drainage, 0.35, 0.7) * (0.4 + 0.6 * fall(i.fertility, 0.2, 0.6))),
      // Deadfall under any canopy that isn't frozen solid year-round.
      twig: clamp01(i.forestDensity * rise(i.temperature, -10, 0)),
      // Stray broadleaf drop outside the litter carpet proper.
      leaf: clamp01(i.forestDensity * rise(i.temperature, 5, 15) * 0.8),
    },
    scatterRamps: {
      pebble: palette.pebble,
      twig: palette.twig,
      leaf: palette.leaf,
    },
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
