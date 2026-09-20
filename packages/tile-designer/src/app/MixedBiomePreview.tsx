import { useEffect, useState } from "react";
import type { DesignInput, RenderStyle } from "../core/types.ts";
import { TILE_H, TILE_W } from "../core/types.ts";
import { resolveStyle } from "../core/resolve.ts";
import { bakeTile } from "../core/bake.ts";
import { aliasBuffer, makeBuffer, type PixelBuffer } from "../core/pixels.ts";
import { TileCanvas } from "./TileCanvas.tsx";
import { blit, clusterAt, jitterInput, pickClusters, type Cluster } from "./previewUtils.ts";

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
  // The bake is 1:1 with the real screen tile (see TILE_W/TILE_H), so 0.5×
  // here reads as half native game size — a compact overview — and the toggle
  // lands exactly on 1:1 native game pixels.
  const [zoomedIn, setZoomedIn] = useState(false);
  const zoom = zoomedIn ? 1 : 0.5;

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [buffer, setBuffer] = useState<PixelBuffer>(() => makeBuffer(TILE_W * baked.grid, TILE_H * baked.grid));
  const [rowsDone, setRowsDone] = useState(0);
  const baking = rowsDone < baked.grid;

  useEffect(() => {
    let cancelled = false;
    const grid = baked.grid;
    const half = grid / 2;
    const activeClusters = pickClusters(baked.input.biomeId, baked.seed, grid, grid, RADIUS_RANGE[grid], CLUSTER_COUNT);
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
        const style = resolveStyle(jitterInput(base, tx, ty, seed));
        const tile = bakeTile(style, ox, oy, baked.seed, baked.render);
        blit(composite, tile, ox + (TILE_W * (grid - 1)) / 2, oy + TILE_H * half);
      }
      ty++;
      const done = ty + half;
      setRowsDone(done);
      // New object reference (not every row) so TileCanvas's effect (keyed
      // off buffer identity) picks it up and repaints.
      if (done % REPAINT_EVERY === 0 || done === grid) setBuffer(aliasBuffer(composite));
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
        <button onClick={() => setZoomedIn((z) => !z)}>{zoomedIn ? "1:1 native" : "zoom to 1:1"}</button>
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
