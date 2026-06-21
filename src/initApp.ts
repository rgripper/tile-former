import { Viewport } from "pixi-viewport";
import { Container, Application, Spritesheet, Graphics } from "pixi.js";
import { gridSize, tileSide } from "./config.ts";
import { Tile, Biome, biomes } from "@tile-former/tilegen";
import { createSmallVoronoiLayer, createVoronoiFeaturesLayer } from "./voronoiRenderer.ts";
import type { VoronoiData } from "./voronoi.ts";

export async function initApp({
  tileMap,
  tileSpritesheet,
  container,
  onTileClick,
  smallVoronoiData,
  seed,
  showSmallVoronoi,
  showVoronoiFeatures,
}: {
  tileMap: Tile[][];
  tileSpritesheet: Spritesheet;
  container: HTMLElement;
  onTileClick: (tile: Tile) => void;
  smallVoronoiData: VoronoiData;
  seed: string;
  showSmallVoronoi: boolean;
  showVoronoiFeatures: boolean;
}) {
  const app = new Application();
  await app.init({
    resizeTo: container,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const viewport = new Viewport({
    worldWidth: gridSize.width * tileSide,
    worldHeight: gridSize.height * tileSide,
    noTicker: true,
    ticker: app.ticker,
    events: app.renderer.events,
  });

  viewport.drag().pinch().wheel().decelerate();
  viewport.setZoom(0.2);

  app.stage.addChild(viewport);

  const tileGridContainer = createTileGridSprites(tileMap, biomes, tileSpritesheet, onTileClick);
  viewport.addChild(tileGridContainer);

  const voronoiFeaturesLayer = createVoronoiFeaturesLayer(smallVoronoiData, seed);
  voronoiFeaturesLayer.visible = showVoronoiFeatures;
  viewport.addChild(voronoiFeaturesLayer);

  const smallVoronoiLayer = createSmallVoronoiLayer(smallVoronoiData);
  smallVoronoiLayer.visible = showSmallVoronoi;
  viewport.addChild(smallVoronoiLayer);

  const soilGridContainer = createSoilGridSprites(tileMap);
  viewport.addChild(soilGridContainer);

  return {
    app,
    viewport,
    smallVoronoiLayer,
    voronoiFeaturesLayer,
  };
}

function createTileGridSprites(
  tileMap: Tile[][],
  biomes: Biome[],
  tileSpritesheet: Spritesheet,
  onTileClick: (tile: Tile) => void,
) {
  const container = new Container();

  for (let row = 0; row < tileMap.length; row++) {
    for (let col = 0; col < tileMap[row]!.length; col++) {
      const tile = tileMap[row]![col]!;

      const tileGraphics = new Graphics();

      tileGraphics.x = tile.index.x * tileSide;
      tileGraphics.y = tile.index.y * tileSide;
      tileGraphics.width = tileSide;
      tileGraphics.height = tileSide;

      tileGraphics.rect(0, 0, tileSide, tileSide);

      if (tile.water) {
        tileGraphics.fill({ color: 0x2e6db4 });
      } else {
        tileGraphics.fill(
          biomes.find((b) => b.id === tile.biomeId)?.textureColor ?? "#888888",
        );

        if (tile.surfaceType === "rocky") {
          tileGraphics.rect(0, 0, tileSide, tileSide);
          tileGraphics.fill({ color: 0x888888, alpha: 0.45 });
        } else if (tile.surfaceType === "sandy") {
          tileGraphics.rect(0, 0, tileSide, tileSide);
          tileGraphics.fill({ color: 0xd4a86a, alpha: 0.45 });
        }

        if (tile.riparian) {
          tileGraphics.rect(0, 0, tileSide, tileSide);
          tileGraphics.fill({ color: 0x4a90b8, alpha: 0.3 });
        }
      }

      tileGraphics.interactive = true;
      tileGraphics.on("click", () => onTileClick(tile));
      container.addChild(tileGraphics);
    }
  }
  return container;
}

function createSoilGridSprites(tileMap: Tile[][]) {
  const gridContainer = new Container();

  for (let row = 0; row < tileMap.length; row++) {
    for (let col = 0; col < tileMap[row]!.length; col++) {
      const tile = tileMap[row]![col]!;

      const tileContainer = new Container();
      const tileBorder = new Graphics();
      tileBorder.strokeStyle = {
        color: 0xffffff,
        alpha: 0.1,
        pixelLine: true,
      };
      tileBorder.rect(0, 0, tileSide, tileSide);
      tileBorder.stroke();

      tileContainer.x = tile.index.x * tileSide;
      tileContainer.y = tile.index.y * tileSide;
      tileContainer.width = tileSide;
      tileContainer.height = tileSide;
      tileContainer.addChild(tileBorder);
      gridContainer.addChild(tileContainer);
    }
  }
  return gridContainer;
}
