import { describe, expect, it } from "vitest";
import { biomes } from "@tile-former/tilegen";
import { biomeToInput } from "../core/biomeInput.ts";
import { resolveStyle } from "../core/resolve.ts";
import { clusterAt, jitterInput, pickClusters } from "./previewUtils.ts";

// --- Property jitter ------------------------------------------------------------
//
// The preview's per-tile jitter stands in for the spread tilegen's own
// properties have across a map. What it must NOT do is decide each tile
// independently: several biomes sit right on a substrate threshold (Cold Desert
// on sand/soil, the montane and tropical-forest ones on two or three at once),
// and an independent per-tile coin flip there resolves as a chessboard of
// one-tile enclaves — each one a lone diamond, which is the one shape the whole
// dual-grid design exists to stop the eye finding.

const GRID = 16;
const SEEDS = [1232, 1234, 7, 99, 4242];

// Winner substrate per tile, exactly as TerrainPreview builds its field (minus
// the altitude, which is coherent already and not what is under test here).
function substrateField(biomeId: number, seed: number): string[][] {
  const biome = biomes.find((b) => b.id === biomeId)!;
  const input = biomeToInput(biome);
  const half = GRID / 2;
  const clusters = pickClusters(input.biomeId, seed, GRID, GRID, [1.5, 3.5], 2);
  const out: string[][] = [];
  for (let r = 0; r < GRID; r++) {
    const row: string[] = [];
    for (let c = 0; c < GRID; c++) {
      const tx = c - half;
      const ty = r - half;
      const cluster = clusterAt(tx, ty, clusters);
      const jittered = jitterInput(cluster ? cluster.input : input, tx, ty, seed);
      row.push(resolveStyle(jittered).surface.substrates[0]!.id);
    }
    out.push(row);
  }
  return out;
}

// Share of tiles that are a lone one-tile island of their substrate
// (4-connectivity), and the mean size of a same-substrate patch.
function patchStats(field: string[][]): { singleShare: number; meanPatch: number } {
  const seen = new Uint8Array(GRID * GRID);
  let singles = 0;
  let patches = 0;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (seen[r * GRID + c]) continue;
      const id = field[r]![c]!;
      const stack: Array<[number, number]> = [[c, r]];
      seen[r * GRID + c] = 1;
      let size = 0;
      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        size++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
          if (seen[ny * GRID + nx] === 1 || field[ny]![nx] !== id) continue;
          seen[ny * GRID + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      patches++;
      if (size === 1) singles++;
    }
  }
  return { singleShare: singles / (GRID * GRID), meanPatch: (GRID * GRID) / patches };
}

describe("jitterInput", () => {
  // Measured over every biome × 5 seeds at 16×16: white-noise jitter put 4.9%
  // of all tiles in a one-tile substrate island (11.6% in the worst biome) at a
  // mean patch of 10.3 tiles; the coherent field gives 0.7% / 30.0. The bounds
  // below leave room for retuning JITTER_CELLS without pinning the exact
  // numbers, while staying far enough from the old figures to fail outright if
  // the field ever goes back to being decided per tile.
  it("leaves substrate patches as lumps, not a chessboard of one-tile enclaves", () => {
    let singles = 0;
    let patchSum = 0;
    let n = 0;
    let worst = 0;
    for (const biome of biomes) {
      for (const seed of SEEDS) {
        const s = patchStats(substrateField(biome.id, seed));
        singles += s.singleShare;
        patchSum += s.meanPatch;
        n++;
      }
      const perBiome =
        SEEDS.reduce((a, seed) => a + patchStats(substrateField(biome.id, seed)).singleShare, 0) / SEEDS.length;
      worst = Math.max(worst, perBiome);
    }
    expect(singles / n).toBeLessThan(0.02);
    expect(worst).toBeLessThan(0.05);
    expect(patchSum / n).toBeGreaterThan(15);
  });

  it("varies smoothly between neighbours and fully between distant tiles", () => {
    const input = biomeToInput(biomes.find((b) => b.name === "Cold Desert")!);
    const t = (x: number, y: number) => jitterInput(input, x, y, 1232).temperature;
    let near = 0;
    let far = 0;
    for (let x = -20; x < 20; x++) {
      for (let y = -20; y < 20; y++) {
        near += Math.abs(t(x, y) - t(x + 1, y));
        far += Math.abs(t(x, y) - t(x + 17, y + 11));
      }
    }
    expect(near).toBeLessThan(far / 2);
  });

  it("rerolls with the seed, so a new roll is a new field", () => {
    const input = biomeToInput(biomes.find((b) => b.name === "Cold Desert")!);
    expect(jitterInput(input, 3, 4, 1232).temperature).not.toBe(jitterInput(input, 3, 4, 1233).temperature);
  });

  it("stays inside the band the thresholds are tuned against", () => {
    const input = biomeToInput(biomes.find((b) => b.name === "Cold Desert")!);
    for (let x = -40; x < 40; x++) {
      for (let y = -40; y < 40; y++) {
        const j = jitterInput(input, x, y, 5);
        expect(Math.abs(j.temperature - input.temperature)).toBeLessThanOrEqual(1.5 + 1e-9);
        expect(Math.abs(j.drainage - input.drainage)).toBeLessThanOrEqual(0.05 + 1e-9);
      }
    }
  });
});
