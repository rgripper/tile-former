import { useEffect, useMemo, useState } from "react";
import type { DesignInput } from "../core/types.ts";
import { resolveStyle } from "../core/resolve.ts";
import { biomeToInput } from "../core/biomeInput.ts";
import { biomes } from "@tile-former/tilegen";
import { buildAtlas, materialsFromStyle } from "../core/atlas.ts";
import { renderTerrain } from "../core/terrain.ts";
import { PropertyPanel } from "./PropertyPanel.tsx";
import { TileCanvas } from "./TileCanvas.tsx";
import { BiomeGallery } from "./BiomeGallery.tsx";
import { PalettePanel } from "./PalettePanel.tsx";
import { AtlasPanel } from "./AtlasPanel.tsx";
import { TerrainPreview } from "./TerrainPreview.tsx";
import { uniformField } from "./previewUtils.ts";

const initialInput: DesignInput = biomeToInput(biomes[0]!);

// The biome-mix and gallery panels are below the fold and independent of the
// tile being designed; mounting them after first idle keeps their bakes off
// the initial-load critical path (they were ~400ms of it).
function useIdleMount(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(() => setMounted(true));
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(t);
  }, []);
  return mounted;
}

// The close-up panel's patch size. A single diamond is no longer a meaningful
// unit (milestone T) — every material boundary lives *inside* a dual cell, so
// the smallest thing that shows what an input resolves to is a small flat
// patch, magnified.
const CLOSEUP = 3;
const CLOSEUP_ZOOM = 4;

export function App() {
  const [input, setInput] = useState<DesignInput>(initialInput);
  const [seed, setSeed] = useState(1234);

  const style = useMemo(() => resolveStyle(input), [input]);

  // The default-config atlas for the selected style, built once here instead of
  // in AtlasPanel: TerrainPreview's field atlas is a superset of these
  // materials, so on load the second build is cut-and-pack only (variant
  // textures are cached in atlas.ts) and the panel renders immediately.
  const styleRequests = useMemo(() => materialsFromStyle(style), [style]);
  const styleAtlas = useMemo(() => buildAtlas(styleRequests, { seed }), [styleRequests, seed]);
  // The close-up reuses that same atlas — a flat patch straddles no level, so
  // it needs no clipped variants and every lookup it makes is already there.
  const closeUp = useMemo(
    () => renderTerrain(uniformField(input, CLOSEUP), styleAtlas, { seed }).buffer,
    [input, styleAtlas, seed],
  );
  const idlePanels = useIdleMount();

  return (
    <div className="app">
      <PropertyPanel input={input} seed={seed} onChange={setInput} onSeed={setSeed} />

      <div className="preview-col">
        <div className="panel">
          <h2>
            Close-up — {CLOSEUP}×{CLOSEUP} @ {CLOSEUP_ZOOM}×
          </h2>
          <TileCanvas buffer={closeUp} zoom={CLOSEUP_ZOOM} />
          <div className="readout">
            <div>
              {style.surface.substrates.map((s) => (
                <span className="chip" key={s.id}>
                  {s.id} {(s.weight * 100).toFixed(0)}%
                </span>
              ))}
            </div>
            <div>
              {style.surface.mats.length === 0 && <span className="chip">no mats</span>}
              {style.surface.mats.map((m) => (
                <span className="chip" key={m.id}>
                  {m.id} {(m.coverage * 100).toFixed(0)}%
                </span>
              ))}
            </div>
            <div>
              <span className="chip">fern {(style.scatter.fern * 100).toFixed(0)}%</span>
              <span className="chip">reed {(style.scatter.reed * 100).toFixed(0)}%</span>
              <span className="chip">flower {(style.scatter.flower * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <TerrainPreview input={input} seed={seed} />

        <PalettePanel input={input} />

        <AtlasPanel style={style} seed={seed} defaultAtlas={styleAtlas} />

        {idlePanels && <BiomeGallery seed={seed} />}
      </div>
    </div>
  );
}
