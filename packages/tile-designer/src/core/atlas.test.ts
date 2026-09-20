import { describe, expect, it } from "vitest";
import { DENSITIES, TILE_H, TILE_W } from "./types.ts";
import { insideDiamond } from "./pixels.ts";
import { CODE_EMPTY, CODE_FULL, MASK_CODES } from "./masks.ts";
import { getPalette } from "./palette/index.ts";
import { materialInstance } from "./materials/index.ts";
import { resolveStyle } from "./resolve.ts";
import { biomeToInput } from "./biomeInput.ts";
import { biomes } from "@tile-former/tilegen";
import {
  buildAtlas,
  materialsFromStyle,
  type Atlas,
  type MaterialRequest,
  type SpriteRef,
} from "./atlas.ts";

const PALETTE = getPalette(null);

const REQUESTS: MaterialRequest[] = [
  { ...materialInstance("soil", PALETTE.soil, 0.4, 0.3), densities: ["full"] },
  { ...materialInstance("grass", PALETTE.grass, 0.4, 0.3), densities: [...DENSITIES] },
];

const SOIL = REQUESTS[0]!.key;

// One shared build — it is the expensive fixture in this file.
const atlas: Atlas = buildAtlas(REQUESTS, { seed: 99, pageSize: 1024 });

const alphaAt = (a: Atlas, ref: SpriteRef, x: number, y: number): number =>
  a.pages[ref.page]!.data[((ref.y + y) * a.pages[ref.page]!.width + ref.x + x) * 4 + 3]!;

describe("atlas lookup", () => {
  it("has a sprite for every code, shape and bias of every requested material", () => {
    for (const req of REQUESTS) {
      for (const density of req.densities) {
        for (let code = 1; code < MASK_CODES; code++) {
          for (let shape = 0; shape < atlas.shapeCount(code); shape++) {
            for (let bias = 0; bias < atlas.biasCount(code); bias++) {
              expect(
                atlas.lookup(req.key, density, code, shape, bias),
                `${req.id}/${density}/${code}/${shape}/${bias}`,
              ).not.toBeNull();
            }
          }
        }
      }
    }
  });

  it("has nothing for the empty code", () => {
    expect(atlas.lookup(SOIL, "full", CODE_EMPTY, 0, 0)).toBeNull();
    expect(atlas.shapeCount(CODE_EMPTY)).toBe(0);
  });

  // The compositor picks a shape from a hash and a bias from a spatial field
  // without knowing how many the atlas built for that code, so out-of-range
  // indices have to reduce rather than miss.
  it("reduces out-of-range shape and bias indices", () => {
    const base = atlas.lookup(SOIL, "full", CODE_FULL, 2, 1);
    expect(atlas.lookup(SOIL, "full", CODE_FULL, 2 + atlas.shapeCount(CODE_FULL), 1)).toEqual(base);
    expect(atlas.lookup(SOIL, "full", CODE_FULL, 2, 1 + atlas.biasCount(CODE_FULL))).toEqual(base);
    // Partial codes carry fewer variants than full ones; a compositor index
    // meant for a full cell must still land somewhere.
    expect(atlas.lookup(SOIL, "full", 7, atlas.shapeCount(CODE_FULL) - 1, 2)).not.toBeNull();
  });
});

describe("sprite geometry", () => {
  it("keeps every cropped sprite inside the cell rect", () => {
    for (const req of REQUESTS) {
      for (const density of req.densities) {
        for (let code = 1; code < MASK_CODES; code++) {
          for (let shape = 0; shape < atlas.shapeCount(code); shape++) {
            const ref = atlas.lookup(req.key, density, code, shape, 0)!;
            expect(ref.offsetX).toBeGreaterThanOrEqual(0);
            expect(ref.offsetY).toBeGreaterThanOrEqual(0);
            expect(ref.offsetX + ref.w).toBeLessThanOrEqual(TILE_W);
            expect(ref.offsetY + ref.h).toBeLessThanOrEqual(TILE_H);
          }
        }
      }
    }
  });

  // A substrate at code 15 is the bottom of the stack in most cells. If it were
  // anything other than the exact diamond, either a gap would open at a cell
  // edge or the sprite would bleed into its neighbour.
  //
  // Note the diamond's own bounding box is 62×32 at x = 1, not the full 64×32
  // rect: `rowSpan` never yields x = 0 or x = 63, because with TILE_H = 32 no
  // pixel row falls exactly on the horizontal axis. Derived here rather than
  // hardcoded so it stays right if the tile size changes.
  it("makes a full-cell substrate exactly the diamond", () => {
    let minX = TILE_W;
    let maxX = -1;
    let minY = TILE_H;
    let maxY = -1;
    for (let y = 0; y < TILE_H; y++) {
      for (let x = 0; x < TILE_W; x++) {
        if (!insideDiamond(x, y)) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    const ref = atlas.lookup(SOIL, "full", CODE_FULL, 0, 1)!;
    expect([ref.offsetX, ref.offsetY, ref.w, ref.h]).toEqual([minX, minY, maxX - minX + 1, maxY - minY + 1]);
    let mismatches = 0;
    for (let y = 0; y < ref.h; y++) {
      for (let x = 0; x < ref.w; x++) {
        if ((alphaAt(atlas, ref, x, y) > 0) !== insideDiamond(x + ref.offsetX, y + ref.offsetY)) {
          mismatches++;
        }
      }
    }
    expect(mismatches).toBe(0);
  });

  // Cropping is what keeps partial codes cheap. It is worth being precise about
  // how much it buys, because it is easy to overrate: a full-cell sprite's box
  // is the whole diamond and saves nothing, so the win comes only from the 14
  // partial codes. Measured over a representative spec: a single-corner box is
  // 33% of a full cell's, and the partial codes together are ~55% of what they
  // would cost stored as uncropped rects. (Not lower, because the four
  // three-corner codes span the full rect in both axes and so barely crop at
  // all — the win is concentrated in the single- and two-corner codes.)
  //
  // This is deliberately measured over the partial codes alone rather than over
  // the whole atlas. An atlas-wide ratio is a function of the *shape mix*, not
  // of cropping: raising `fullShapes` adds only sprites that cannot crop, so it
  // dilutes the aggregate figure without cropping having got any worse. The
  // earlier atlas-wide bound of 0.8 silently encoded `fullShapes: 8` and broke
  // when the default moved to 16 (partial codes fell from 54% to 37% of the
  // atlas), which is the failure this phrasing avoids.
  it("crops partial codes well below the full cell", () => {
    const oneCorner = atlas.lookup(SOIL, "full", 1, 0, 0)!;
    const fullCell = atlas.lookup(SOIL, "full", CODE_FULL, 0, 0)!;
    expect(oneCorner.w * oneCorner.h).toBeLessThan(fullCell.w * fullCell.h * 0.4);

    let cropped = 0;
    let uncropped = 0;
    for (const req of REQUESTS) {
      for (const density of req.densities) {
        for (let code = 1; code < CODE_FULL; code++) {
          for (let shape = 0; shape < atlas.shapeCount(code); shape++) {
            const ref = atlas.lookup(req.key, density, code, shape, 0);
            if (ref === null) continue;
            cropped += ref.w * ref.h;
            uncropped += TILE_W * TILE_H;
          }
        }
      }
    }
    expect(uncropped).toBeGreaterThan(0);
    expect(cropped).toBeLessThan(uncropped * 0.6);
  });
});

describe("atlas build", () => {
  // Golden-ish: the whole point of an atlas is that the world is drawn from it,
  // so two builds of the same spec differing would mean tiles change under a
  // reload.
  it("is deterministic", () => {
    const a = buildAtlas(REQUESTS, { seed: 99, pageSize: 1024 });
    const b = buildAtlas(REQUESTS, { seed: 99, pageSize: 1024 });
    expect(a.pages.length).toBe(b.pages.length);
    for (let p = 0; p < a.pages.length; p++) {
      expect(Buffer.from(a.pages[p]!.data.buffer).equals(Buffer.from(b.pages[p]!.data.buffer))).toBe(true);
    }
  });

  it("varies with the seed", () => {
    const other = buildAtlas(REQUESTS, { seed: 100, pageSize: 1024 });
    const a = atlas.pages[0]!.data;
    const b = other.pages[0]!.data;
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(false);
  });

  it("packs sprites without overlapping", () => {
    const claimed: Array<Uint8Array> = atlas.pages.map(
      (p) => new Uint8Array(p.width * p.height),
    );
    let overlaps = 0;
    for (const req of REQUESTS) {
      for (const density of req.densities) {
        for (let code = 1; code < MASK_CODES; code++) {
          for (let shape = 0; shape < atlas.shapeCount(code); shape++) {
            for (let bias = 0; bias < atlas.biasCount(code); bias++) {
              const ref = atlas.lookup(req.key, density, code, shape, bias)!;
              const page = claimed[ref.page]!;
              const w = atlas.pages[ref.page]!.width;
              for (let y = 0; y < ref.h; y++) {
                for (let x = 0; x < ref.w; x++) {
                  const o = (ref.y + y) * w + ref.x + x;
                  if (page[o]! > 0) overlaps++;
                  page[o] = 1;
                }
              }
            }
          }
        }
      }
    }
    expect(overlaps).toBe(0);
  });
});

describe("materialsFromStyle", () => {
  it("merges substrates and mats into one request list, with densities only on the mats", () => {
    // A real biome rather than a synthetic input, so the shape of what resolve.ts
    // actually emits is what gets checked.
    const style = resolveStyle(biomeToInput(biomes[0]!));
    const requests = materialsFromStyle(style);
    expect(requests.length).toBe(style.surface.substrates.length + style.surface.mats.length);
    for (const s of style.surface.substrates) {
      expect(requests.find((r) => r.id === s.id)!.densities).toEqual(["full"]);
    }
    for (const m of style.surface.mats) {
      expect(requests.find((r) => r.id === m.id)!.densities).toEqual([...DENSITIES]);
    }
    // Every request must carry a real ramp — a missing one would throw during
    // the build rather than here, long after the cause.
    for (const r of requests) expect(r.ramp.length).toBe(4);
  });
});
