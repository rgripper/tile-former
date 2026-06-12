import { Container, Graphics } from "pixi.js";
import { createRand } from "./rand.ts";
import type { VoronoiData, VoronoiCell } from "./voronoi.ts";

const GRASS_SHADES = [0x1a5c1a, 0x2d7a2d, 0x3d8f3d, 0x4aaa4a, 0x6bc46b, 0x8aaa4a];
const PEBBLE_SHADES = [0x6a6a6a, 0x7a7a7a, 0x8a8a8a, 0x9a9a9a, 0xaaaaaa, 0xbbbbbb];

function cellInradius(cell: VoronoiCell): number {
  const { polygon, centerX, centerY } = cell;
  let minDist = Infinity;
  for (let i = 0; i < polygon.length - 2; i += 2) {
    const dx = polygon[i]! - centerX;
    const dy = polygon[i + 1]! - centerY;
    minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
  }
  return isFinite(minDist) ? minDist : 16;
}

function addPolyPath(g: Graphics, polygon: number[]) {
  if (polygon.length < 6) return;
  g.moveTo(polygon[0]!, polygon[1]!);
  for (let i = 2; i < polygon.length; i += 2) {
    g.lineTo(polygon[i]!, polygon[i + 1]!);
  }
  g.closePath();
}

export function createLargeVoronoiLayer(data: VoronoiData): Container {
  const container = new Container();
  const g = new Graphics();

  for (const cell of data.cells) {
    addPolyPath(g, cell.polygon);
  }
  g.stroke({ color: 0xffffff, alpha: 0.55, pixelLine: true });

  container.addChild(g);
  return container;
}

export function createSmallVoronoiLayer(data: VoronoiData): Container {
  const container = new Container();
  const g = new Graphics();

  for (const cell of data.cells) {
    addPolyPath(g, cell.polygon);
  }
  g.stroke({ color: 0xffffff, alpha: 0.3, pixelLine: true });

  container.addChild(g);
  return container;
}

export function createVoronoiFeaturesLayer(data: VoronoiData, seed: string): Container {
  const container = new Container();
  const g = new Graphics();
  const rng = createRand(seed + ":voronoi-render");

  for (const cell of data.cells) {
    if (cell.fillType === "grass") drawGrass(g, cell, rng.next);
    else if (cell.fillType === "pebbles") drawPebbles(g, cell, rng.next);
  }

  container.addChild(g);
  return container;
}

function drawGrass(g: Graphics, cell: VoronoiCell, rng: () => number) {
  const r = cellInradius(cell);
  if (r < 2) return;
  const count = 3 + Math.floor(rng() * 3);

  for (let i = 0; i < count; i++) {
    const circR = r * (0.25 + rng() * 0.55) * (1 - i * 0.12);
    const ox = (rng() - 0.5) * r * 0.5;
    const oy = (rng() - 0.5) * r * 0.5;
    const shade = GRASS_SHADES[Math.floor(rng() * GRASS_SHADES.length)]!;
    const alpha = 0.55 + rng() * 0.35;
    g.circle(cell.centerX + ox, cell.centerY + oy, circR);
    g.fill({ color: shade, alpha });
  }
}

function drawPebbles(g: Graphics, cell: VoronoiCell, rng: () => number) {
  const r = cellInradius(cell);
  if (r < 2) return;
  const count = 5 + Math.floor(rng() * 10);

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * r * 0.85;
    const pr = 1 + rng() * 3.5;
    const shade = PEBBLE_SHADES[Math.floor(rng() * PEBBLE_SHADES.length)]!;
    const alpha = 0.65 + rng() * 0.3;
    g.circle(cell.centerX + Math.cos(angle) * dist, cell.centerY + Math.sin(angle) * dist, pr);
    g.fill({ color: shade, alpha });
  }
}
