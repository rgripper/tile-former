// Which master ramp each material draws from, and where in it.
//
// 20 materials share 13 ramps on purpose. Sharing is what makes the world read
// as one palette; the *texture* generators are what distinguish bedrock from
// scree or mud from peat, not a bespoke set of colors each. Where two materials
// share a ramp and still need to separate tonally, `shade` slides the material's
// window along the ramp with clamping — real differentiation at zero extra
// colors (peat sits low in `muck`, scree high in `stone`).

import type { MaterialId, Ramp } from "../types.ts";
import type { RampId } from "./master.ts";

// Ramp index window. 0 is the ramp as authored; -1 darkens (the highlight step
// becomes unreachable and the shadow step doubles up); +1 lightens.
export type Shade = -1 | 0 | 1;

export type MaterialStyle = { ramp: RampId; shade: Shade };

export const MATERIAL_STYLES: Record<MaterialId, MaterialStyle> = {
  // --- substrates ---
  bareRock:     { ramp: "stone",   shade:  0 },
  scree:        { ramp: "stone",   shade:  1 }, // loose rubble catches more light than a bedrock face
  sand:         { ramp: "sand",    shade:  0 },
  soil:         { ramp: "earth",   shade:  0 },
  clay:         { ramp: "clay",    shade:  0 },
  mud:          { ramp: "muck",    shade:  0 },
  peat:         { ramp: "muck",    shade: -1 }, // older, wetter, darker organics than mud
  frozenGround: { ramp: "frost",   shade:  0 },
  snow:         { ramp: "snow",    shade:  0 },
  water:        { ramp: "water",   shade:  0 }, // the one ramp nothing else draws from

  // --- mats ---
  grass:        { ramp: "verdant", shade:  0 },
  dryGrass:     { ramp: "straw",   shade:  0 },
  moss:         { ramp: "moss",    shade:  0 },
  lichen:       { ramp: "pallid",  shade:  0 },
  leafLitter:   { ramp: "duff",    shade:  1 }, // broadleaf drop is paler than the duff beneath it
  needleLitter: { ramp: "duff",    shade: -1 },
  sedge:        { ramp: "verdant", shade:  1 }, // pale tussock tips
  cushion:      { ramp: "moss",    shade:  1 }, // domes lit from above

  // --- static scatter ---
  pebble:       { ramp: "stone",   shade:  1 },
  twig:         { ramp: "duff",    shade: -1 },
  leaf:         { ramp: "duff",    shade:  1 },
};

// Index remap for each shade window. Clamping (rather than extending the ramp)
// is what keeps the palette closed: a shaded material never needs a color the
// ramp does not already contain.
const SHADE_WINDOWS: Record<Shade, [number, number, number, number]> = {
  [-1]: [0, 0, 1, 2],
  [0]: [0, 1, 2, 3],
  [1]: [1, 2, 3, 3],
};

export function shadeRamp(ramp: Ramp, shade: Shade): Ramp {
  if (shade === 0) return ramp;
  return SHADE_WINDOWS[shade].map((i) => ramp[i]!) as Ramp;
}
