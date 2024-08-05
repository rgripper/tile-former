import { Viewport } from "pixi-viewport";
import {
  Container,
  Application,
  Matrix,
  Texture,
  Spritesheet,
  Sprite,
} from "pixi.js";
import { IsometricTile } from "./TileMapView";
import { Atlas } from "./tiles";
import { isoTileSize } from "./App";

export async function initPixi({
  tileGridData,
  textureAtlas,
  size: { width, height },
}: {
  tileGridData: IsometricTile[][];
  textureAtlas: Atlas;
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
    worldWidth: 20000,
    worldHeight: 20000,
    noTicker: true,
    ticker: app.ticker,
    events: app.renderer.events,
  });

  // const Mat = new Matrix();
  //const isoMatrix = Mat.rotate(Math.PI / 4).scale(1, 0.63);
  //viewport.localTransform = isoMatrix;

  const texture = Texture.from(textureAtlas.canvas);
  const spritesheet = new Spritesheet(texture, {
    frames: textureAtlas.spriteItemData,
    meta: {
      scale: 1,
    },
  });

  await spritesheet.parse();
  for (let row = 0; row < tileGridData.length; row++) {
    for (let col = 0; col < tileGridData[row].length; col++) {
      const tile = tileGridData[row][col];

      const sprite = new Sprite(spritesheet.textures[tile.tileTypeId]);

      sprite.x = tile.topLeft.x;
      sprite.y = tile.topLeft.y;
      sprite.width = isoTileSize.x;
      sprite.height = isoTileSize.y;

      pixiContainer.addChild(sprite);
    }
  }
  app.stage.addChild(viewport);
  viewport.drag().pinch().wheel().decelerate();
  viewport.moveCenter(450, 250);
  viewport.setZoom(0.05);
  viewport.addChild(pixiContainer);

  return app;
}
