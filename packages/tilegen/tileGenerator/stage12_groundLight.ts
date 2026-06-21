// Stage 12 — Ground light [tile scale]
//
// Two-pass:
//   1. Cliff shadow — compares each tile's altitudeLevel against its four
//      cardinal neighbours. Using altitudeLevel (integer 0–10) rather than raw
//      altitude captures the visual cliff height, not the smooth gradient that
//      altitude interpolation produces between patches.
//      Formula (per direction, where diff = max(0, neighbourLevel - tileLevel)):
//        cliffShadow = clamp((south×3 + north×1 + east×2 + west×2) / 10, 0, 1)
//      Weights reflect sun direction: north = higher latitude, sun is in the
//      south, so a southern cliff blocks the most direct insolation.
//   2. Ground light — groundLight = light × (1 − cliffShadow).
//      Forest canopy density and other vegetation modifiers will be folded in
//      here once tree generation is implemented.

import type { Tile } from "../tile/tile";

export function stage12_groundLight(tiles: Tile[][]): void {
  const width = tiles.length;
  const height = tiles[0].length;

  const level = (x: number, y: number): number =>
    tiles[Math.max(0, Math.min(x, width - 1))][Math.max(0, Math.min(y, height - 1))].altitudeLevel;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = tiles[x][y];
      const tl = tile.altitudeLevel;

      const southDiff = Math.max(0, level(x, y + 1) - tl);
      const northDiff = Math.max(0, level(x, y - 1) - tl);
      const eastDiff  = Math.max(0, level(x + 1, y) - tl);
      const westDiff  = Math.max(0, level(x - 1, y) - tl);

      tile.cliffShadow = Math.min(1, (southDiff * 3 + northDiff * 1 + eastDiff * 2 + westDiff * 2) / 10);
      tile.groundLight = tile.light * (1 - tile.cliffShadow);
    }
  }
}
