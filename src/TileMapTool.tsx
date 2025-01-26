import { useLayoutEffect, useMemo, useState } from "react";
import { TileMapView } from "./TileMapView.tsx";
import { Tile } from "./tileMap/tile.ts";
import { Spritesheet } from "pixi.js";

export function TileMapTool({
  tileMap,
  tileSpritesheet,
}: {
  tileMap: Tile[][];
  tileSpritesheet: Spritesheet;
}) {
  const [hoveredTileIndex, setHoveredTileIndex] = useState<{
    x: number;
    y: number;
  }>();

  return (
    <div className="flex-1 flex flex-col">
      <div>
        <TileInfo
          tile={
            hoveredTileIndex && tileMap[hoveredTileIndex.x]![hoveredTileIndex.y]
          }
        />
      </div>
      <div className="flex-1 flex flex-col">
        <TileMapView
          tileSpritesheet={tileSpritesheet}
          tileMap={tileMap}
          onTileClick={(x) => setHoveredTileIndex(x.index)}
        />
      </div>
    </div>
  );
}

function TileInfo({ tile }: { tile: Tile | undefined }) {
  console.log(tile);
  return (
    <div className="h-60">
      {tile && (
        <>
          ({tile.index.x},{tile.index.y}) {tile.biome.name}
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
