import type { MaterialId, Ramp } from "../types.ts";
import { MATERIAL_IDS } from "../types.ts";
import { MASTER_RAMPS, snapRampToPalette } from "./master.ts";
import { MATERIAL_STYLES, shadeRamp, type MaterialStyle } from "./materials.ts";
import { biomeOverrides } from "./biomeOverrides.ts";

export * from "./master.ts";
export * from "./materials.ts";

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

// Raw HSL shift of a whole ramp. Almost never what you want directly — the
// result is off-palette. Use `tintRamp`.
export function shiftRamp(ramp: Ramp, dh: number, ds: number, dl: number): Ramp {
  return ramp.map((c) => {
    const [h, s, l] = rgbToHsl(c);
    return hslToRgb(h + dh, s + ds, l + dl);
  }) as Ramp;
}

// Climate/context tint that stays legal: shift in HSL, then snap every step
// back onto the master palette. Snapping is not a lossy afterthought here, it
// is the point — a grass ramp pushed toward yellow for a dry climate lands on
// `straw` steps on its own, so climate variation moves *between* authored ramps
// instead of inventing colors between them.
export function tintRamp(ramp: Ramp, dh: number, ds: number, dl: number): Ramp {
  return snapRampToPalette(shiftRamp(ramp, dh, ds, dl));
}

// Map a [0,1) value onto the 4-step ramp with a mid-heavy distribution:
// mostly indices 1–2, occasional deep shadow (0) and highlight (3).
export function rampAt(ramp: Ramp, v: number): number {
  return ramp[v < 0.12 ? 0 : v < 0.58 ? 1 : v < 0.92 ? 2 : 3]!;
}

// --- Per-biome overrides ---
// A biome may repoint a material at a different master ramp and/or move its
// shade window. It cannot supply colors, so no override can leave the palette.

export type PaletteOverride = Partial<Record<MaterialId, Partial<MaterialStyle>>>;

export type ResolvedPalette = Record<MaterialId, Ramp>;

export function resolveMaterialRamp(style: MaterialStyle): Ramp {
  return shadeRamp(MASTER_RAMPS[style.ramp], style.shade);
}

export function getMaterialStyles(biomeId: number | null): Record<MaterialId, MaterialStyle> {
  const o = biomeId === null ? undefined : biomeOverrides[biomeId];
  const out = {} as Record<MaterialId, MaterialStyle>;
  for (const id of MATERIAL_IDS) {
    out[id] = { ...MATERIAL_STYLES[id], ...o?.[id] };
  }
  return out;
}

export function getPalette(biomeId: number | null): ResolvedPalette {
  const styles = getMaterialStyles(biomeId);
  const out = {} as ResolvedPalette;
  for (const id of MATERIAL_IDS) out[id] = resolveMaterialRamp(styles[id]);
  return out;
}
