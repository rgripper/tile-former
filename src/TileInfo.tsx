import { Biome } from "./tileMap/Biome.ts";
import { Tile } from "./tileMap/tile.ts";

export function TileInfo({
  tile,
  biomes,
}: {
  tile: Tile | undefined;
  biomes: Biome[];
}) {
  return (
    <div className="h-60 text-xs overflow-y-auto">
      {tile && (
        <>
          <div className="mb-1">
            ({tile.index.x},{tile.index.y}){" "}
            {biomes.find((b) => b.id === tile.biomeId)?.name}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4">
            {Object.entries(tile).map(([key, value]) => (
              <div key={key} className="truncate">
                <span className="opacity-60">{key}:</span> {value?.toString() ?? "—"}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
