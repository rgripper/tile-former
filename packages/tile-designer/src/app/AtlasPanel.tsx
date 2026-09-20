import { useMemo, useState } from "react";
import type { Density, StyleParams } from "../core/types.ts";
import { TILE_H, TILE_W } from "../core/types.ts";
import { makeBuffer, type PixelBuffer } from "../core/pixels.ts";
import { CODE_FULL, MASK_CODES, type MaskBitmap } from "../core/masks.ts";
import {
  blitSprite,
  buildAtlas,
  DEFAULT_ATLAS_CONFIG,
  materialsFromStyle,
  type Atlas,
} from "../core/atlas.ts";
import { TileCanvas } from "./TileCanvas.tsx";

const PAD = 4;
const CELL_W = TILE_W + PAD;
const CELL_H = TILE_H + PAD;
const PER_ROW = 8;

function blitMask(dst: PixelBuffer, mask: MaskBitmap, dx: number, dy: number): void {
  for (let y = 0; y < TILE_H; y++) {
    const py = dy + y;
    if (py < 0 || py >= dst.height) continue;
    for (let x = 0; x < TILE_W; x++) {
      if (mask.data[y * TILE_W + x] === 0) continue;
      const px = dx + x;
      if (px < 0 || px >= dst.width) continue;
      const o = (py * dst.width + px) * 4;
      dst.data[o] = 0xdc;
      dst.data[o + 1] = 0xd6;
      dst.data[o + 2] = 0xc6;
      dst.data[o + 3] = 255;
    }
  }
}

// Grid of the 16 corner masks, `variants` deep. This is the sheet that makes the
// overhang-only rule legible: every shape fully contains its nominal quadrant
// union and only ever bulges outward from it.
function maskSheet(atlas: Atlas): PixelBuffer {
  const rows = Math.ceil(MASK_CODES / PER_ROW);
  const deep = Math.max(...atlas.masks.map((m) => m.length));
  const buf = makeBuffer(PER_ROW * CELL_W, rows * deep * CELL_H);
  for (let code = 0; code < MASK_CODES; code++) {
    const set = atlas.masks[code]!;
    for (let v = 0; v < deep; v++) {
      blitMask(
        buf,
        set[v % set.length]!,
        (code % PER_ROW) * CELL_W,
        (Math.floor(code / PER_ROW) * deep + v) * CELL_H,
      );
    }
  }
  return buf;
}

// The full-cell variant space of one material: shape across, tone bias down.
// Shapes are what break the repeating-lattice read; bias re-mixes light and dark
// blocks without shifting the whole cell a ramp step.
function variantSheet(atlas: Atlas, key: string, density: Density): PixelBuffer {
  const shapes = atlas.shapeCount(CODE_FULL);
  const biases = atlas.biasCount(CODE_FULL);
  const buf = makeBuffer(shapes * CELL_W, biases * CELL_H);
  for (let s = 0; s < shapes; s++) {
    for (let b = 0; b < biases; b++) {
      const ref = atlas.lookup(key, density, CODE_FULL, s, b);
      if (ref) blitSprite(buf, atlas, ref, s * CELL_W, b * CELL_H);
    }
  }
  return buf;
}

// One material cut by all 16 codes — what the compositor actually indexes.
function codeSheet(atlas: Atlas, key: string, density: Density): PixelBuffer {
  const rows = Math.ceil(MASK_CODES / PER_ROW);
  const buf = makeBuffer(PER_ROW * CELL_W, rows * CELL_H);
  for (let code = 1; code < MASK_CODES; code++) {
    const ref = atlas.lookup(key, density, code, 0, 0);
    if (ref) blitSprite(buf, atlas, ref, (code % PER_ROW) * CELL_W, Math.floor(code / PER_ROW) * CELL_H);
  }
  return buf;
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MB`;

// The atlas inspector: the milestone-A counterpart to the palette panel. It
// answers three questions that are otherwise invisible — what the mask set looks
// like, whether a material has enough variants to stop reading as a lattice, and
// what the whole thing costs.
export function AtlasPanel({
  style,
  seed,
  defaultAtlas,
}: {
  style: StyleParams;
  seed: number;
  defaultAtlas: Atlas;
}) {
  const [tab, setTab] = useState<"masks" | "variants" | "page">("variants");
  const [shapes, setShapes] = useState(DEFAULT_ATLAS_CONFIG.fullShapes);
  const [biases, setBiases] = useState(DEFAULT_ATLAS_CONFIG.biasLevels);
  const [selected, setSelected] = useState(0);
  const [density, setDensity] = useState<Density>("full");

  const requests = useMemo(() => materialsFromStyle(style), [style]);
  // The default-config atlas is built once in App and shared (TerrainPreview's
  // field atlas overlaps it, and the variant-texture cache in atlas.ts makes
  // even this custom build cut-and-pack only). A build runs here only when the
  // shapes/biases selectors leave the defaults.
  const customAtlas = useMemo(
    () =>
      shapes === DEFAULT_ATLAS_CONFIG.fullShapes && biases === DEFAULT_ATLAS_CONFIG.biasLevels
        ? null
        : buildAtlas(requests, { seed, fullShapes: shapes, biasLevels: biases }),
    [requests, seed, shapes, biases],
  );
  const atlas = customAtlas ?? defaultAtlas;

  const material = requests[Math.min(selected, requests.length - 1)];
  const activeDensity: Density = material?.densities.includes(density)
    ? density
    : (material?.densities[0] ?? "full");

  const sheet = useMemo(() => {
    if (tab === "masks") return maskSheet(atlas);
    if (tab === "page") return atlas.pages[0]!;
    if (!material) return makeBuffer(CELL_W, CELL_H);
    return variantSheet(atlas, material.key, activeDensity);
  }, [tab, atlas, material, activeDensity]);

  const codes = useMemo(
    () => (tab === "variants" && material ? codeSheet(atlas, material.key, activeDensity) : null),
    [tab, atlas, material, activeDensity],
  );

  const s = atlas.stats;
  const contentBytes = s.spritePixels * 4;

  return (
    <div className="panel">
      <h2>Atlas</h2>

      <div className="row">
        <div className="segmented">
          {(["variants", "masks", "page"] as const).map((t) => (
            <button key={t} className={tab === t ? "active" : undefined} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <span className="legend">
          <span className="chip">{s.sprites} sprites</span>
          <span className="chip">
            {s.pages} page{s.pages === 1 ? "" : "s"}
          </span>
          <span className="chip">{mb(contentBytes)} content</span>
          <span className="chip">{((100 * contentBytes) / s.uncroppedBytes).toFixed(0)}% of uncropped</span>
          <span className="chip">{s.buildMs} ms</span>
        </span>
      </div>

      <div className="row">
        <label>
          shapes
          <select value={shapes} onChange={(e) => setShapes(Number(e.target.value))}>
            {[1, 2, 4, 8, 16, 32].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          tone levels
          <select value={biases} onChange={(e) => setBiases(Number(e.target.value))}>
            {[1, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="pal-note">
          {/* Milestone L measured this: one shape tiles cleanly but shows an
              obvious lattice of identical blobs, eight breaks it completely. The
              control is worth keeping because it is the fastest way to re-check
              that judgement whenever a generator changes. */}
          1 shape = visible lattice · 8 = none
        </span>
      </div>

      {tab === "variants" && (
        <div className="row">
          <div className="segmented">
            {requests.map((r, i) => (
              <button
                key={r.key}
                className={material?.key === r.key ? "active" : undefined}
                onClick={() => setSelected(i)}
              >
                {r.id}
              </button>
            ))}
          </div>
          {(material?.densities.length ?? 0) > 1 && (
            <div className="segmented">
              {material!.densities.map((d) => (
                <button
                  key={d}
                  className={activeDensity === d ? "active" : undefined}
                  onClick={() => setDensity(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="scroll-x">
        <TileCanvas buffer={sheet} zoom={tab === "page" ? 0.25 : 1} />
      </div>

      {codes && (
        <>
          <div className="progress-row">
            corner codes 0–15 · bit n set = corner n is this material or higher · 0 = top, 1 = right,
            2 = left, 3 = bottom
          </div>
          <div className="scroll-x">
            <TileCanvas buffer={codes} zoom={1} />
          </div>
        </>
      )}

      {tab === "page" && s.pages > 1 && (
        <div className="progress-row">showing page 1 of {s.pages}</div>
      )}
    </div>
  );
}
