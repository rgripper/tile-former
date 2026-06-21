import { Delaunay } from "d3-delaunay";
import { createRand, type CustomRand } from "./rand.ts";
import { tileSide, gridSize } from "./config.ts";

export type FillType = "grass" | "pebbles" | "empty" | null;

export interface VoronoiCell {
  polygon: number[]; // flat [x0,y0,x1,y1,...,x0,y0] closed
  centerX: number;
  centerY: number;
}

export interface VoronoiGroup {
  cellIndices: number[];
  boundaryPolygon: number[]; // flat [x0,y0,...] outer boundary only
  centroidX: number;
  centroidY: number;
  fillType: FillType;
}

export interface VoronoiData {
  cells: VoronoiCell[];
  groups: VoronoiGroup[];
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

// Snap coordinate to 3-decimal-place grid before using as a map key.
// Interior voronoi vertices are bitwise-identical across adjacent cells (same Float64Array source),
// but boundary-clipped vertices are computed independently per cell and may drift by ~1e-10.
// Snapping to 0.001px precision collapses that drift without affecting visual fidelity.
const snap = (v: number) => Math.round(v * 1000) / 1000;
const vkey = (x: number, y: number) => `${snap(x)},${snap(y)}`;

// Union boundary of a group: collect all cell edges, cancel shared ones (appear reversed).
function computeGroupBoundary(cells: VoronoiCell[], cellIndices: number[]): number[] {
  if (cellIndices.length === 1) return cells[cellIndices[0]!]!.polygon;

  const edgeMap = new Map<string, [number, number, number, number]>();

  for (const idx of cellIndices) {
    const poly = cells[idx]!.polygon;
    if (poly.length < 6) continue;
    const n = poly.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const x1 = poly[2 * i]!,  y1 = poly[2 * i + 1]!;
      const x2 = poly[2 * i + 2]!, y2 = poly[2 * i + 3]!;
      const revKey = `${vkey(x2, y2)}|${vkey(x1, y1)}`;
      if (edgeMap.has(revKey)) {
        edgeMap.delete(revKey);
      } else {
        edgeMap.set(`${vkey(x1, y1)}|${vkey(x2, y2)}`, [x1, y1, x2, y2]);
      }
    }
  }

  if (edgeMap.size === 0) return [];

  // Chain remaining boundary edges into an ordered polygon
  const startMap = new Map<string, [number, number, number, number]>();
  for (const edge of edgeMap.values()) startMap.set(vkey(edge[0], edge[1]), edge);

  const first = edgeMap.values().next().value!;
  const result: number[] = [first[0], first[1]];
  startMap.delete(vkey(first[0], first[1]));

  let cur = first;
  for (let guard = 0; guard < 10000 && startMap.size > 0; guard++) {
    const next = startMap.get(vkey(cur[2], cur[3]));
    if (!next) break;
    result.push(next[0], next[1]);
    startMap.delete(vkey(next[0], next[1]));
    cur = next;
  }

  return result;
}

function groupCentroid(cells: VoronoiCell[], cellIndices: number[]): [number, number] {
  let cx = 0, cy = 0;
  for (const idx of cellIndices) {
    cx += cells[idx]!.centerX;
    cy += cells[idx]!.centerY;
  }
  return [cx / cellIndices.length, cy / cellIndices.length];
}

// Generates the small-scale voronoi layer used for sub-tile features.
//
// Phase 1 – point placement:
//   Places `density` seed points per tile using jittered sampling (one random
//   point per sub-tile slot), producing cells that average ~(tileSide/√density)px
//   wide and naturally cross tile boundaries.
//
// Phase 2 – group formation:
//   ~35% of cells are elected as group starters (Fisher-Yates shuffle picks the
//   visit order so starters are spatially scattered). Each starter tries to absorb
//   between m1 and m2 unclaimed neighbours, chosen by a min-heap ordered on
//   distance-to-starter so the group grows as a compact blob rather than a chain.
//   Cells that are never recruited become singleton groups of size 1.
//
// Phase 3 – finalisation:
//   Each group gets a union boundary polygon (shared interior edges cancelled),
//   a centroid, and a randomly assigned fill type (10% chance: grass / pebbles /
//   empty; 90%: null = no feature).
export function generateSmallVoronoi(seed: string, m1 = 0, m2 = 3, groupRng: CustomRand): VoronoiData {
  const rng = createRand(seed + ":small");

  // --- Phase 1: place seed points ---
  // `density` points per tile, each jittered uniformly within its slot,
  // stored in a flat Float64Array for the Delaunay constructor.
  const density = 3;
  const total = gridSize.width * gridSize.height * density;
  const coords = new Float64Array(total * 2);
  const xs: number[] = [];
  const ys: number[] = [];

  let coordIdx = 0;
  for (let ty = 0; ty < gridSize.height; ty++) {
    for (let tx = 0; tx < gridSize.width; tx++) {
      for (let k = 0; k < density; k++) {
        const x = (tx + rng.next()) * tileSide;
        const y = (ty + rng.next()) * tileSide;
        xs.push(x);
        ys.push(y);
        coords[coordIdx++] = x;
        coords[coordIdx++] = y;
      }
    }
  }

  const delaunay = new Delaunay(coords);
  const voronoi = delaunay.voronoi([0, 0, WORLD_W, WORLD_H]);

  const cells: VoronoiCell[] = [];
  for (let i = 0; i < xs.length; i++) {
    cells.push({
      polygon: extractPolygon(voronoi.cellPolygon(i)),
      centerX: xs[i]!,
      centerY: ys[i]!,
    });
  }

  // --- Phase 2: group formation ---
  // Voronoi adjacency comes directly from the Delaunay triangulation.
  const adj: number[][] = Array.from({ length: cells.length }, (_, i) => [...delaunay.neighbors(i)]);

  // Randomise visit order so no spatial region systematically gets first pick.
  const order = Array.from({ length: cells.length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(groupRng.next() * (i + 1));
    const tmp = order[i]!; order[i] = order[j]!; order[j] = tmp;
  }

  const groupOf = new Int32Array(cells.length).fill(-1); // -1 = unclaimed
  const rawGroups: number[][] = [];

  const STARTER_RATE = 0.35;

  for (const starterIdx of order) {
    if (groupOf[starterIdx] !== -1) continue; // already claimed by an earlier starter
    if (cells[starterIdx]!.polygon.length < 6) continue; // degenerate cell, skip
    if (groupRng.next() > STARTER_RATE) continue; // most cells are not starters

    const groupId = rawGroups.length;
    groupOf[starterIdx] = groupId;
    const cellIndices = [starterIdx];

    // How many neighbours this starter will absorb (random in [m1, m2]).
    const extra = m1 + Math.floor(groupRng.next() * (m2 - m1 + 1));

    if (extra > 0) {
      const sx = cells[starterIdx]!.centerX;
      const sy = cells[starterIdx]!.centerY;

      // Min-heap (sorted array) ordered by squared distance to the starter center.
      // Prioritising proximity to the origin rather than the frontier prevents
      // the group from elongating into a sausage shape.
      type Cand = { idx: number; dist2: number };
      const inQueue = new Set<number>([starterIdx]);
      const queue: Cand[] = [];

      const enqueue = (n: number) => {
        if (inQueue.has(n) || groupOf[n] !== -1 || cells[n]!.polygon.length < 6) return;
        const dx = cells[n]!.centerX - sx;
        const dy = cells[n]!.centerY - sy;
        queue.push({ idx: n, dist2: dx * dx + dy * dy });
        inQueue.add(n);
      };

      for (const n of adj[starterIdx]!) enqueue(n);
      queue.sort((a, b) => a.dist2 - b.dist2);

      while (cellIndices.length <= extra && queue.length > 0) {
        const cand = queue.shift()!;
        if (groupOf[cand.idx] !== -1) continue; // claimed by another starter since enqueue

        groupOf[cand.idx] = groupId;
        cellIndices.push(cand.idx);

        // Expand the frontier from the newly claimed cell.
        for (const n of adj[cand.idx]!) enqueue(n);
        queue.sort((a, b) => a.dist2 - b.dist2);
      }
    }

    rawGroups.push(cellIndices);
  }

  // Cells never reached by any starter become singleton groups.
  for (let i = 0; i < cells.length; i++) {
    if (groupOf[i] === -1) {
      groupOf[i] = rawGroups.length;
      rawGroups.push([i]);
    }
  }

  // --- Phase 3: finalise groups ---
  const fillRng = createRand(seed + ":fill");
  const groups: VoronoiGroup[] = rawGroups.map((cellIndices) => {
    // 10% of groups get a visual feature; the rest are bare terrain.
    let fillType: FillType = null;
    if (fillRng.next() < 0.1) {
      const r2 = fillRng.next();
      fillType = r2 < 0.5 ? "grass" : r2 < 0.85 ? "pebbles" : "empty";
    }
    const [centroidX, centroidY] = groupCentroid(cells, cellIndices);
    return {
      cellIndices,
      boundaryPolygon: computeGroupBoundary(cells, cellIndices),
      centroidX,
      centroidY,
      fillType,
    };
  });

  return { cells, groups };
}
