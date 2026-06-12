import { useCallback, useEffect, useMemo, useState } from "react";
import { TileMapView } from "./TileMapView.tsx";
import { Spritesheet } from "pixi.js";
import {
  generateTileMap,
  dressTileMap,
  type Biome,
  type PipelineConfig,
  defaultPipelineConfig,
} from "@tile-former/tilegen";
import { PipelinePanel } from "./PipelinePanel.tsx";
import { TileInfo } from "./TileInfo.tsx";
import { Tile } from "@tile-former/tilegen";
import { generateLargeVoronoi, generateSmallVoronoi } from "./voronoi.ts";

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
  const [showLargeVoronoi, setShowLargeVoronoi] = useState(true);
  const [showSmallVoronoi, setShowSmallVoronoi] = useState(true);
  const [showVoronoiFeatures, setShowVoronoiFeatures] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setGenConfig(config), 250);
    return () => clearTimeout(timer);
  }, [config]);

  const tileMap = useMemo(() => {
    const tiles = generateTileMap(genConfig);
    dressTileMap(tiles, genConfig);
    return tiles;
  }, [genConfig]);

  const largeVoronoiData = useMemo(
    () => generateLargeVoronoi(genConfig.seed),
    [genConfig.seed],
  );

  const smallVoronoiData = useMemo(
    () => generateSmallVoronoi(genConfig.seed),
    [genConfig.seed],
  );

  const setParam = (key: keyof PipelineConfig, value: number | string) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const handleTileClick = useCallback((tile: Tile) => setHoveredTileIndex(tile.index), []);

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex flex-row gap-4 p-2">
        <PipelinePanel
          config={config}
          onChange={setParam}
          showLargeVoronoi={showLargeVoronoi}
          showSmallVoronoi={showSmallVoronoi}
          showVoronoiFeatures={showVoronoiFeatures}
          onToggleLargeVoronoi={setShowLargeVoronoi}
          onToggleSmallVoronoi={setShowSmallVoronoi}
          onToggleVoronoiFeatures={setShowVoronoiFeatures}
        />
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
          onTileClick={handleTileClick}
          largeVoronoiData={largeVoronoiData}
          smallVoronoiData={smallVoronoiData}
          seed={genConfig.seed}
          showLargeVoronoi={showLargeVoronoi}
          showSmallVoronoi={showSmallVoronoi}
          showVoronoiFeatures={showVoronoiFeatures}
        />
      </div>
    </div>
  );
}
