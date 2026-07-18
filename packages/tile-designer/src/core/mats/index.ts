// Mat stage (M3): paints the 0..n coverage layers over the substrate.
// Replaces the interim M2 flat-flood pass — every mat generator leaves
// substrate pixels showing through (density < 1 even at full coverage) and
// frays its patch boundary, so high-coverage tiles no longer read as a
// single flat green.
//
// Patch shape comes from low-frequency world-coordinate fBm exactly as in M2;
// the signed distance to the coverage threshold is squashed into an edge
// strength s ∈ [0,1] that generators use to thin out toward (and slightly
// past) the boundary.

import type { MatId, Ramp, RenderStyle, StyleParams } from "../types.ts";
import { hash2D } from "../rng.ts";
import { fbm, grainCoord, smoothstep } from "../noise.ts";
import { rampAt } from "../palette/index.ts";
import { resolveTone } from "../tone.ts";
import { edgeInset, put, rowSpan, type PixelBuffer } from "../pixels.ts";
import { spotField, stampField } from "../stamps.ts";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Isolated-patch mode (see RenderStyle.isolatedPatches): non-primary mats
// (index >= 1) are held off the rim by the same edge gate as the substrate and
// drawn at a higher patch frequency so they read as smaller isolated blobs. The
// primary mat (index 0, the base biome cover) keeps spreading to the edges.
const EDGE_MARGIN = 0.16;
const EDGE_FEATHER = 0.14;
const PRIMARY_PATCH_FREQ = 0.045;
const ISOLATED_PATCH_FREQ = 0.07;

// Per-tile render context for the mat generators (the per-tile dominant-tone
// bias fed into resolveTone).
type MatCtx = { tileBias: number };

// s: edge strength — 0 just outside the patch fringe, 1 well inside it.
type MatGen = (wx: number, wy: number, s: number, ramp: Ramp, seed: number, mc: MatCtx) => number | null;

// Turf fill shared by the grassy mats. `fill` caps coverage so the substrate
// can show through even at s = 1, but that show-through is a *low-frequency*
// mask (not per-pixel) — so bare soil forms small worn patches and frayed
// edges instead of single-pixel brown speckle, while the fill stays dense in
// the interior. The green tonal life comes from resolveTone's accent on the
// painted pixels, not from holes.
function turf(wx: number, wy: number, s: number, ramp: Ramp, seed: number, fill: number, mc: MatCtx): number | null {
  const cover = fill * Math.min(1, s * 1.6);
  if (fbm(wx, wy * 2, seed ^ 0x1f123bb5, 0.16) > cover) return null;
  const blade = hash2D(wx, wy, seed ^ 0x51ed270b);
  return resolveTone(2.0 + (blade - 0.5) * 0.9, wx, wy, ramp, seed, mc.tileBias);
}

// Litter leaf: 2×1 body with an offset tip pixel, shaded per leaf.
export function leafStamp(dx: number, dy: number, h: number, ramp: Ramp): number | null {
  if (dy === 0 && (dx === 0 || dx === 1)) return rampAt(ramp, 0.25 + h * 0.55 + dx * 0.1);
  if (dy === -1 && dx === (h < 0.5 ? 0 : 1)) return rampAt(ramp, 0.6 + h * 0.3);
  return null;
}

// Fallen needle: 4px dash at ±1:2 slope (iso-friendly diagonals), 2px thick
// so it reads as a chunky stroke rather than a single-pixel-width string.
function needleStamp(dx: number, dy: number, h: number, ramp: Ramp): number | null {
  if (dx < 0 || dx > 3) return null;
  const dir = h < 0.5 ? 1 : -1;
  const y0 = Math.round(dx * 0.5) * dir;
  if (dy !== y0 && dy !== y0 + dir) return null;
  return rampAt(ramp, 0.2 + h * 0.45);
}

// Mats whose color comes from a placed stamp (a specific leaf/needle shape at
// an exact anchor) rather than diffuse per-pixel noise. These must keep the
// real, ungrained world coordinate — snapping it would blow up each stamp
// into a grain×grain-scaled blob instead of just its intended shape.
const STAMP_MATS = new Set<MatId>(["leafLitter", "needleLitter"]);

const matGens: Record<MatId, MatGen> = {
  grass: (wx, wy, s, ramp, seed, mc) => turf(wx, wy, s, ramp, seed, 0.92, mc),

  dryGrass: (wx, wy, s, ramp, seed, mc) => turf(wx, wy, s, ramp, seed, 0.78, mc),

  sedge(wx, wy, s, ramp, seed, mc) {
    // Tussocks: only clumped cells grow, denser toward each clump's own value.
    const clump = hash2D(Math.floor(wx / 6), Math.floor(wy / 3), seed ^ 0x94d049bb);
    if (clump < 0.45) return null;
    return turf(wx, wy, s * (0.4 + 0.6 * clump), ramp, seed, 0.95, mc);
  },

  moss(wx, wy, s, ramp, seed, mc) {
    // Dense soft carpet, low-contrast mottle.
    if (hash2D(wx, wy, seed ^ 0x7feb352d) > 0.97 * Math.min(1, s * 2)) return null;
    const mottle = fbm(wx, wy * 2, seed ^ 0x2c1b3c6d, 0.12);
    return resolveTone(1.4 + (mottle - 0.5) * 1.1, wx, wy, ramp, seed, mc.tileBias);
  },

  lichen(wx, wy, s, ramp, seed) {
    // Crusty discs: pale speckled interior, darker rim.
    const spot = spotField(wx, wy, seed ^ 0xb5297a4d, 9, 5, 0.85 * s, 3.2);
    if (spot === null) return null;
    const grain = hash2D(wx, wy, seed ^ 0x68e31da4);
    if (spot.d > 0.75) return rampAt(ramp, 0.1 + grain * 0.15);
    return rampAt(ramp, 0.45 + spot.h * 0.3 + grain * 0.25 - spot.d * 0.2);
  },

  leafLitter: (wx, wy, s, ramp, seed) =>
    stampField(wx, wy, seed ^ 0x3ad8025f, 5, 3, 0.9 * s, leafStamp, ramp),

  needleLitter: (wx, wy, s, ramp, seed) =>
    // cellH 4, not 3: the thickened stamp's dy now reaches ±3, and the 3×3
    // neighbor scan only finds anchors whose stamp extent stays within one cell.
    stampField(wx, wy, seed ^ 0xe6546b64, 6, 4, 0.85 * s, needleStamp, ramp),

  cushion(wx, wy, s, ramp, seed) {
    // Dome mats: lit from above, darkening down the flanks to the rim.
    const spot = spotField(wx, wy, seed ^ 0x27d4eb2f, 12, 6, 0.8 * s, 4.5);
    if (spot === null) return null;
    const grain = hash2D(wx, wy, seed ^ 0x165667b1);
    return rampAt(ramp, 0.7 - spot.d * 0.35 - spot.ndy * 0.2 + grain * 0.15);
  },
};

export function paintMats(
  buf: PixelBuffer,
  style: StyleParams,
  ox: number,
  oy: number,
  seed: number,
  render: RenderStyle,
  tileBias: number,
): void {
  const mats = style.surface.mats;
  if (mats.length === 0) return;
  const mc: MatCtx = { tileBias };
  for (let y = 0; y < buf.height; y++) {
    const [x0, x1] = rowSpan(y);
    const wy = oy + y;
    const gy = grainCoord(wy, render.grain);
    for (let x = x0; x <= x1; x++) {
      const wx = ox + x;
      const gx = grainCoord(wx, render.grain);
      const edgeGate = render.isolatedPatches
        ? smoothstep(EDGE_MARGIN, EDGE_MARGIN + EDGE_FEATHER, edgeInset(x, y))
        : 1;
      for (let mi = 0; mi < mats.length; mi++) {
        const mat = mats[mi]!;
        // Non-primary mats get compact edge-avoiding patches; the primary mat
        // (mi 0) stays the full-spread base cover.
        const isolate = render.isolatedPatches && mi > 0;
        const gate = isolate ? edgeGate : 1;
        if (gate <= 0) continue;
        const freq = isolate ? ISOLATED_PATCH_FREQ : PRIMARY_PATCH_FREQ;
        // Patch macro-shape is grained for every mat (even stamp-based ones):
        // it only decides *where* the mat covers, so a chunky boundary is
        // free lo-fi texture with no risk to individual stamp shapes.
        const patch = fbm(gx, gy * 2, seed ^ (0xabcd1234 + mi * 0x1013), freq);
        // Signed inside-ness → edge strength; the +0.05 lets sparse frays
        // spill a few pixels past the nominal patch boundary. Crisp mode
        // collapses the fringe to a hard in/out step.
        const inside = mat.coverage * 0.9 - patch + 0.05;
        let s = render.crispEdges ? (inside > 0 ? 1 : 0) : clamp01(inside / 0.2);
        if (isolate) s *= gate;
        if (s <= 0) continue;
        // Diffuse mats sample color from the grained coordinate (chunky
        // turf/moss/lichen/cushion texture); stamp mats keep the real
        // coordinate so leaf/needle placement and shape stay precise.
        const [mx, my] = STAMP_MATS.has(mat.id) ? [wx, wy] : [gx, gy];
        const c = matGens[mat.id](mx, my, s, style.matRamps[mat.id]!, seed ^ (mi * 0x9e3779b9), mc);
        if (c !== null) {
          put(buf, x, y, c);
          break;
        }
      }
    }
  }
}
