import { Viewport } from "pixi-viewport";
import { Container, Application, Spritesheet, Sprite } from "pixi.js";
import { tileSide } from "./config.ts";
import { Tile } from "./tile.ts";

export async function initApp({
  tileMap,
  tileSpritesheet,
  size: { width, height },
}: {
  tileMap: Tile[][];
  tileSpritesheet: Spritesheet;
  size: { width: number; height: number };
}) {
  const pixiContainer = new Container();

  const app = new Application();
  await app.init({
    width,
    height,
  });

  const viewport = new Viewport({
    screenWidth: width,
    screenHeight: height,
    worldWidth: 2000,
    worldHeight: 2000,
    noTicker: true,
    ticker: app.ticker,
    events: app.renderer.events,
  });

  for (let row = 0; row < tileMap.length; row++) {
    for (let col = 0; col < tileMap[row]!.length; col++) {
      const tile = tileMap[row]![col]!;

      const sprite = new Sprite(tileSpritesheet.textures[tile.typeId]);

      sprite.x = tile.index.x * tileSide;
      sprite.y = tile.index.y * tileSide;
      sprite.width = tileSide;
      sprite.height = tileSide;

      pixiContainer.addChild(sprite);
    }
  }
  app.stage.addChild(viewport);
  viewport
    //.drag()
    .pinch()
    //.wheel()
    .decelerate();
  //viewport.moveCenter(450, 250);
  viewport.setZoom(0.2);
  viewport.addChild(pixiContainer);

  return app;
}
