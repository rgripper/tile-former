import { Container, Graphics } from "pixi.js";
import { createRand } from "./rand.ts";
import type { VoronoiData, VoronoiGroup } from "./voronoi.ts";

const GRASS_SHADES = [0x1a5c1a, 0x2d7a2d, 0x3d8f3d, 0x4aaa4a, 0x6bc46b, 0x8aaa4a];
const PEBBLE_SHADES = [0x6a6a6a, 0x7a7a7a, 0x8a8a8a, 0x9a9a9a, 0xaaaaaa, 0xbbbbbb];

function addPolyPath(g: Graphics, polygon: number[]) {
  if (polygon.length < 6) return;
  g.moveTo(polygon[0]!, polygon[1]!);
  for (let i = 2; i < polygon.length; i += 2) {
    g.lineTo(polygon[i]!, polygon[i + 1]!);
  }
  g.closePath();
}

// Minimum distance from centroid to any polygon vertex (approximates inradius).
function groupInradius(group: VoronoiGroup): number {
  const { boundaryPolygon: poly, centroidX, centroidY } = group;
  let min = Infinity;
  for (let i = 0; i < poly.length - 2; i += 2) {
    const dx = poly[i]! - centroidX;
    const dy = poly[i + 1]! - centroidY;
    min = Math.min(min, Math.sqrt(dx * dx + dy * dy));
  }
  return isFinite(min) ? min : 16;
}

// Ray-casting point-in-polygon test for flat [x0,y0,...] polygon.
function pip(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[2 * i]!, yi = poly[2 * i + 1]!;
    const xj = poly[2 * j]!, yj = poly[2 * j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export function createLargeVoronoiLayer(data: VoronoiData): Container {
  const container = new Container();
  const g = new Graphics();
  for (const cell of data.cells) addPolyPath(g, cell.polygon);
  g.stroke({ color: 0xffffff, alpha: 0.55, pixelLine: true });
  container.addChild(g);
  return container;
}

export function createSmallVoronoiLayer(data: VoronoiData): Container {
  const container = new Container();

  const cellG = new Graphics();
  for (const cell of data.cells) addPolyPath(cellG, cell.polygon);
  cellG.stroke({ color: 0xffffff, alpha: 0.3, pixelLine: true });

  const groupG = new Graphics();
  for (const group of data.groups) {
    if (group.cellIndices.length < 2) continue;
    addPolyPath(groupG, group.boundaryPolygon);
  }
  groupG.stroke({ color: 0x6366f1, alpha: 0.9, width: 3 });

  container.addChild(cellG);
  container.addChild(groupG);
  return container;
}

export function createVoronoiFeaturesLayer(data: VoronoiData, seed: string): Container {
  const container = new Container();
  const featureG = new Graphics();
  const rng = createRand(seed + ":voronoi-render");

  for (const group of data.groups) {
    if (!group.fillType || group.fillType === "empty") continue;
    if (group.boundaryPolygon.length < 6) continue;

    if (group.fillType === "grass") drawGrass(featureG, group, rng.next);
    else if (group.fillType === "pebbles") drawPebbles(featureG, group, rng.next);
  }

  container.addChild(featureG);
  return container;
}

function drawGrass(g: Graphics, group: VoronoiGroup, rng: () => number) {
  const r = groupInradius(group);
  if (r < 2) return;
  const shade = GRASS_SHADES[Math.floor(rng() * GRASS_SHADES.length)]!;
  g.circle(group.centroidX, group.centroidY, r * (0.5 + rng() * 0.45));
  g.fill({ color: shade, alpha: 0.6 + rng() * 0.3 });
}

function drawPebbles(g: Graphics, group: VoronoiGroup, rng: () => number) {
  const r = groupInradius(group);
  if (r < 2) return;
  const poly = group.boundaryPolygon;
  const target = 5 + Math.floor(rng() * 10);
  let placed = 0;

  for (let attempt = 0; placed < target && attempt < target * 6; attempt++) {
    const angle = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * r * 0.9;
    const px = group.centroidX + Math.cos(angle) * dist;
    const py = group.centroidY + Math.sin(angle) * dist;
    if (!pip(px, py, poly)) continue;

    const pr = 1 + rng() * 3.5;
    const shade = PEBBLE_SHADES[Math.floor(rng() * PEBBLE_SHADES.length)]!;
    g.circle(px, py, pr);
    g.fill({ color: shade, alpha: 0.65 + rng() * 0.3 });
    placed++;
  }
}
