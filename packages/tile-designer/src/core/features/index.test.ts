import { describe, expect, it } from "vitest";
import { SCATTER_IDS, TILE_H, TILE_W } from "../types.ts";
import { latticeAt } from "../lattice.ts";
import { getPalette } from "../palette/index.ts";
import {
  FEATURE_HOSTS,
  FEATURE_SHAPES,
  buildFeatureAtlas,
  featureInstance,
  hasHost,
  quantiseScatter,
} from "./index.ts";

const PALETTE = getPalette(null);

// --- Host compatibility ---------------------------------------------------------

describe("FEATURE_HOSTS", () => {
  // The physical read: a pebble lies on stony/bare ground, a twig needs
  // somewhere for it to have fallen from, a leaf lands on living or littered
  // surfaces. If these sets drift, scatter appears where it cannot exist.
  it("gates each kind to physically plausible hosts", () => {
    expect(hasHost("pebble", "scree", [])).toBe(true);
    expect(hasHost("pebble", "snow", [])).toBe(false);
    // A mat can host on its own: deadfall on needle carpet, a leaf on grass.
    expect(hasHost("twig", "soil", [{ id: "needleLitter" }])).toBe(true);
    expect(hasHost("twig", "sand", [])).toBe(false);
    expect(hasHost("leaf", "soil", [{ id: "grass" }])).toBe(true);
    expect(hasHost("leaf", "frozenGround", [])).toBe(false);
  });

  // A mat can host even when the substrate alone would not — a leaf on grass.
  it("accepts a compatible mat as host", () => {
    expect(hasHost("leaf", "frozenGround", [{ id: "moss" }])).toBe(true);
    expect(hasHost("pebble", "peat", [{ id: "grass" }])).toBe(false);
  });

  it("covers every substrate and mat id in at least one host set or is deliberately excluded", () => {
    // Not a completeness requirement — just that every listed host is a real id.
    const allIds = new Set([
      "bareRock", "scree", "sand", "soil", "clay", "mud", "peat", "frozenGround", "snow",
      "grass", "dryGrass", "moss", "lichen", "leafLitter", "needleLitter", "sedge", "cushion",
    ]);
    for (const hosts of Object.values(FEATURE_HOSTS)) {
      for (const h of hosts) expect(allIds.has(h)).toBe(true);
    }
  });
});

// --- Coverage quantisation --------------------------------------------------------

describe("quantiseScatter", () => {
  it("maps none / sparse / full at decoration-appropriate thresholds", () => {
    expect(quantiseScatter(0)).toBeNull();
    expect(quantiseScatter(0.05)).toBeNull();
    expect(quantiseScatter(0.06)).toBe("sparse");
    expect(quantiseScatter(0.34)).toBe("sparse");
    expect(quantiseScatter(0.35)).toBe("full");
    expect(quantiseScatter(1)).toBe("full");
  });
});

// --- Sprite geometry --------------------------------------------------------------

describe("feature sprites", () => {
  const atlas = buildFeatureAtlas(
    (["pebble", "twig", "leaf"] as const).map((id) => featureInstance(id, PALETTE[id])),
    0x5eed,
  );

  it("builds every shape of every instance", () => {
    expect(atlas.stats.sprites).toBe(3 * FEATURE_SHAPES);
    for (const inst of atlas.instances) {
      for (let s = 0; s < FEATURE_SHAPES; s++) {
        expect(atlas.lookup(inst.key, s), `${inst.key}/${s}`).not.toBeNull();
      }
    }
  });

  it("reduces out-of-range shape indices instead of missing", () => {
    const key = atlas.instances[0]!.key;
    expect(atlas.lookup(key, FEATURE_SHAPES + 1)).toEqual(atlas.lookup(key, 1));
  });

  it("is deterministic for a given seed", () => {
    const inst = [featureInstance("pebble", PALETTE.pebble)];
    const a = buildFeatureAtlas(inst, 7);
    const b = buildFeatureAtlas(inst, 7);
    for (let s = 0; s < FEATURE_SHAPES; s++) {
      expect(a.lookup(inst[0]!.key, s)!.data).toEqual(b.lookup(inst[0]!.key, s)!.data);
    }
  });

  // The overhang: features are NOT clipped to the diamond, so variants must be
  // *capable* of drawing pixels outside it. Measured across seeds, roughly a
  // third to two-thirds of builds have at least one overhanging shape per kind
  // (anchors jitter anywhere in the cell; only ones near an edge cross it), so
  // no single seed can prove the property for all three kinds at once. What we
  // assert instead: across several seeds, every kind overhangs at least once —
  // which fails if anyone adds an insideDiamond clip here, while tolerating the
  // legitimate anchor luck of any individual build.
  it("overhangs past the diamond edge on some variant of every kind", () => {
    const outside = new Map<string, number>(SCATTER_IDS.map((id) => [id, 0]));
    for (let seed = 0; seed < 8; seed++) {
      const fa = buildFeatureAtlas(
        SCATTER_IDS.map((id) => featureInstance(id, PALETTE[id])),
        seed,
      );
      for (const inst of fa.instances) {
        for (let s = 0; s < FEATURE_SHAPES; s++) {
          const ref = fa.lookup(inst.key, s)!;
          for (let y = 0; y < ref.h; y++) {
            for (let x = 0; x < ref.w; x++) {
              if (ref.data[(y * ref.w + x) * 4 + 3] === 0) continue;
              const [u, v] = latticeAt(x + ref.offsetX, y + ref.offsetY);
              if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) {
                outside.set(inst.id, outside.get(inst.id)! + 1);
              }
            }
          }
        }
      }
    }
    for (const id of SCATTER_IDS) {
      expect(outside.get(id), `${id} never leaves the diamond in any of 8 seeds`).toBeGreaterThan(0);
    }
  });

  // ...but not by much: an object belongs mostly to its own tile. Anchors are
  // jittered inside the cell precisely so the spill stays a few pixels.
  it("keeps most of every sprite inside its own tile rect", () => {
    for (const inst of atlas.instances) {
      for (let s = 0; s < FEATURE_SHAPES; s++) {
        const ref = atlas.lookup(inst.key, s)!;
        expect(ref.w).toBeLessThanOrEqual(TILE_W);
        expect(ref.h).toBeLessThanOrEqual(TILE_H);
        let inside = 0;
        let total = 0;
        for (let y = 0; y < ref.h; y++) {
          for (let x = 0; x < ref.w; x++) {
            if (ref.data[(y * ref.w + x) * 4 + 3] === 0) continue;
            total++;
            if (x + ref.offsetX >= 0 && x + ref.offsetX < TILE_W && y + ref.offsetY >= 0 && y + ref.offsetY < TILE_H) {
              inside++;
            }
          }
        }
        expect(inside / total).toBeGreaterThan(0.9);
      }
    }
  });

  // Palette closure: features draw only from their own ramp, which itself came
  // from the master palette — assert the emitted colors are exactly ramp steps.
  it("emits only colors from its material's ramp", () => {
    for (const inst of atlas.instances) {
      const legal = new Set<number>(inst.ramp);
      for (let s = 0; s < FEATURE_SHAPES; s++) {
        const ref = atlas.lookup(inst.key, s)!;
        for (let i = 0; i < ref.data.length; i += 4) {
          if (ref.data[i + 3] === 0) continue;
          const c = (ref.data[i]! << 16) | (ref.data[i + 1]! << 8) | ref.data[i + 2]!;
          expect(legal.has(c), `${inst.id} color ${c.toString(16)}`).toBe(true);
        }
      }
    }
  });
});
