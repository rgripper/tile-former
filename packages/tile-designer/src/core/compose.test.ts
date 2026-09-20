import { describe, expect, it } from "vitest";
import {
  biasIndex,
  cellOrigin,
  compareInstances,
  composeCell,
  composeField,
  featuresForTile,
  fieldFeatureInstances,
  fieldMaterials,
  makeField,
  shapeIndex,
  tileSurface,
  type TileSurface,
} from "./compose.ts";
import { materialInstance } from "./materials/index.ts";
import { buildAtlas } from "./atlas.ts";
import { getPalette } from "./palette/index.ts";
import { CLIFF_UNIT, TILE_H, TILE_W, type Density } from "./types.ts";
import { CODE_FULL } from "./masks.ts";
import { insideDiamond, rowSpan } from "./pixels.ts";

const PALETTE = getPalette(null);

// A synthetic tile: real biomes always carry a substrate, so tests only vary
// what's needed to exercise one rule at a time.
function surface(
  substrateId: "sand" | "clay" | "soil" | "scree" | "snow",
  mats: Array<{ id: "grass" | "moss"; density: Density }> = [],
  level = 0,
): TileSurface {
  return {
    substrate: materialInstance(substrateId, PALETTE[substrateId], 0, 0),
    mats: mats.map((m) => ({ instance: materialInstance(m.id, PALETTE[m.id], 0, 0), density: m.density })),
    scatter: [],
    level,
  };
}

// --- Instance ordering ---------------------------------------------------------

describe("compareInstances", () => {
  it("orders by MATERIAL_PRIORITY (sand < clay < soil, substrates < mats)", () => {
    const sand = materialInstance("sand", PALETTE.sand, 0, 0);
    const clay = materialInstance("clay", PALETTE.clay, 0, 0);
    const soil = materialInstance("soil", PALETTE.soil, 0, 0);
    const grass = materialInstance("grass", PALETTE.grass, 0, 0);
    expect(compareInstances(sand, clay)).toBeLessThan(0);
    expect(compareInstances(clay, soil)).toBeLessThan(0);
    expect(compareInstances(soil, grass)).toBeLessThan(0);
  });

  // Two instances of one id (a biome override or climate tint gives grass a
  // different ramp) must still order consistently across every cell of the map,
  // or substrate nesting stops nesting — see compose.ts's note on this.
  it("breaks ties between same-id instances by key, not by object identity", () => {
    const a = materialInstance("grass", PALETTE.grass, 0, 0);
    const b = materialInstance("grass", [...PALETTE.grass].reverse() as typeof PALETTE.grass, 0, 0);
    expect(a.key).not.toBe(b.key);
    const order1 = compareInstances(a, b);
    const order2 = compareInstances(a, materialInstance("grass", PALETTE.grass, 0, 0));
    expect(order1).not.toBe(0);
    expect(order2).toBe(0);
  });
});

// --- Substrate nesting ----------------------------------------------------------

describe("substrate nesting", () => {
  it("draws a single substrate as the full cell", () => {
    const field = makeField(2, 2, () => surface("sand"));
    const sprites = composeCell(field, atlasFor(field), 0, 0, { seed: 1 });
    const subs = sprites.filter((s) => s.id === "sand");
    expect(subs).toHaveLength(1);
    expect(subs[0]!.code).toBe(CODE_FULL);
  });

  // Corners 2,3 (bottom half) are soil, corners 0,1 (top half) are sand. Soil
  // outranks sand, so: sand must get the *whole* cell (nothing may peek through
  // underneath it), and soil gets exactly its own two corners.
  it("gives the lower-ranked substrate the whole cell and the higher one only its own corners", () => {
    const field = makeField(2, 2, (c, r) => surface(r === 0 ? "sand" : "soil"));
    const sprites = composeCell(field, atlasFor(field), 0, 0, { seed: 1 });
    const sand = sprites.find((s) => s.id === "sand")!;
    const soil = sprites.find((s) => s.id === "soil")!;
    expect(sand.code).toBe(CODE_FULL);
    expect(soil.code).toBe(0b1100); // corners 2,3
  });
});

// --- Mats: additive, not nested ---------------------------------------------------

describe("mat stacking", () => {
  it("draws a mat only where it is actually present, independent of the substrate code", () => {
    // grass only at corner 0 (tile (0,0)); every other corner has no mats.
    const field = makeField(2, 2, (c, r) =>
      surface("sand", c === 0 && r === 0 ? [{ id: "grass", density: "full" }] : []),
    );
    const sprites = composeCell(field, atlasFor(field), 0, 0, { seed: 1 });
    const grass = sprites.filter((s) => s.id === "grass");
    expect(grass).toHaveLength(1);
    expect(grass[0]!.code).toBe(0b0001);
  });

  // sparse and full are separate stack entries (types.ts, "Quantised
  // coverage"), so one mat split sparse/full across two corners must emit two
  // independent sprites, never one OR'd or nested code.
  it("keeps sparse and full as separate, unmerged codes", () => {
    const field = makeField(2, 2, (c, r) => {
      if (c === 0 && r === 0) return surface("sand", [{ id: "grass", density: "sparse" }]);
      if (c === 1 && r === 0) return surface("sand", [{ id: "grass", density: "full" }]);
      return surface("sand");
    });
    const sprites = composeCell(field, atlasFor(field), 0, 0, { seed: 1 });
    const grass = sprites.filter((s) => s.id === "grass");
    expect(grass).toHaveLength(2);
    const sparse = grass.find((s) => s.density === "sparse")!;
    const full = grass.find((s) => s.density === "full")!;
    expect(sparse.code).toBe(0b0001);
    expect(full.code).toBe(0b0010);
  });
});

// --- Altitude: bitwise AND over levels -------------------------------------------

describe("altitude", () => {
  // Corners 0,1 (top row) at level 0; corners 2,3 (bottom row) at level 1. The
  // cell must render as two passes, each gated to its own level's corners and
  // offset by exactly one CLIFF_UNIT.
  it("renders one pass per distinct floor level, offset and corner-gated", () => {
    const field = makeField(2, 2, (c, r) => surface(r === 0 ? "sand" : "soil", [], r));
    const sprites = composeCell(field, atlasFor(field), 0, 0, { seed: 1 });
    const sand = sprites.find((s) => s.id === "sand")!;
    const soil = sprites.find((s) => s.id === "soil")!;
    expect(sand.level).toBe(0);
    expect(soil.level).toBe(1);
    // Each is the sole substrate at its level, so within that level's pass it
    // nests to "every corner present at this level" — not the whole cell, since
    // only 2 of the 4 corners belong to either level.
    expect(sand.code).toBe(0b0011); // corners 0,1 (top row, level 0)
    expect(soil.code).toBe(0b1100); // corners 2,3 (bottom row, level 1)
    expect(soil.y).toBe(sand.y - CLIFF_UNIT);
  });

  // A level boundary is not a material boundary: the cliff face of the tile
  // above stands behind it, so an organic overhang there lands on the wall
  // rather than on more ground. `clip` is what stops it — the hard nominal
  // footprint of "corners at or below this sprite's level" (compose.ts, "Spill
  // runs downhill"), and CODE_FULL, i.e. no clip, wherever nothing is uphill.
  it("clips a straddling cell's lower level to its own footprint and leaves the top level free", () => {
    const field = makeField(2, 2, (c, r) => surface(r === 0 ? "sand" : "soil", [], r));
    const sprites = composeCell(field, atlasFor(field), 0, 0, { seed: 1 });
    const lower = sprites.find((s) => s.level === 0)!;
    const upper = sprites.find((s) => s.level === 1)!;
    // Corners 0,1 are level 0 and 2,3 are level 1, so the level-0 pass may not
    // spill past corners 0,1 — uphill is where the wall is.
    expect(lower.clip).toBe(0b0011);
    // Nothing is above the top level, so it keeps its overhang: the lip over
    // the face is the one spill across a level boundary that is wanted.
    expect(upper.clip).toBe(CODE_FULL);
  });

  it("clips nothing at all in a cell that does not straddle", () => {
    const field = makeField(2, 2, (c) => surface(c === 0 ? "sand" : "soil", [], 3));
    const sprites = composeCell(field, atlasFor(field), 0, 0, { seed: 1 });
    expect(sprites.length).toBeGreaterThan(1); // a real material boundary...
    expect(sprites.every((s) => s.clip === CODE_FULL)).toBe(true); // ...and it still spills
  });

  it("lets a middle level spill downhill but not uphill", () => {
    const field = makeField(2, 2, (c, r) => surface("sand", [], c === 0 && r === 0 ? 0 : c + r));
    const sprites = composeCell(field, atlasFor(field), 0, 0, { seed: 1 });
    const byLevel = new Map(sprites.map((s) => [s.level, s.clip]));
    expect(byLevel.get(0)).toBe(0b0001); // corner 0 only: everything else is uphill
    expect(byLevel.get(1)).toBe(0b0111); // corners 1,2, plus corner 0 below them
    expect(byLevel.get(2)).toBe(CODE_FULL); // top level: free
  });

  it("handles more than two straddling levels (never observed on real maps, but the AND is general)", () => {
    const field = makeField(2, 2, (c, r) => {
      if (c === 0 && r === 0) return surface("sand", [], 0);
      if (c === 1 && r === 0) return surface("sand", [], 1);
      if (c === 0 && r === 1) return surface("sand", [], 2);
      return surface("sand", [], 2);
    });
    const sprites = composeCell(field, atlasFor(field), 0, 0, { seed: 1 });
    const levels = new Set(sprites.map((s) => s.level));
    expect(levels).toEqual(new Set([0, 1, 2]));
    for (const s of sprites) {
      // Level 0 and level 1 each have exactly one corner, level 2 has two
      // adjacent corners (2,3) → code 0b1100.
      if (s.level === 2) expect(s.code).toBe(0b1100);
      else expect([0b0001, 0b0010]).toContain(s.code);
    }
  });
});

// --- Fringe handling --------------------------------------------------------------

describe("makeField", () => {
  it("clamps the fringe row/column to the nearest real tile instead of inventing a boundary", () => {
    const field = makeField(2, 2, (c, r) => surface(c === 0 ? "sand" : "clay"));
    // Dual cell (-1, 0)'s corners are tiles (-1,0),(0,0),(-1,1),(0,1); clamped,
    // all four resolve to column 0 → uniformly "sand", so only one substrate
    // sprite should be drawn, at the full code.
    const sprites = composeCell(field, atlasFor(field), -1, 0, { seed: 1 });
    expect(sprites.every((s) => s.id === "sand")).toBe(true);
    expect(sprites).toHaveLength(1);
    expect(sprites[0]!.code).toBe(CODE_FULL);
  });
});

// --- Variant indices ---------------------------------------------------------------

describe("shape and bias indices", () => {
  it("reduces to 0 when only one variant exists", () => {
    expect(shapeIndex(3, 5, 1, "grass|abc|0|0", 1)).toBe(0);
    expect(biasIndex(3, 5, 1, 1)).toBe(0);
  });

  it("stays in range and varies across cells", () => {
    const seen = new Set<number>();
    for (let c = 0; c < 20; c++) seen.add(shapeIndex(c, 0, 1, "grass|abc|0|0", 8));
    for (const s of seen) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(8);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  // Bias is a *low-frequency* field over tile coordinates (PLAN.md, "Decided"):
  // neighbouring cells should usually agree, not flip independently every cell.
  it("mostly agrees between adjacent cells (low-frequency, not per-cell noise)", () => {
    let agree = 0;
    let total = 0;
    for (let c = 0; c < 30; c++) {
      const a = biasIndex(c, 0, 42, 3);
      const b = biasIndex(c + 1, 0, 42, 3);
      total++;
      if (a === b) agree++;
    }
    expect(agree / total).toBeGreaterThan(0.5);
  });
});

// --- Integration: real atlas, no interior gaps -----------------------------------

describe("composeField against a real atlas", () => {
  it("builds only the density levels the field actually uses", () => {
    const field = makeField(3, 3, (c, r) =>
      surface("sand", c === 1 && r === 1 ? [{ id: "grass", density: "sparse" }] : [{ id: "grass", density: "full" }]),
    );
    const requests = fieldMaterials(field);
    const grass = requests.find((r) => r.id === "grass")!;
    expect(new Set(grass.densities)).toEqual(new Set(["sparse", "full"]));
    const sand = requests.find((r) => r.id === "sand")!;
    expect(sand.densities).toEqual(["full"]);
  });

  // The concrete form of "nothing can peek through underneath" (masks.ts):
  // every dual cell that does not straddle an altitude line must be fully
  // opaque once its sprites are composited, because the lowest-ranked
  // substrate present always nests to the full cell.
  it("leaves no interior gaps in a mixed, non-straddling field", () => {
    const ids = ["sand", "clay", "soil"] as const;
    const field = makeField(6, 6, (c, r) => surface(ids[(c + r * 2) % 3]!, [{ id: "grass", density: (c + r) % 2 === 0 ? "sparse" : "full" }]));
    const atlas = buildAtlas(fieldMaterials(field), { seed: 7, fullShapes: 3, biasLevels: 1, partialShapes: 2 });
    const sprites = composeField(field, atlas, { seed: 7 });

    const W = 6 * TILE_W;
    const H = 6 * TILE_H + TILE_H;
    const covered = new Uint8Array(W * H);
    for (const s of sprites) {
      // Not a skip-if-missing: every sprite the compositor emits must exist in
      // the atlas its own `fieldMaterials` requested. A key or density the
      // atlas never built would otherwise vanish silently here, since the gap
      // check below is satisfied by substrate nesting alone.
      const ref = atlas.lookup(s.key, s.density, s.code, s.shape, s.bias);
      expect(ref, `${s.key}/${s.density}/${s.code}`).not.toBeNull();
      if (ref === null) continue;
      const page = atlas.pages[ref.page]!;
      for (let y = 0; y < ref.h; y++) {
        const py = s.y + ref.offsetY + y + TILE_H; // shift into a positive buffer
        if (py < 0 || py >= H) continue;
        for (let x = 0; x < ref.w; x++) {
          const so = ((ref.y + y) * page.width + ref.x + x) * 4;
          if (page.data[so + 3] === 0) continue;
          const px = s.x + ref.offsetX + x + TILE_W; // one cell of margin
          if (px < 0 || px >= W) continue;
          covered[py * W + px] = 1;
        }
      }
    }

    // Check full interior coverage of one representative, fully-interior dual
    // cell (2,2): every diamond pixel must have been painted by some sprite.
    const [ox, oy] = cellOrigin(2, 2, 0);
    let gaps = 0;
    for (let y = 0; y < TILE_H; y++) {
      const [x0, x1] = rowSpan(y);
      for (let x = x0; x <= x1; x++) {
        if (!insideDiamond(x, y)) continue;
        const px = ox + x + TILE_W;
        const py = oy + y + TILE_H;
        if (covered[py * W + px] !== 1) gaps++;
      }
    }
    expect(gaps).toBe(0);
  });
});

function atlasFor(field: ReturnType<typeof makeField>) {
  return buildAtlas(fieldMaterials(field), { seed: 1, fullShapes: 2, biasLevels: 1, partialShapes: 2 });
}

// --- Feature placement (milestone F) ---------------------------------------------

describe("featuresForTile", () => {
  // A surface with pebble-bearing substrate and a full scatter density.
  function surfaceWithScatter(): TileSurface {
    const base = surface("scree");
    return {
      ...base,
      scatter: [{ inst: { id: "pebble", key: "pebble|test", ramp: PALETTE.pebble }, density: "full" }],
    };
  }

  it("is deterministic per (tile, seed)", () => {
    const s = surfaceWithScatter();
    expect(featuresForTile(s, 3, 4, 99)).toEqual(featuresForTile(s, 3, 4, 99));
  });

  it("places at most one feature per (kind, density) on a tile", () => {
    const s = surfaceWithScatter();
    for (let seed = 0; seed < 8; seed++) {
      const placed = featuresForTile(s, 2, 2, seed);
      const keys = placed.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  // Sparse is a probability gate on the same hash as full, so every sparse
  // placement must be a subset of what full would show — not a different set.
  it("makes sparse placements a subset of full", () => {
    let subsetSeen = false;
    for (let c = 0; c < 12; c++) {
      for (let r = 0; r < 12; r++) {
        const full = featuresForTile({ ...surfaceWithScatter(), scatter: [{ inst: { id: "pebble", key: "pebble|test", ramp: PALETTE.pebble }, density: "full" }] }, c, r, 5);
        const sparse = featuresForTile({ ...surfaceWithScatter(), scatter: [{ inst: { id: "pebble", key: "pebble|test", ramp: PALETTE.pebble }, density: "sparse" }] }, c, r, 5);
        if (sparse.length === 0) continue;
        expect(full.length).toBeGreaterThan(0);
        subsetSeen = true;
      }
    }
    expect(subsetSeen).toBe(true);
  });

  it("positions features at their host tile's origin", () => {
    const s = surfaceWithScatter();
    for (let seed = 0; seed < 6; seed++) {
      for (const f of featuresForTile(s, 1, 2, seed)) {
        const [ox, oy] = cellOrigin(1, 2, s.level);
        expect(f.x).toBe(ox);
        expect(f.y).toBe(oy - TILE_H / 2); // tileOrigin shifts up half a tile
      }
    }
  });
});

describe("fieldFeatureInstances", () => {
  it("unions instances by key across the field", () => {
    const mk = (key: string) => ({ inst: { id: "pebble" as const, key, ramp: PALETTE.pebble }, density: "full" as const });
    const field = makeField(3, 3, (c) => ({
      ...surface("scree"),
      scatter: [mk(c === 0 ? "pebble|a" : "pebble|b")],
    }));
    const instances = fieldFeatureInstances(field);
    expect(instances.map((i) => i.key).sort()).toEqual(["pebble|a", "pebble|b"]);
  });
});

describe("tileSurface scatter gating", () => {
  // Host compatibility end-to-end through resolveStyle's output: a scree tile
  // hosts pebbles; a snow tile with no compatible mats hosts nothing.
  it("gates scatter by host material", () => {
    const screeStyle = {
      water: false,
      surface: { substrates: [{ id: "scree" as const, weight: 1 }], mats: [] },
      substrateRamps: { scree: PALETTE.scree },
      matRamps: {},
      texture: { arid: 0, wet: 0 },
      staticScatter: { pebble: 0.8, twig: 0.8, leaf: 0.8 },
      scatterRamps: { pebble: PALETTE.pebble, twig: PALETTE.twig, leaf: PALETTE.leaf },
      scatter: { fern: 0, reed: 0, flower: 0 },
    };
    const scree = tileSurface(screeStyle, 0);
    expect(scree.scatter.map((s) => s.inst.id)).toEqual(["pebble"]);

    const snowStyle = { ...screeStyle, surface: { substrates: [{ id: "snow" as const, weight: 1 }], mats: [] }, substrateRamps: { snow: PALETTE.snow } };
    expect(tileSurface(snowStyle, 0).scatter).toEqual([]);
  });
});
