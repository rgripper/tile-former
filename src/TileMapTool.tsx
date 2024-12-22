import { useLayoutEffect, useMemo, useState } from "react";
import { TileMapView } from "./TileMapView.tsx";
import { Tile, TileType } from "./tile.ts";
import { Spritesheet } from "pixi.js";

export function TileMapTool({
  tileMap,
  tileTypes,
  tileSpritesheet,
}: {
  tileMap: Tile[][];
  tileTypes: TileType[];
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
          tileTypes={tileTypes}
        />
      </div>
      <div className="flex-1 flex flex-col">
        <TileMapView tileSpritesheet={tileSpritesheet} tileMap={tileMap} />
      </div>
    </div>
  );
}

function TileInfo({
  tile,
  tileTypes,
}: {
  tile: Tile | undefined;
  tileTypes: TileType[];
}) {
  return (
    <div className="h-5">
      {tile && (
        <>
          ({tile.index.x},{tile.index.y}) {tileTypes[tile.typeId]!.name}
        </>
      )}
    </div>
  );
}
