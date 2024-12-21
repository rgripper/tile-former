import { useState } from "react";
import { TileMapView } from "./TileMapView.tsx";
import { Tile, TileType } from "./tile.ts";
import { Spritesheet } from "pixi.js";

export function TileMapTool({
  tileMap,
  tileTypes,
  tileSpritesheet,
  canvasSize,
}: {
  tileMap: Tile[][];
  tileTypes: TileType[];
  tileSpritesheet: Spritesheet;
  canvasSize: { width: number; height: number };
}) {
  const [hoveredTileIndex, setHoveredTileIndex] = useState<{
    x: number;
    y: number;
  }>();

  return (
    <div>
      <div>
        <TileInfo
          tile={
            hoveredTileIndex && tileMap[hoveredTileIndex.x]![hoveredTileIndex.y]
          }
          tileTypes={tileTypes}
        />
        <div style={{ width: canvasSize.width, height: canvasSize.height }}>
          <TileMapView
            tileSpritesheet={tileSpritesheet}
            tileMap={tileMap}
            canvasSize={canvasSize}
          />
        </div>
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
    <div style={{ height: "5rem" }}>
      {tile && (
        <>
          ({tile.index.x},{tile.index.y}) {tileTypes[tile.typeId]!.name}
        </>
      )}
    </div>
  );
}
