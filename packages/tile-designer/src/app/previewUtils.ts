// Shared helpers for the multi-tile preview panels: world-coordinate jitter
// so seam checks exercise the realistic near-identical-neighbor case (not the
// trivial identical-tile one), and an alpha-aware blit for compositing baked
// tiles into one big canvas buffer.

import type { DesignInput } from "../core/types.ts";
import { hash2D } from "../core/rng.ts";
import type { PixelBuffer } from "../core/pixels.ts";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function jitterInput(input: DesignInput, tx: number, ty: number): DesignInput {
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
