import { useMemo, useState } from "react";
import type { DesignInput, RenderStyle } from "../core/types.ts";
import { DEFAULT_RENDER } from "../core/types.ts";
import { resolveStyle } from "../core/resolve.ts";
import { bakeTile } from "../core/bake.ts";
import { biomeToInput } from "../core/biomeInput.ts";
import { biomes } from "@tile-former/tilegen";
import { PropertyPanel } from "./PropertyPanel.tsx";
import { TileCanvas } from "./TileCanvas.tsx";
import { BiomeGallery } from "./BiomeGallery.tsx";
import { MixedBiomePreview } from "./MixedBiomePreview.tsx";

const initialInput: DesignInput = biomeToInput(biomes[0]!);

export function App() {
  const [input, setInput] = useState<DesignInput>(initialInput);
  const [seed, setSeed] = useState(1234);
  const [render, setRender] = useState<RenderStyle>(DEFAULT_RENDER);

  const style = useMemo(() => resolveStyle(input), [input]);
  const buffer = useMemo(() => bakeTile(style, 0, 0, seed, render), [style, seed, render]);

  return (
    <div className="app">
      <PropertyPanel
        input={input}
        seed={seed}
        render={render}
        onChange={setInput}
        onSeed={setSeed}
        onRender={setRender}
      />

      <div className="preview-col">
        <div className="panel">
          <h2>Preview — 128×64 @ 4×</h2>
          <TileCanvas buffer={buffer} zoom={4} />
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

        <MixedBiomePreview input={input} seed={seed} render={render} />

        <BiomeGallery seed={seed} render={render} />
      </div>
    </div>
  );
}
