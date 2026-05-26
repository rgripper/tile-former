import { TEMP_ZONE_ADJACENCY } from "../tileMap/biomeVariants";
import type { PatchCell, PipelineConfig, SegmentBase } from "./types";
import { lerp } from "./utils";
import { getTemperatureZone } from "./cascade";

export function stage4_blendBorders(
  grid: PatchCell[][],
  config: PipelineConfig,
): void {
  const { neighbors, borderBlendWidth, segmentBase } = config;
  if (!neighbors) return;

  const pw = grid.length;
  const ph = grid[0].length;
  const myZone = getTemperatureZone(segmentBase.temperature);

  type BorderEntry = {
    base: SegmentBase;
    inBand: (x: number, y: number) => boolean;
    distFromEdge: (x: number, y: number) => number;
  };

  const borders: BorderEntry[] = [];

  if (neighbors.north) {
    const nZone = getTemperatureZone(neighbors.north.temperature);
    if (TEMP_ZONE_ADJACENCY[myZone].includes(nZone))
      borders.push({
        base: neighbors.north,
        inBand: (_x, y) => y < borderBlendWidth,
        distFromEdge: (_x, y) => y,
      });
  }
  if (neighbors.south) {
    const nZone = getTemperatureZone(neighbors.south.temperature);
    if (TEMP_ZONE_ADJACENCY[myZone].includes(nZone))
      borders.push({
        base: neighbors.south,
        inBand: (_x, y) => y >= ph - borderBlendWidth,
        distFromEdge: (_x, y) => ph - 1 - y,
      });
  }
  if (neighbors.east) {
    const nZone = getTemperatureZone(neighbors.east.temperature);
    if (TEMP_ZONE_ADJACENCY[myZone].includes(nZone))
      borders.push({
        base: neighbors.east,
        inBand: (x, _y) => x >= pw - borderBlendWidth,
        distFromEdge: (x, _y) => pw - 1 - x,
      });
  }
  if (neighbors.west) {
    const nZone = getTemperatureZone(neighbors.west.temperature);
    if (TEMP_ZONE_ADJACENCY[myZone].includes(nZone))
      borders.push({
        base: neighbors.west,
        inBand: (x, _y) => x < borderBlendWidth,
        distFromEdge: (x, _y) => x,
      });
  }

  if (borders.length === 0) return;

  for (let x = 0; x < pw; x++) {
    for (let y = 0; y < ph; y++) {
      for (const b of borders) {
        if (!b.inBand(x, y)) continue;
        const t = b.distFromEdge(x, y) / borderBlendWidth; // 0 at edge → 1 at inner boundary
        const cell = grid[x][y];
        cell.altitude = lerp(b.base.altitude, cell.altitude, t);
        cell.temperature = lerp(b.base.temperature, cell.temperature, t);
        cell.precipitation = lerp(b.base.precipitation, cell.precipitation, t);
        cell.light = lerp(b.base.light, cell.light, t);
        // drainage is gradient-derived and has no segment base value — left unblended
      }
    }
  }
}
