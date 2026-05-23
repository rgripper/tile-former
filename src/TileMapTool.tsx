import { useEffect, useMemo, useState } from "react";
import { TileMapView } from "./TileMapView.tsx";
import { Spritesheet } from "pixi.js";
import { Biome } from "./tileMap/Biome.ts";
import {
  generateTileMap,
  PipelineConfig,
  defaultPipelineConfig,
} from "./tileGenerator/pipeline.ts";
import { PipelinePanel } from "./PipelinePanel.tsx";
import { TileInfo } from "./TileInfo.tsx";

export function TileMapTool({
  biomes,
  tileSpritesheet,
}: {
  biomes: Biome[];
  tileSpritesheet: Spritesheet;
}) {
  const [config, setConfig] = useState<PipelineConfig>({
    ...defaultPipelineConfig,
    biomes,
  });
  const [genConfig, setGenConfig] = useState<PipelineConfig>({
    ...defaultPipelineConfig,
    biomes,
  });
  const [hoveredTileIndex, setHoveredTileIndex] = useState<{
    x: number;
    y: number;
  }>();

  useEffect(() => {
    const timer = setTimeout(() => setGenConfig(config), 250);
    return () => clearTimeout(timer);
  }, [config]);

  const tileMap = useMemo(() => generateTileMap(genConfig), [genConfig]);

  const setParam = (key: keyof PipelineConfig, value: number | string) =>
    setConfig((c) => ({ ...c, [key]: value }));

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex flex-row gap-4 p-2">
        <PipelinePanel config={config} onChange={setParam} />
        <TileInfo
          biomes={biomes}
          tile={
            hoveredTileIndex &&
            tileMap[hoveredTileIndex.x]?.[hoveredTileIndex.y]
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
