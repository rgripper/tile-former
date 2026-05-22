import { useEffect, useMemo, useState } from "react";
import { TileMapView } from "./TileMapView.tsx";
import { Spritesheet } from "pixi.js";
import { Biome } from "./tileMap/Biome.ts";
import {
  generateTileMap,
  MapGenParams,
  defaultMapGenParams,
} from "./tileMap/generateTileMap.ts";
import { TileProperties } from "./tileMap/TileProperties.ts";
import { ParamsPanel } from "./ParamsPanel.tsx";
import { TileInfo } from "./TileInfo.tsx";

export function TileMapTool({
  biomes,
  tileSpritesheet,
}: {
  biomes: Biome[];
  tileSpritesheet: Spritesheet;
}) {
  const [params, setParams] = useState<MapGenParams>(defaultMapGenParams);
  const [genParams, setGenParams] = useState<MapGenParams>(defaultMapGenParams);
  const [hoveredTileIndex, setHoveredTileIndex] = useState<{
    x: number;
    y: number;
  }>();

  useEffect(() => {
    const timer = setTimeout(() => setGenParams(params), 250);
    return () => clearTimeout(timer);
  }, [params]);

  const tileMap = useMemo(() => generateTileMap(genParams), [genParams]);

  const setBase = (key: keyof TileProperties, value: number) =>
    setParams((p) => ({ ...p, base: { ...p.base, [key]: value } }));

  const setSwing = (key: keyof TileProperties, value: number) =>
    setParams((p) => ({ ...p, swing: { ...p.swing, [key]: value } }));

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex flex-row gap-4 p-2">
        <ParamsPanel params={params} onBaseChange={setBase} onSwingChange={setSwing} />
        <TileInfo
          biomes={biomes}
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
