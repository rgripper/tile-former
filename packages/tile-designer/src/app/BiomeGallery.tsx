import { useMemo } from "react";
import { biomes } from "@tile-former/tilegen";
import { biomeToInput } from "../core/biomeInput.ts";
import { resolveStyle } from "../core/resolve.ts";
import { buildAtlas, mergeMaterials } from "../core/atlas.ts";
import { fieldMaterials } from "../core/compose.ts";
import { renderTerrain } from "../core/terrain.ts";
import { TileCanvas } from "./TileCanvas.tsx";
import { uniformField } from "./previewUtils.ts";

// One patch per biome at its paramDist means — validates that the surface
// taxonomy produces sensible, distinct ground for every biome at a glance.
//
// A patch, not a tile: v2 decides a tile's appearance from the four dual cells
// around it, so a lone diamond can't show what a material actually looks like
// laid out (PLAN.md, milestone T). 2x2 is the smallest field with a complete
// interior dual cell — every corner of cell (0,0) is a real tile — and it bakes
// to 192x96, which fits a gallery column at native scale. 3x3 is 256x128 and
// would have to be downscaled to fit, which is not a thing to do to pixel art.
// Flat and level 0, so this stays a reading of the *material*, with no cliffs or
// altitude to confound it.
const PATCH = 2;

// One atlas for all 44 biomes rather than one each: the whole point of the
// redesign is that materials are shared, and building 44 atlases to draw 44
// patches would measure the opposite. Shape variety is dialled down because
// this panel is a taxonomy check — whether a biome reads as the right ground —
// not a repetition check, which is what `AtlasPanel` and the terrain preview
// are for.
const GALLERY_ATLAS = { fullShapes: 4, biasLevels: 1, partialShapes: 2 } as const;

export function BiomeGallery({ seed }: { seed: number }) {
  const cells = useMemo(() => {
    const entries = biomes.map((biome) => {
      const input = biomeToInput(biome);
      return { biome, input, field: uniformField(input, PATCH), surface: resolveStyle(input).surface };
    });
    const atlas = buildAtlas(
      mergeMaterials(entries.map((e) => fieldMaterials(e.field))),
      { seed, ...GALLERY_ATLAS },
    );
    return entries.map((e) => ({
      biome: e.biome,
      surface: e.surface,
      buffer: renderTerrain(e.field, atlas, { seed }).buffer,
    }));
  }, [seed]);

  return (
    <div className="panel">
      <h2>
        Biome gallery — {PATCH}×{PATCH} patches
      </h2>
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
