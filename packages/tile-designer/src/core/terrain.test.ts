import { describe, expect, it } from "vitest";
import { cellOrigin, featuresForTile, fieldMaterials, makeField, type TileSurface } from "./compose.ts";
import { CORNER_TILE_OFFSETS } from "./masks.ts";
import { materialInstance } from "./materials/index.ts";
import { buildFeatureAtlas, featureInstance } from "./features/index.ts";
import { buildAtlas } from "./atlas.ts";
import { getPalette } from "./palette/index.ts";
import { drawLine, fillPolygon, insideDiamond, makeBuffer, rowSpan, type PixelBuffer } from "./pixels.ts";
import { MAX_FLOORS, TILE_H, TILE_W } from "./types.ts";
import {
  CLIFF_LEFT_SHADE,
  CLIFF_RIGHT_SHADE,
  darken,
  defaultLevelFrequency,
  RIM_COLOR,
  renderTerrain,
  straddleFraction,
  terrainLevel,
  tileOrigin,
} from "./terrain.ts";

const PALETTE = getPalette(null);

function surface(substrateId: "sand" | "clay" | "soil" | "scree", level = 0): TileSurface {
  return { substrate: materialInstance(substrateId, PALETTE[substrateId], 0, 0), mats: [], scatter: [], level };
}

const opaqueAt = (buf: PixelBuffer, x: number, y: number) => buf.data[(y * buf.width + x) * 4 + 3] === 255;

// Exact-match pixel count for a packed 0xRRGGBB color, scanning the whole
// buffer. Used instead of pinpointing a coordinate by hand: two independent
// grids (tiles for walls/rims, dual cells for floor sprites, offset from each
// other by half a tile — see terrain.ts's file header) can legitimately
// occlude one another at a shared screen point, so asserting presence
// somewhere is the robust check, not asserting an exact coordinate.
function countColor(buf: PixelBuffer, color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  let count = 0;
  for (let i = 0; i < buf.data.length; i += 4) {
    if (buf.data[i] === r && buf.data[i + 1] === g && buf.data[i + 2] === b && buf.data[i + 3] === 255) count++;
  }
  return count;
}

// --- Raster primitives ---------------------------------------------------------

describe("fillPolygon", () => {
  it("fills exactly the interior of an axis-aligned rectangle", () => {
    const buf = makeBuffer(10, 10);
    fillPolygon(
      buf,
      [
        [2, 2],
        [7, 2],
        [7, 6],
        [2, 6],
      ],
      0xff0000,
    );
    let count = 0;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const inside = x >= 2 && x < 7 && y >= 2 && y < 6;
        expect(opaqueAt(buf, x, y)).toBe(inside);
        if (inside) count++;
      }
    }
    expect(count).toBe(5 * 4);
  });
});

describe("drawLine", () => {
  it("draws a continuous 1px path including both endpoints", () => {
    const buf = makeBuffer(20, 20);
    drawLine(buf, 1, 1, 10, 6, 0x123456);
    expect(opaqueAt(buf, 1, 1)).toBe(true);
    expect(opaqueAt(buf, 10, 6)).toBe(true);
    // Every column between the endpoints must have at least one painted pixel,
    // or the line has a gap.
    for (let x = 1; x <= 10; x++) {
      let hit = false;
      for (let y = 0; y < 20; y++) if (opaqueAt(buf, x, y)) hit = true;
      expect(hit).toBe(true);
    }
  });
});

// --- Tile/dual-cell geometry -----------------------------------------------------

describe("tileOrigin", () => {
  it("is cellOrigin shifted up by half a tile, at every level", () => {
    for (const level of [0, 1, 5]) {
      for (const [c, r] of [
        [0, 0],
        [3, 2],
        [-1, 4],
      ] as const) {
        const [cx, cy] = cellOrigin(c, r, level);
        const [tx, ty] = tileOrigin(c, r, level);
        expect(tx).toBe(cx);
        expect(ty).toBe(cy - TILE_H / 2);
      }
    }
  });
});

// --- Synthetic altitude field ---------------------------------------------------

describe("terrainLevel", () => {
  it("stays within [0, MAX_FLOORS]", () => {
    for (let c = 0; c < 40; c++) {
      for (let r = 0; r < 40; r++) {
        const level = terrainLevel(c, r, 7, 5, 3, 0.05);
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(MAX_FLOORS);
      }
    }
  });

  it("forms coherent plateaus, not per-tile noise: most adjacent tiles agree", () => {
    let agree = 0;
    let total = 0;
    const freq = defaultLevelFrequency(24);
    for (let c = 0; c < 23; c++) {
      const a = terrainLevel(c, 5, 3, 3, 2, freq);
      const b = terrainLevel(c + 1, 5, 3, 3, 2, freq);
      total++;
      if (a === b) agree++;
    }
    expect(agree / total).toBeGreaterThan(0.5);
  });

  it("relief 0 collapses to a flat field at the base level", () => {
    for (let c = 0; c < 10; c++) {
      expect(terrainLevel(c, c, 9, 4, 0, 0.1)).toBe(4);
    }
  });
});

describe("straddleFraction", () => {
  it("is 0 for a flat field and 1 when every interior cell straddles", () => {
    const flat = makeField(4, 4, () => surface("sand", 2));
    expect(straddleFraction(flat)).toBe(0);

    // Checkerboard of two levels: every 2x2 corner group contains both.
    const checker = makeField(4, 4, (c, r) => surface("sand", (c + r) % 2));
    expect(straddleFraction(checker)).toBe(1);
  });

  it("matches a hand-counted fraction on a mixed field", () => {
    // Levels: row 0 -> 0, rows 1-3 -> 1. Of the 3x3 interior dual cells, only
    // the top row (whose corners span tile rows 0 and 1) straddles.
    const field = makeField(4, 4, (_c, r) => surface("sand", r === 0 ? 0 : 1));
    expect(straddleFraction(field)).toBeCloseTo(3 / 9, 10);
  });
});

// --- renderTerrain: cliffs, rims, and floor composition together -----------------

describe("renderTerrain", () => {
  function atlasFor(field: ReturnType<typeof makeField>) {
    return buildAtlas(fieldMaterials(field), { seed: 1, fullShapes: 2, biasLevels: 1, partialShapes: 2 });
  }

  it("draws no rim and no cliff-shade pixels when every tile is at level 0", () => {
    // cliffH is 0 for every tile and every neighbour agrees, so drawTileWalls's
    // fillPolygon/drawLine calls are never reached at all — true by
    // construction, unlike a uniformly *elevated* flat field, where walls are
    // still drawn (unconditionally, matching isoRenderer.ts) and how much of
    // them ends up visibly occluded by neighbouring floors is exactly the
    // depth-heuristic approximation this file's header flags as G's to solve
    // for real, not something to pin an exact pixel count to here.
    const field = makeField(4, 4, () => surface("soil", 0));
    const atlas = atlasFor(field);
    const { buffer } = renderTerrain(field, atlas, { seed: 1 });
    const wall = PALETTE.soil[1]!;
    expect(countColor(buffer, RIM_COLOR)).toBe(0);
    expect(countColor(buffer, darken(wall, CLIFF_LEFT_SHADE))).toBe(0);
    expect(countColor(buffer, darken(wall, CLIFF_RIGHT_SHADE))).toBe(0);
  });

  it("draws rim strokes when (and only when) neighbouring tiles differ in floor level", () => {
    const flat = makeField(4, 4, () => surface("soil", 0));
    const flatAtlas = atlasFor(flat);
    expect(countColor(renderTerrain(flat, flatAtlas, { seed: 1 }).buffer, RIM_COLOR)).toBe(0);

    // Left half at level 0, right half at level 1: one straight north-south
    // level boundary running the height of the field.
    const split = makeField(4, 4, (c) => surface("soil", c < 2 ? 0 : 1));
    const splitAtlas = atlasFor(split);
    expect(countColor(renderTerrain(split, splitAtlas, { seed: 1 }).buffer, RIM_COLOR)).toBeGreaterThan(0);
  });

  it("draws a darkened cliff wall, shaded left/right as isoRenderer.ts is, under an elevated tile", () => {
    const level = 3;
    const field = makeField(3, 3, (c, r) => surface("soil", c === 1 && r === 1 ? level : 0));
    const atlas = atlasFor(field);
    const { buffer } = renderTerrain(field, atlas, { seed: 1 });
    const wall = PALETTE.soil[1]!;
    expect(countColor(buffer, darken(wall, CLIFF_LEFT_SHADE))).toBeGreaterThan(0);
    expect(countColor(buffer, darken(wall, CLIFF_RIGHT_SHADE))).toBeGreaterThan(0);
  });

  // The concrete "nothing can peek through" check (compose.test.ts's own
  // integration test), carried up one level: a fully-interior, non-straddling
  // dual cell's diamond must be completely opaque once cliffs and rims (which
  // draw nothing here, since the field is flat) are layered into the same
  // buffer as the composed floor sprites, not just when composeField is
  // inspected in isolation.
  it("leaves no interior gaps in a flat, mixed field once cliffs and rims are layered in", () => {
    const ids = ["sand", "clay", "soil"] as const;
    const field = makeField(6, 6, (c, r) => surface(ids[(c + r * 2) % 3]!, 0));
    const atlas = buildAtlas(fieldMaterials(field), { seed: 7, fullShapes: 3, biasLevels: 1, partialShapes: 2 });
    const { buffer, originX, originY } = renderTerrain(field, atlas, { seed: 7 });

    const [ox, oy] = cellOrigin(2, 2, 0);
    let gaps = 0;
    for (let y = 0; y < TILE_H; y++) {
      const [x0, x1] = rowSpan(y);
      for (let x = x0; x <= x1; x++) {
        if (!insideDiamond(x, y)) continue;
        const px = Math.round(originX + ox + x);
        const py = Math.round(originY + oy + y);
        if (buffer.data[(py * buffer.width + px) * 4 + 3] !== 255) gaps++;
      }
    }
    expect(gaps).toBe(0);
  });

  it("sizes the buffer to actually contain everything drawn (no silent clipping)", () => {
    const field = makeField(5, 5, (c, r) => surface("soil", (c + r) % 3 === 0 ? 4 : 0));
    const atlas = atlasFor(field);
    const { buffer } = renderTerrain(field, atlas, { seed: 3 });
    expect(buffer.width).toBeGreaterThan(TILE_W);
    expect(buffer.height).toBeGreaterThan(TILE_H);
    let opaque = 0;
    for (let i = 3; i < buffer.data.length; i += 4) if (buffer.data[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(0);
  });

  // --- Feature overhang layer (milestone F) ---

  it("draws feature sprites on top of their own tile's floor", () => {
    const inst = featureInstance("pebble", PALETTE.pebble);
    const withScatter = makeField(4, 4, () => ({
      ...surface("scree", 0),
      scatter: [{ inst, density: "full" as const }],
    }));
    // Identical field minus the scatter — the correct control now that
    // renderTerrain always draws features (building its own feature atlas from
    // the field when none is passed), so a same-field no-atlas call would
    // produce an identical buffer and a meaningless zero diff.
    const withoutScatter = makeField(4, 4, () => surface("scree", 0));
    const atlas = atlasFor(withScatter);
    // Density "full" gates at probability 1, so every tile places its pebble.
    expect(featuresForTile(withScatter.at(1, 1), 1, 1, 42).length).toBeGreaterThan(0);

    const withFeatures = renderTerrain(withScatter, atlas, { seed: 42 }).buffer;
    const without = renderTerrain(withoutScatter, atlas, { seed: 42 }).buffer;
    let diff = 0;
    for (let i = 0; i < withFeatures.data.length; i += 4) {
      if (
        withFeatures.data[i] !== without.data[i] ||
        withFeatures.data[i + 1] !== without.data[i + 1] ||
        withFeatures.data[i + 2] !== without.data[i + 2]
      ) {
        diff++;
      }
    }
    expect(diff).toBeGreaterThan(0);
  });

  it("leaves no interior gaps in a flat, mixed field even with features layered in", () => {
    const ids = ["sand", "clay", "soil"] as const;
    const field = makeField(6, 6, (c, r) => ({
      ...surface(ids[(c + r * 2) % 3]!, 0),
      scatter: [{ inst: featureInstance("pebble", PALETTE.pebble), density: "full" as const }],
    }));
    const atlas = buildAtlas(fieldMaterials(field), { seed: 7, fullShapes: 3, biasLevels: 1, partialShapes: 2 });
    const { buffer, originX, originY } = renderTerrain(field, atlas, { seed: 7 });

    const [ox, oy] = cellOrigin(2, 2, 0);
    let gaps = 0;
    for (let y = 0; y < TILE_H; y++) {
      const [x0, x1] = rowSpan(y);
      for (let x = x0; x <= x1; x++) {
        if (!insideDiamond(x, y)) continue;
        const px = Math.round(originX + ox + x);
        const py = Math.round(originY + oy + y);
        if (buffer.data[(py * buffer.width + px) * 4 + 3] !== 255) gaps++;
      }
    }
    expect(gaps).toBe(0);
  });
});

// Sanity-check the corner table used by straddleFraction agrees with the one
// compose.ts itself measures mask codes against, so the two never drift apart.
describe("CORNER_TILE_OFFSETS", () => {
  it("has exactly the 4 unit-square corners", () => {
    expect(new Set(CORNER_TILE_OFFSETS.map(([du, dv]) => `${du},${dv}`))).toEqual(
      new Set(["0,0", "1,0", "0,1", "1,1"]),
    );
  });
});
