import { Delaunay } from "d3-delaunay";
import { createRand } from "./rand.ts";
import { tileSide, gridSize } from "./config.ts";

export type FillType = "grass" | "pebbles" | "empty" | null;

export interface VoronoiCell {
  polygon: number[];
  centerX: number;
  centerY: number;
  fillType: FillType;
}

export interface VoronoiData {
  cells: VoronoiCell[];
}

const WORLD_W = gridSize.width * tileSide;
const WORLD_H = gridSize.height * tileSide;

type Point = [number, number];

function extractPolygon(pts: Point[] | null): number[] {
  if (!pts || pts.length < 3) return [];
  const result = new Array<number>(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    result[2 * i] = pts[i]![0];
    result[2 * i + 1] = pts[i]![1];
  }
  return result;
}

export function generateLargeVoronoi(seed: string): VoronoiData {
  const rng = createRand(seed + ":large");

  const N = 10;
  const cellsX = Math.ceil(gridSize.width / N) + 2;
  const cellsY = Math.ceil(gridSize.height / N) + 2;
  const cellW = WORLD_W / Math.ceil(gridSize.width / N);
  const cellH = WORLD_H / Math.ceil(gridSize.height / N);

  const n = cellsX * cellsY;
  const coords = new Float64Array(n * 2);
  const xs: number[] = [];
  const ys: number[] = [];

  let idx = 0;
  for (let cy = -1; cy < cellsY - 1; cy++) {
    for (let cx = -1; cx < cellsX - 1; cx++) {
      const x = (cx + rng.next()) * cellW;
      const y = (cy + rng.next()) * cellH;
      xs.push(x);
      ys.push(y);
      coords[idx++] = x;
      coords[idx++] = y;
    }
  }

  const delaunay = new Delaunay(coords);
  const voronoi = delaunay.voronoi([0, 0, WORLD_W, WORLD_H]);

  const cells: VoronoiCell[] = [];
  for (let i = 0; i < xs.length; i++) {
    const polygon = extractPolygon(voronoi.cellPolygon(i));
    if (polygon.length < 6) continue;
    cells.push({ polygon, centerX: xs[i]!, centerY: ys[i]!, fillType: null });
  }

  return { cells };
}

export function generateSmallVoronoi(seed: string): VoronoiData {
  const rng = createRand(seed + ":small");
  const fillRng = createRand(seed + ":fill");

  // 3 points per tile → avg cell ~37px (58% of tile), crosses tile boundaries naturally
  const density = 3;
  const total = gridSize.width * gridSize.height * density;
  const coords = new Float64Array(total * 2);
  const xs: number[] = [];
  const ys: number[] = [];

  let idx = 0;
  for (let ty = 0; ty < gridSize.height; ty++) {
    for (let tx = 0; tx < gridSize.width; tx++) {
      for (let k = 0; k < density; k++) {
        const x = (tx + rng.next()) * tileSide;
        const y = (ty + rng.next()) * tileSide;
        xs.push(x);
        ys.push(y);
        coords[idx++] = x;
        coords[idx++] = y;
      }
    }
  }

  const delaunay = new Delaunay(coords);
  const voronoi = delaunay.voronoi([0, 0, WORLD_W, WORLD_H]);

  const cells: VoronoiCell[] = [];
  for (let i = 0; i < xs.length; i++) {
    const polygon = extractPolygon(voronoi.cellPolygon(i));
    if (polygon.length < 6) continue;

    let fillType: FillType = null;
    if (fillRng.next() < 0.1) {
      const r2 = fillRng.next();
      if (r2 < 0.5) fillType = "grass";
      else if (r2 < 0.85) fillType = "pebbles";
      else fillType = "empty";
    }

    cells.push({ polygon, centerX: xs[i]!, centerY: ys[i]!, fillType });
  }

  return { cells };
}
