import { describe, expect, it } from "vitest";
import { MAT_IDS, SUBSTRATE_IDS, TILE_H, TILE_W, type MaterialId } from "./types.ts";
import { DEFAULT_BLOCKS, latticeAt } from "./lattice.ts";
import { rowSpan } from "./pixels.ts";
import { getPalette } from "./palette/index.ts";
import { MATERIAL_GENS, defaultCtx, type MaterialCtx } from "./materials/index.ts";

const PALETTE = getPalette(null);
const ALL = [...SUBSTRATE_IDS, ...MAT_IDS] as MaterialId[];

function ctxFor(id: MaterialId, over: Partial<MaterialCtx> = {}): MaterialCtx {
  // arid/wet are pushed high so the crack and sheen branches are exercised too —
  // a generator that only wraps on its quiet path is not actually periodic.
  return { ...defaultCtx(PALETTE[id], 0x5eed1234), arid: 0.7, wet: 0.6, ...over };
}

// Sampling on block *centres* rather than block edges is deliberate, for the
// reason lattice.test.ts already documents: `(u+1)·blocks` and `u·blocks +
// blocks` differ by an ULP, so a sample sitting exactly on a floor boundary can
// land in a different authoring block after a whole-period shift. Block centres
// are half a block away from every such boundary, which is eight orders of
// magnitude more slack than the error involved.
const BLOCK_CENTRES = (n: number) =>
  Array.from({ length: n }, (_, i) => (Math.floor((i / n) * DEFAULT_BLOCKS) + 0.5) / DEFAULT_BLOCKS);

describe("material generators are periodic in lattice space", () => {
  // This is the entire seamlessness mechanism: a variant tiles with copies of
  // itself invisibly only because its generator has period 1 in both axes.
  it.each(ALL)("%s wraps at period 1", (id) => {
    const c = ctxFor(id);
    const gen = MATERIAL_GENS[id as never] as (u: number, v: number, x: MaterialCtx) => number | null;
    let mismatches = 0;
    const samples = BLOCK_CENTRES(24);
    for (const u of samples) {
      for (const v of samples) {
        const base = gen(u, v, c);
        if (gen(u + 1, v, c) !== base) mismatches++;
        if (gen(u, v + 1, c) !== base) mismatches++;
        if (gen(u - 1, v + 1, c) !== base) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });
});

describe("material coverage", () => {
  const coverage = (id: MaterialId, c: MaterialCtx) => {
    const gen = MATERIAL_GENS[id as never] as (u: number, v: number, x: MaterialCtx) => number | null;
    let filled = 0;
    let total = 0;
    for (let y = 0; y < TILE_H; y++) {
      const [x0, x1] = rowSpan(y);
      for (let x = x0; x <= x1; x++) {
        const [u, v] = latticeAt(x, y);
        if (gen(u, v, c) !== null) filled++;
        total++;
      }
    }
    return filled / total;
  };

  // Substrates are the ground itself. If one ever returned null the cell would
  // show through to nothing, since it is usually the bottom of the stack.
  it.each(SUBSTRATE_IDS)("%s fills the whole cell", (id) => {
    expect(coverage(id, ctxFor(id))).toBe(1);
  });

  // Mats lie on the ground and must let it show through, or a covered cell reads
  // as one flat colour — the failure v1 spent two rounds of fixes on.
  it.each(MAT_IDS)("%s is sparser at the sparse density than at full", (id) => {
    const full = coverage(id, ctxFor(id, { density: 1 }));
    const sparse = coverage(id, ctxFor(id, { density: 0.55 }));
    expect(sparse).toBeLessThan(full);
    expect(sparse).toBeLessThan(0.9);
  });
});

describe("tonal range", () => {
  // The generators hand `resolveLatticeTone` a base field which it rounds onto a
  // 4-step ramp. If that field never crosses a rounding threshold, the material
  // emits exactly one colour and the only variation left is the ~3.5% accent —
  // a flat fill wearing a texture's clothes.
  //
  // Found in exactly that state when this milestone ported the generators:
  // sand, grass, dryGrass and sedge all sat at 96–98% on one colour because
  // their base was centred *on* a threshold rather than beside it, and mud and
  // peat were nearly as bad. tone.ts's stated intent is ~85% dominant / ~12% one
  // step off / ~3.5% accent, so anything above 90% means the field is not doing
  // its job. Measured range after the fix: 53–82%.
  it.each(ALL)("%s does not collapse onto a single colour", (id) => {
    const gen = MATERIAL_GENS[id as never] as (u: number, v: number, x: MaterialCtx) => number | null;
    const hist = new Map<number, number>();
    let total = 0;
    for (let shape = 0; shape < 4; shape++) {
      const c = ctxFor(id, { seed: 0x5eed1234 ^ ((shape + 1) * 0x9e3779b9) });
      for (let y = 0; y < TILE_H; y++) {
        const [x0, x1] = rowSpan(y);
        for (let x = x0; x <= x1; x++) {
          const [u, v] = latticeAt(x, y);
          const col = gen(u, v, c);
          if (col === null) continue;
          hist.set(col, (hist.get(col) ?? 0) + 1);
          total++;
        }
      }
    }
    const dominant = Math.max(...hist.values()) / total;
    expect(dominant).toBeLessThan(0.9);
  });
});

describe("threshold bias", () => {
  // Tone variation between cells has to come from re-mixing the light and dark
  // blocks, never from shifting every pixel a whole ramp step — PLAN.md's
  // "Decided" entry, and the trap v1 fell into twice. So a biased variant must
  // change the *proportions* while still using the same colours.
  it.each(SUBSTRATE_IDS)("%s shifts the mix without shifting every pixel", (id) => {
    const gen = MATERIAL_GENS[id as never] as (u: number, v: number, x: MaterialCtx) => number | null;
    const sample = (bias: number) => {
      const c = ctxFor(id, { bias });
      const out: Array<number | null> = [];
      for (let y = 0; y < TILE_H; y += 2) {
        const [x0, x1] = rowSpan(y);
        for (let x = x0; x <= x1; x += 2) {
          const [u, v] = latticeAt(x, y);
          out.push(gen(u, v, c));
        }
      }
      return out;
    };
    const flat = sample(0);
    const lifted = sample(0.18);
    const changed = flat.reduce((n: number, c, i) => n + (c === lifted[i] ? 0 : 1), 0);
    // Some pixels must move, or the bias axis is dead weight in the atlas...
    expect(changed).toBeGreaterThan(flat.length * 0.01);
    // ...but most must not, or it is a flat brightness step and every cell
    // becomes a visibly distinct diamond.
    expect(changed).toBeLessThan(flat.length * 0.5);
  });
});
