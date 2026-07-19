import { useEffect, useState } from "react";
import { biomes } from "@tile-former/tilegen";
import type { Biome } from "@tile-former/tilegen";
import type { DesignInput, RenderStyle } from "../core/types.ts";
import { TILE_H, TILE_W } from "../core/types.ts";
import { resolveStyle } from "../core/resolve.ts";
import { bakeTile } from "../core/bake.ts";
import { makeBuffer, type PixelBuffer } from "../core/pixels.ts";
import { makeRng } from "../core/rng.ts";
import { biomeToInput } from "../core/biomeInput.ts";
import { TileCanvas } from "./TileCanvas.tsx";
import { blit, jitterInput } from "./previewUtils.ts";

// Selectable grid extents in tiles. The largest (576 tiles) is ~1.5s to bake
// on a modern machine, so this preview only bakes on demand (see
// BakedSnapshot below) rather than reactively on every slider tick like the
// smaller previews, and bakes one row per timer tick so the button click
// doesn't freeze the tab and the progress bar has something real to report.
const GRID_OPTIONS = [8, 16, 24] as const;
type GridSize = (typeof GRID_OPTIONS)[number];

const CLUSTER_COUNT = 2;

// Cluster radius bounds, tuned per grid size so a cluster reads as a clear
// minority patch (not a dominant chunk) whether the grid is a quick 8×8 nick
// or the full 24×24 field.
const RADIUS_RANGE: Record<GridSize, [number, number]> = {
  8: [1, 2],
  16: [1.5, 3.5],
  24: [2, 5],
};

type Harmonic = { amp: number; freq: number; phase: number };
type Cluster = { biome: Biome; input: DesignInput; cx: number; cy: number; radius: number; harmonics: Harmonic[] };

function pickBiome(pool: Biome[], rng: () => number, avoid: Set<number>): Biome {
  let biome = pool[Math.floor(rng() * pool.length)]!;
  for (let guard = 0; avoid.has(biome.id) && guard < 8; guard++) {
    biome = pool[Math.floor(rng() * pool.length)]!;
  }
  return biome;
}

// Wobbly-circle blob: radius perturbed by a few random sine harmonics so the
// cluster boundary reads as an organic patch instead of a hard disc.
function makeCluster(biome: Biome, cx: number, cy: number, radius: number, rng: () => number): Cluster {
  const harmonics: Harmonic[] = [1, 2, 3].map((freq) => ({
    amp: radius * (0.15 + rng() * 0.15),
    freq,
    phase: rng() * Math.PI * 2,
  }));
  return { biome, input: biomeToInput(biome), cx, cy, radius, harmonics };
}

// Two clusters of different sizes, placed on roughly opposite sides of the
// grid so the selected biome keeps the majority of the area.
function pickClusters(selectedBiomeId: number | null, seed: number, grid: GridSize): Cluster[] {
  const half = grid / 2;
  const [minRadius, maxRadius] = RADIUS_RANGE[grid];
  const rng = makeRng((seed ^ 0x5eed1) >>> 0);
  const pool = biomes.filter((b) => b.id !== selectedBiomeId);
  if (pool.length === 0) return [];

  const avoid = new Set<number>(selectedBiomeId === null ? [] : [selectedBiomeId]);
  const baseAngle = rng() * Math.PI * 2;
  const clusters: Cluster[] = [];
  for (let i = 0; i < CLUSTER_COUNT; i++) {
    const biome = pickBiome(pool, rng, avoid);
    avoid.add(biome.id);
    const radius = minRadius + rng() * (maxRadius - minRadius);
    const angle = baseAngle + i * Math.PI + (rng() - 0.5) * 1.2;
    const dist = half * 0.35 + rng() * half * 0.35;
    const cx = Math.round(Math.cos(angle) * dist);
    const cy = Math.round(Math.sin(angle) * dist);
    clusters.push(makeCluster(biome, cx, cy, radius, rng));
  }
  return clusters;
}

function clusterAt(tx: number, ty: number, clusters: Cluster[]): Cluster | null {
  for (const cluster of clusters) {
    const dx = tx - cluster.cx;
    const dy = ty - cluster.cy;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    let r = cluster.radius;
    for (const h of cluster.harmonics) r += h.amp * Math.sin(h.freq * angle + h.phase);
    if (dist <= r) return cluster;
  }
  return null;
}

type BakedSnapshot = { input: DesignInput; seed: number; render: RenderStyle; grid: GridSize };

// N×N iso field of the selected biome with two smaller biome clusters cut
// in — validates how neighboring biomes read against each other at a glance
// without either cluster outnumbering the selected biome's own tiles.
export function MixedBiomePreview({
  input,
  seed,
  render,
}: {
  input: DesignInput;
  seed: number;
  render: RenderStyle;
}) {
  const [baked, setBaked] = useState<BakedSnapshot>({ input, seed, render, grid: 8 });
  const stale = baked.input !== input || baked.seed !== seed || baked.render !== render;
  // Bake resolution is 2× the real screen tile (see TILE_W/TILE_H), so 0.25×
  // here reads as half native game size — a compact overview — and the 2×
  // toggle lands exactly on 1:1 native game pixels.
  const [zoomedIn, setZoomedIn] = useState(false);
  const zoom = zoomedIn ? 0.5 : 0.25;

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [buffer, setBuffer] = useState<PixelBuffer>(() => makeBuffer(TILE_W * baked.grid, TILE_H * baked.grid));
  const [rowsDone, setRowsDone] = useState(0);
  const baking = rowsDone < baked.grid;

  useEffect(() => {
    let cancelled = false;
    const grid = baked.grid;
    const half = grid / 2;
    const activeClusters = pickClusters(baked.input.biomeId, baked.seed, grid);
    const composite = makeBuffer(TILE_W * grid, TILE_H * grid);
    setClusters(activeClusters);
    setBuffer(composite);
    setRowsDone(0);

    // Redrawing the canvas means cloning the full composite into an ImageData
    // and building an ImageBitmap from it — real work for a large buffer.
    // Doing that every single row is wasteful and can strain the GC, so only
    // repaint every few rows; the progress bar itself updates every row.
    const REPAINT_EVERY = 4;
    let ty = -half;
    function bakeRow() {
      if (cancelled) return;
      for (let tx = -half; tx < half; tx++) {
        const cluster = clusterAt(tx, ty, activeClusters);
        const base = cluster ? cluster.input : baked.input;
        const ox = ((tx - ty) * TILE_W) / 2;
        const oy = ((tx + ty) * TILE_H) / 2;
        const style = resolveStyle(jitterInput(base, tx, ty));
        const tile = bakeTile(style, ox, oy, baked.seed, baked.render);
        blit(composite, tile, ox + (TILE_W * (grid - 1)) / 2, oy + TILE_H * half);
      }
      ty++;
      const done = ty + half;
      setRowsDone(done);
      // New object reference (not every row) so TileCanvas's effect (keyed
      // off buffer identity) picks it up and repaints.
      if (done % REPAINT_EVERY === 0 || done === grid) setBuffer({ ...composite });
      // setTimeout, not requestAnimationFrame: rAF is throttled/paused by the
      // browser whenever the tab or window isn't visible/focused, which would
      // freeze an in-progress bake indefinitely. A timer keeps running
      // regardless — this is background computation, not a visual animation.
      if (ty < half) setTimeout(bakeRow, 0);
    }
    setTimeout(bakeRow, 0);

    return () => {
      cancelled = true;
    };
  }, [baked]);

  return (
    <div className="panel">
      <h2>
        {baked.grid}×{baked.grid} biome mix check
      </h2>
      <div className="row">
        <div className="segmented">
          {GRID_OPTIONS.map((g) => (
            <button
              key={g}
              className={g === baked.grid ? "active" : undefined}
              disabled={baking}
              onClick={() => setBaked({ input, seed, render, grid: g })}
            >
              {g}×{g}
            </button>
          ))}
        </div>
        <button disabled={baking} onClick={() => setBaked({ ...baked, input, seed, render })}>
          {stale ? "Bake (out of date)" : "Rebake"}
        </button>
        <button onClick={() => setZoomedIn((z) => !z)}>{zoomedIn ? "2× zoom (native)" : "2× zoom"}</button>
        <span className="legend">
          {clusters.map((c, i) => (
            <span className="chip" key={i}>
              cluster {i + 1}: {c.biome.name} (r≈{c.radius.toFixed(1)})
            </span>
          ))}
        </span>
      </div>
      {baking && (
        <div className="progress-row">
          <progress value={rowsDone} max={baked.grid} />
          <span>{Math.round((rowsDone / baked.grid) * 100)}%</span>
        </div>
      )}
      <div className="scroll-x">
        <TileCanvas buffer={buffer} zoom={zoom} />
      </div>
    </div>
  );
}
