import { useMemo, useState } from "react";
import type { DesignInput } from "../core/types.ts";
import { MAX_FLOORS } from "../core/types.ts";
import { resolveStyle } from "../core/resolve.ts";
import { fieldMaterials, makeField, tileSurface, type TileField } from "../core/compose.ts";
import { buildAtlas } from "../core/atlas.ts";
import { defaultLevelFrequency, renderTerrain, straddleFraction, terrainLevel } from "../core/terrain.ts";
import { TileCanvas } from "./TileCanvas.tsx";
import { clusterAt, jitterInput, pickClusters } from "./previewUtils.ts";

// Compositing (unlike v1's per-pixel bake) is cheap enough to run synchronously
// at every size below — no chunked/progress-bar bake loop needed, unlike
// MixedBiomePreview, whose whole reason for existing was v1's per-tile cost.
const GRID_OPTIONS = [12, 16, 24, 32] as const;
type GridSize = (typeof GRID_OPTIONS)[number];

const RADIUS_RANGE: Record<GridSize, [number, number]> = {
  12: [1.5, 3],
  16: [1.5, 3.5],
  24: [2, 5],
  32: [2.5, 6],
};
const CLUSTER_COUNT = 2;

// "relief" 0 collapses to a flat field; 2 is the measured sweet spot (see
// terrain.test.ts) — a handful of plateaus at a straddle rate in the
// neighbourhood of milestone D's real-map figure (17.2%) rather than either a
// flat field or wall-to-wall single-tile noise.
const RELIEF_OPTIONS = [0, 1, 2, 3] as const;

function buildField(
  input: DesignInput,
  seed: number,
  grid: GridSize,
  baseLevel: number,
  relief: number,
): TileField {
  const half = grid / 2;
  const freq = defaultLevelFrequency(grid);
  const clusters = pickClusters(input.biomeId, seed, grid, grid, RADIUS_RANGE[grid], CLUSTER_COUNT);
  return makeField(grid, grid, (c, r) => {
    const tx = c - half;
    const ty = r - half;
    const cluster = clusterAt(tx, ty, clusters);
    const base = cluster ? cluster.input : input;
    const level = terrainLevel(c, r, seed, baseLevel, relief, freq);
    const withAltitude: DesignInput = { ...jitterInput(base, tx, ty), altitude: level / MAX_FLOORS };
    return tileSurface(resolveStyle(withAltitude), withAltitude.altitude);
  });
}

// The dual-grid composition's own primary surface (PLAN.md, milestone T): a
// patch spanning several floor levels, cliff faces and rims, and biome mixing
// judged together instead of one zoomed tile at a time.
export function TerrainPreview({ input, seed }: { input: DesignInput; seed: number }) {
  const [grid, setGrid] = useState<GridSize>(16);
  const [baseLevel, setBaseLevel] = useState(3);
  const [relief, setRelief] = useState(2);
  const [zoomedIn, setZoomedIn] = useState(false);
  // Bake resolution is 2× the real screen tile, so 0.25× reads as half native
  // game size and 0.5× lands on 1:1 native game pixels — same convention as
  // the other multi-tile previews.
  const zoom = zoomedIn ? 0.5 : 0.25;

  const field = useMemo(
    () => buildField(input, seed, grid, baseLevel, relief),
    [input, seed, grid, baseLevel, relief],
  );

  const requests = useMemo(() => fieldMaterials(field), [field]);
  const atlas = useMemo(() => buildAtlas(requests, { seed }), [requests, seed]);
  const render = useMemo(() => renderTerrain(field, atlas, { seed }), [field, atlas, seed]);

  const stats = useMemo(() => {
    const levels = new Set<number>();
    for (let r = 0; r < field.height; r++) {
      for (let c = 0; c < field.width; c++) levels.add(field.at(c, r).level);
    }
    return {
      levels: [...levels].sort((a, b) => a - b),
      straddle: straddleFraction(field),
    };
  }, [field]);

  return (
    <div className="panel">
      <h2>
        {grid}×{grid} terrain preview
      </h2>
      <div className="row">
        <div className="segmented">
          {GRID_OPTIONS.map((g) => (
            <button key={g} className={g === grid ? "active" : undefined} onClick={() => setGrid(g)}>
              {g}×{g}
            </button>
          ))}
        </div>
        <label>
          base floor
          <input
            type="range"
            min={0}
            max={MAX_FLOORS}
            step={1}
            value={baseLevel}
            onChange={(e) => setBaseLevel(Number(e.target.value))}
          />
          {baseLevel}
        </label>
        <div className="segmented">
          {RELIEF_OPTIONS.map((r) => (
            <button key={r} className={r === relief ? "active" : undefined} onClick={() => setRelief(r)}>
              relief {r}
            </button>
          ))}
        </div>
        <button onClick={() => setZoomedIn((z) => !z)}>{zoomedIn ? "2× zoom (native)" : "2× zoom"}</button>
      </div>
      <div className="row">
        <span className="legend">
          <span className="chip">floor levels: {stats.levels.join(", ")}</span>
          <span className="chip">{(stats.straddle * 100).toFixed(1)}% cells straddle a level</span>
          <span className="chip">{atlas.stats.sprites} sprites</span>
          <span className="chip">
            {atlas.stats.pages} page{atlas.stats.pages === 1 ? "" : "s"}
          </span>
          <span className="chip">{atlas.stats.buildMs} ms build</span>
        </span>
      </div>
      <div className="scroll-x">
        <TileCanvas buffer={render.buffer} zoom={zoom} />
      </div>
    </div>
  );
}
