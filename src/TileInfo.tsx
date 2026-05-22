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
    <div className="h-60">
      {tile && (
        <>
          ({tile.index.x},{tile.index.y}) {biomes[tile.biomeId].name}
          {Object.entries(tile).map(([key, value]) => (
            <div key={key}>
              {key}: {value.toString()}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
