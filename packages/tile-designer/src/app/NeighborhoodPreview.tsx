import { useMemo } from "react";
import type { DesignInput } from "../core/types.ts";
import { TILE_H, TILE_W } from "../core/types.ts";
import { resolveStyle } from "../core/resolve.ts";
import { bakeTile } from "../core/bake.ts";
import { makeBuffer, type PixelBuffer } from "../core/pixels.ts";
import { hash2D } from "../core/rng.ts";
import { TileCanvas } from "./TileCanvas.tsx";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Neighbors get slightly perturbed properties so the seam check exercises the
// realistic case (similar-but-not-identical tiles), not the trivial one.
function jitterInput(input: DesignInput, tx: number, ty: number): DesignInput {
  if (tx === 0 && ty === 0) return input;
  const r = (k: number) => hash2D(tx, ty, 0xbeef ^ k) - 0.5;
  return {
    ...input,
    temperature: input.temperature + r(1) * 3,
    effectiveMoisture: clamp01(input.effectiveMoisture + r(2) * 0.1),
    fertility: clamp01(input.fertility + r(3) * 0.1),
    drainage: clamp01(input.drainage + r(4) * 0.1),
    groundLight: clamp01(input.groundLight + r(5) * 0.1),
  };
}

// 3×3 iso neighborhood composited into one buffer — the visual seam check for
// world-coordinate noise continuity across tile boundaries.
export function NeighborhoodPreview({ input, seed }: { input: DesignInput; seed: number }) {
  const buffer = useMemo(() => {
    const composite = makeBuffer(TILE_W * 3, TILE_H * 3);
    for (let ty = -1; ty <= 1; ty++) {
      for (let tx = -1; tx <= 1; tx++) {
        // Iso grid → world pixel origin; the same mapping the game will use.
        const ox = ((tx - ty) * TILE_W) / 2;
        const oy = ((tx + ty) * TILE_H) / 2;
        const style = resolveStyle(jitterInput(input, tx, ty));
        const tile = bakeTile(style, ox, oy, seed);
        blit(composite, tile, ox + TILE_W, oy + TILE_H);
      }
    }
    return composite;
  }, [input, seed]);

  return (
    <div className="panel">
      <h2>3×3 seam check</h2>
      <TileCanvas buffer={buffer} zoom={2} />
    </div>
  );
}

// Copies non-transparent pixels of `src` into `dst` at (dx, dy).
function blit(dst: PixelBuffer, src: PixelBuffer, dx: number, dy: number): void {
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
