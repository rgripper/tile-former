import { useMemo } from "react";
import { biomes } from "@tile-former/tilegen";
import { biomeToInput } from "../core/biomeInput.ts";
import { resolveStyle } from "../core/resolve.ts";
import { paintFlatPreview } from "../core/preview.ts";
import { TileCanvas } from "./TileCanvas.tsx";

// One tile per biome at its paramDist means — validates that the surface
// taxonomy produces sensible, distinct ground for every biome at a glance.
export function BiomeGallery({ seed }: { seed: number }) {
  const cells = useMemo(
    () =>
      biomes.map((biome) => {
        const style = resolveStyle(biomeToInput(biome));
        return {
          biome,
          buffer: paintFlatPreview(style, seed ^ biome.id),
          surface: style.surface,
        };
      }),
    [seed],
  );

  return (
    <div className="panel">
      <h2>Biome gallery</h2>
      <div className="gallery">
        {cells.map(({ biome, buffer, surface }) => (
          <div className="cell" key={biome.id} title={describeSurface(surface)}>
            <TileCanvas buffer={buffer} zoom={1} />
            <div className="name">{biome.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function describeSurface(surface: {
  substrates: Array<{ id: string; weight: number }>;
  mats: Array<{ id: string; coverage: number }>;
}): string {
  const subs = surface.substrates.map((s) => `${s.id} ${(s.weight * 100).toFixed(0)}%`).join(" + ");
  const mats = surface.mats.map((m) => `${m.id} ${(m.coverage * 100).toFixed(0)}%`).join(", ");
  return mats ? `${subs} | ${mats}` : subs;
}
