// Shared helpers for the multi-tile preview panels: world-coordinate jitter
// so seam checks exercise the realistic near-identical-neighbor case (not the
// trivial identical-tile one), an alpha-aware blit for compositing baked tiles
// into one big canvas buffer, and minority-biome cluster placement so a
// preview field reads as a mix rather than one flat biome.

import { biomes, type Biome } from "@tile-former/tilegen";
import type { DesignInput } from "../core/types.ts";
import { fbm } from "../core/noise.ts";
import type { PixelBuffer } from "../core/pixels.ts";
import { makeRng } from "../core/rng.ts";
import { biomeToInput } from "../core/biomeInput.ts";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// --- Property jitter -----------------------------------------------------------
//
// Tiles per wavelength of the jitter field, and the stretch that puts its
// useful range back where a uniform hash's was.
//
// This field used to be `hash2D(tx, ty, …)` — independent white noise per tile.
// That is the wrong model of a real map and it looks it. Wherever a biome sits
// near a substrate threshold (Cold Desert is right on the sand/soil line, and
// the montane and tropical-forest biomes on several at once), a per-tile coin
// flip decides the winner, and the dual grid faithfully renders the result: a
// chessboard of one-tile enclaves, each one a lone diamond with nothing but
// square in it. Measured over 44 biomes × 5 seeds at 16×16, 4.9% of all tiles
// were lone one-tile islands of their substrate, 11.6% in the worst biome.
//
// The generator this stands in for does not work that way: tilegen's properties
// come from gradient axes, cluster fields and a CA smoothing pass, so a
// substrate patch is many tiles across. Low-frequency fBm is the faithful
// model — and the same one the rest of the package already uses wherever a
// per-cell independent pick would step visibly (compose.ts's `BIAS_CELLS`,
// terrain.ts's `defaultLevelFrequency`). Lumps a few tiles wide, rounded by the
// dual grid, instead of salt and pepper.
const JITTER_CELLS = 5;
// fBm concentrates around 0.5, so without a stretch the jitter would only ever
// reach a fraction of the band the thresholds are tuned against.
const JITTER_CONTRAST = 2.2;

// Each property gets its own field, so they drift independently rather than a
// single lump moving every threshold at once.
function jitterAt(tx: number, ty: number, seed: number, k: number): number {
  const n = (fbm(tx, ty, (seed ^ (0xbeef * (k + 1))) >>> 0, 1 / JITTER_CELLS) - 0.5) * JITTER_CONTRAST;
  return n < -0.5 ? -0.5 : n > 0.5 ? 0.5 : n;
}

// Note there is no "the origin tile is exactly `input`" exemption any more: with
// a coherent field, pinning one tile back to the base value is precisely how you
// manufacture a one-tile enclave, at the centre of the preview no less. The 8×
// single-tile panel still bakes the unjittered style, so nothing lost it.
export function jitterInput(input: DesignInput, tx: number, ty: number, seed: number): DesignInput {
  const r = (k: number) => jitterAt(tx, ty, seed, k);
  return {
    ...input,
    temperature: input.temperature + r(1) * 3,
    effectiveMoisture: clamp01(input.effectiveMoisture + r(2) * 0.1),
    fertility: clamp01(input.fertility + r(3) * 0.1),
    drainage: clamp01(input.drainage + r(4) * 0.1),
    groundLight: clamp01(input.groundLight + r(5) * 0.1),
  };
}

// Copies non-transparent pixels of `src` into `dst` at (dx, dy).
export function blit(dst: PixelBuffer, src: PixelBuffer, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    const py = dy + y;
    if (py < 0 || py >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const so = (y * src.width + x) * 4;
      if (src.data[so + 3] === 0) continue;
      const px = dx + x;
      if (px < 0 || px >= dst.width) continue;
      const dof = (py * dst.width + px) * 4;
      dst.data[dof] = src.data[so]!;
      dst.data[dof + 1] = src.data[so + 1]!;
      dst.data[dof + 2] = src.data[so + 2]!;
      dst.data[dof + 3] = 255;
    }
  }
}

// --- Minority-biome clusters ---------------------------------------------------
// Wobbly-circle blobs of a different biome cut into an otherwise uniform field,
// placed on opposite sides so the base biome keeps the majority of the area.
// Originally milestone L's `MixedBiomePreview`; generalized to width×height (not
// just a square grid) so the terrain preview can reuse it.

type Harmonic = { amp: number; freq: number; phase: number };
export type Cluster = {
  biome: Biome;
  input: DesignInput;
  cx: number;
  cy: number;
  radius: number;
  harmonics: Harmonic[];
};

function pickBiome(pool: Biome[], rng: () => number, avoid: Set<number>): Biome {
  let biome = pool[Math.floor(rng() * pool.length)]!;
  for (let guard = 0; avoid.has(biome.id) && guard < 8; guard++) {
    biome = pool[Math.floor(rng() * pool.length)]!;
  }
  return biome;
}

function makeCluster(biome: Biome, cx: number, cy: number, radius: number, rng: () => number): Cluster {
  const harmonics: Harmonic[] = [1, 2, 3].map((freq) => ({
    amp: radius * (0.15 + rng() * 0.15),
    freq,
    phase: rng() * Math.PI * 2,
  }));
  return { biome, input: biomeToInput(biome), cx, cy, radius, harmonics };
}

// `count` clusters of a different biome than `selectedBiomeId`, placed roughly
// opposite each other within a `width`×`height` field centred on (0, 0). Sized
// off `min(width, height)` so a non-square field still gets clusters that fit
// inside its narrower axis.
export function pickClusters(
  selectedBiomeId: number | null,
  seed: number,
  width: number,
  height: number,
  radiusRange: readonly [number, number],
  count = 2,
): Cluster[] {
  const half = Math.min(width, height) / 2;
  const [minRadius, maxRadius] = radiusRange;
  const rng = makeRng((seed ^ 0x5eed1) >>> 0);
  const pool = biomes.filter((b) => b.id !== selectedBiomeId);
  if (pool.length === 0) return [];

  const avoid = new Set<number>(selectedBiomeId === null ? [] : [selectedBiomeId]);
  const baseAngle = rng() * Math.PI * 2;
  const clusters: Cluster[] = [];
  for (let i = 0; i < count; i++) {
    const biome = pickBiome(pool, rng, avoid);
    avoid.add(biome.id);
    const radius = minRadius + rng() * (maxRadius - minRadius);
    const angle = baseAngle + (i * Math.PI * 2) / count + (rng() - 0.5) * 1.2;
    const dist = half * 0.35 + rng() * half * 0.35;
    const cx = Math.round(Math.cos(angle) * dist);
    const cy = Math.round(Math.sin(angle) * dist);
    clusters.push(makeCluster(biome, cx, cy, radius, rng));
  }
  return clusters;
}

// Which cluster (if any) owns tile (tx, ty), given field coordinates centred on
// (0, 0) as `pickClusters` produces.
export function clusterAt(tx: number, ty: number, clusters: readonly Cluster[]): Cluster | null {
  for (const cluster of clusters) {
    const dx = tx - cluster.cx;
    const dy = ty - cluster.cy;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    let r = cluster.radius;
    for (const h of cluster.harmonics) r += h.amp * Math.sin(h.freq * angle + h.phase);
    if (dist <= r) return cluster;
  }
  return null;
}
