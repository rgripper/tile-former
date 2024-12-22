import { Viewport } from "pixi-viewport";
import { Container, Application, Spritesheet, Sprite, Graphics } from "pixi.js";
import { gridSize, tileSide } from "./config.ts";
import { SoilComponent, Tile } from "./tileMap/tile.ts";

export async function initApp({
  tileMap,
  tileSpritesheet,
  container,
}: {
  tileMap: Tile[][];
  tileSpritesheet: Spritesheet;
  container: HTMLElement;
}) {
  const app = new Application();
  await app.init({
    resizeTo: container,
  });

  const viewport = new Viewport({
    worldWidth: gridSize.width * tileSide,
    worldHeight: gridSize.height * tileSide,
    noTicker: true,
    ticker: app.ticker,
    events: app.renderer.events,
  });

  viewport
    //.drag()
    .pinch()
    .wheel()
    .decelerate();
  //viewport.moveCenter(450, 250);
  viewport.setZoom(0.15);

  app.stage.addChild(viewport);

  // const tileGridContainer = createTileGridSprites(tileMap, tileSpritesheet);
  // viewport.addChild(tileGridContainer);

  const soilGridContainer = createSoilGridSprites(tileMap);
  viewport.addChild(soilGridContainer);

  return {
    app,
    viewport,
  };
}

function createTileGridSprites(
  tileMap: Tile[][],
  tileSpritesheet: Spritesheet
) {
  const container = new Container();

  for (let row = 0; row < tileMap.length; row++) {
    for (let col = 0; col < tileMap[row]!.length; col++) {
      const tile = tileMap[row]![col]!;

      const sprite = new Sprite(tileSpritesheet.textures[tile.typeId]);

      sprite.x = tile.index.x * tileSide;
      sprite.y = tile.index.y * tileSide;
      sprite.width = tileSide;
      sprite.height = tileSide;

      container.addChild(sprite);
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
      const componentGraphics = Object.entries(tile.soilComponents).map(
        ([componentKey, value], index) =>
          createSoilComponentSprite({
            value,
            index: index,
            key: componentKey as SoilComponent,
          })
      );
      tileContainer.x = tile.index.x * tileSide;
      tileContainer.y = tile.index.y * tileSide;
      tileContainer.width = tileSide;
      tileContainer.height = tileSide;
      tileContainer.addChild(...componentGraphics);
      tileContainer.addChild(tileBorder);
      gridContainer.addChild(tileContainer);
    }
  }
  return gridContainer;
}

const componentColors: Record<SoilComponent, number> = {
  sand: 0xffe4b5,
  clay: 0x8b4513,
  silt: 0x708090,
  organic: 0x556b2f,
};

const componentCount = Object.keys(componentColors).length;

// Creates a sprite as a bar representing a soil component. Bars are stacked on top of each other.
function createSoilComponentSprite({
  key,
  value,
  index,
}: {
  key: SoilComponent;
  value: number;
  index: number;
}): Graphics {
  const padding = 5;
  const paddedTileSide = tileSide - padding * 2;
  const maxColor = componentColors[key];

  const bar = new Graphics();
  bar.rect(0, 0, paddedTileSide, paddedTileSide / 4);
  bar.fill(maxColor);
  bar.alpha = value;
  bar.width = paddedTileSide * value;
  bar.height = paddedTileSide / componentCount;
  bar.x = padding;
  bar.y = padding + index * bar.height;

  // Color of the sprite goes from gray to `maxColor` depending on the value of the soil component.
  return bar;
}
