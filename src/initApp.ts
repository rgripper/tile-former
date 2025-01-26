import { Viewport } from "pixi-viewport";
import { Container, Application, Spritesheet, Sprite, Graphics } from "pixi.js";
import { gridSize, tileSide } from "./config.ts";
import { Tile } from "./tileMap/tile.ts";
import { tileTypes } from "./tileMap/generateTileMap.ts";

export async function initApp({
  tileMap,
  tileSpritesheet,
  container,
  onTileClick,
}: {
  tileMap: Tile[][];
  tileSpritesheet: Spritesheet;
  container: HTMLElement;
  onTileClick: (tile: Tile) => void;
}) {
  const app = new Application();
  await app.init({
    resizeTo: container,
    antialias: true,
  });

  const viewport = new Viewport({
    worldWidth: gridSize.width * tileSide,
    worldHeight: gridSize.height * tileSide,
    noTicker: true,
    ticker: app.ticker,
    events: app.renderer.events,
  });

  viewport.drag().pinch().wheel().decelerate();
  //viewport.moveCenter(450, 250);
  viewport.setZoom(0.2);

  app.stage.addChild(viewport);

  const tileGridContainer = createTileGridSprites(
    tileMap,
    tileSpritesheet,
    onTileClick
  );
  viewport.addChild(tileGridContainer);

  const soilGridContainer = createSoilGridSprites(tileMap);
  viewport.addChild(soilGridContainer);

  return {
    app,
    viewport,
  };
}

function createTileGridSprites(
  tileMap: Tile[][],
  tileSpritesheet: Spritesheet,
  onTileClick: (tile: Tile) => void
) {
  const container = new Container();

  for (let row = 0; row < tileMap.length; row++) {
    for (let col = 0; col < tileMap[row]!.length; col++) {
      const tile = tileMap[row]![col]!;

      const tileGraphics = new Graphics(); //new Sprite(tileSpritesheet.textures[tile.typeId]);

      tileGraphics.x = tile.index.x * tileSide;
      tileGraphics.y = tile.index.y * tileSide;
      tileGraphics.width = tileSide;
      tileGraphics.height = tileSide;

      tileGraphics.rect(0, 0, tileSide, tileSide);
      tileGraphics.fill(tile.biome.textureColor);
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
      // this sprite will contain 4 bars, each representing a soil component

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
