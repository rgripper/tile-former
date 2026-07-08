import type { MatId, Ramp, SubstrateId } from "../types.ts";
import { biomeOverrides } from "./biomeOverrides.ts";

// --- Color helpers (hex number ↔ HSL) ---

export function rgbToHsl(c: number): [number, number, number] {
  const r = ((c >> 16) & 0xff) / 255;
  const g = ((c >> 8) & 0xff) / 255;
  const b = (c & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (
    (Math.round(f(0) * 255) << 16) |
    (Math.round(f(8) * 255) << 8) |
    Math.round(f(4) * 255)
  );
}

// Shift a whole ramp in HSL space — used for climate tinting (e.g. grass hue
// from yellow-green when dry to deep green when wet).
export function shiftRamp(ramp: Ramp, dh: number, ds: number, dl: number): Ramp {
  return ramp.map((c) => {
    const [h, s, l] = rgbToHsl(c);
    return hslToRgb(h + dh, s + ds, l + dl);
  }) as Ramp;
}

// Map a [0,1) value onto the 4-step ramp with a mid-heavy distribution:
// mostly indices 1–2, occasional deep shadow (0) and highlight (3).
export function rampAt(ramp: Ramp, v: number): number {
  return ramp[v < 0.12 ? 0 : v < 0.58 ? 1 : v < 0.92 ? 2 : 3]!;
}

// --- Global base ramps (dark → highlight) ---
// Placeholder pixel-art ramps; the designer exists to iterate on these.

export const substrateRamps: Record<SubstrateId, Ramp> = {
  bareRock:     [0x4a4a52, 0x6b6b73, 0x8c8c94, 0xb0b0b5],
  scree:        [0x55524a, 0x77746a, 0x99958a, 0xb8b4a8],
  sand:         [0xa8865a, 0xc9a86e, 0xe3c489, 0xf2dca8],
  soil:         [0x4a3626, 0x6b4e36, 0x8a6a4a, 0xa88a64],
  clay:         [0x6e4030, 0x8f5740, 0xad7052, 0xc48a68],
  mud:          [0x3a2e22, 0x54432f, 0x6e5a3e, 0x84704f],
  peat:         [0x2e2418, 0x453624, 0x5c4a30, 0x6e5c3e],
  frozenGround: [0x5a5e66, 0x7c828c, 0x9ea6b0, 0xc0c8d0],
  snow:         [0xaeb8cc, 0xcdd6e4, 0xe6ecf4, 0xf8faff],
};

export const matRamps: Record<MatId, Ramp> = {
  grass:        [0x2e5a1e, 0x44782c, 0x5e963c, 0x7ab452],
  dryGrass:     [0x8a7a34, 0xa8964a, 0xc4b062, 0xdcc87e],
  moss:         [0x2a4a28, 0x3c6238, 0x50794a, 0x64905c],
  lichen:       [0x6e7a5e, 0x8c967a, 0xa8b096, 0xc2c8b2],
  leafLitter:   [0x5e4423, 0x7d5b30, 0x9a7440, 0xb08c52],
  needleLitter: [0x4c3a24, 0x644e2f, 0x7a613c, 0x8e744a],
  sedge:        [0x4a6a2e, 0x628840, 0x7aa454, 0x92bc68],
  cushion:      [0x4e5e3c, 0x687a50, 0x829664, 0x9cb07a],
};

// --- Per-biome overrides ---
// A biome supplies only the ramps it wants to change; everything else falls
// back to the globals above. Shifting the global/per-biome balance later is
// a data edit, not a code change.

export type PaletteOverride = {
  substrates?: Partial<Record<SubstrateId, Ramp>>;
  mats?: Partial<Record<MatId, Ramp>>;
};

export type ResolvedPalette = {
  substrates: Record<SubstrateId, Ramp>;
  mats: Record<MatId, Ramp>;
};

export function getPalette(biomeId: number | null): ResolvedPalette {
  const o = biomeId === null ? undefined : biomeOverrides[biomeId];
  return {
    substrates: { ...substrateRamps, ...o?.substrates },
    mats: { ...matRamps, ...o?.mats },
  };
}
