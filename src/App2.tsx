import { useEffect, useState } from "react";
import {
  Application,
  Container,
  Matrix,
  Sprite,
  Texture,
  Spritesheet,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import { Atlas, Point } from "./tiles";

type IsometricTile = {
  tileTypeId: number;
  center: Point;
  index: Point;
  topLeft: Point;
};

export function AppPixi({
  tileGridData,
  textureAtlas,
}: {
  tileGridData: IsometricTile[][];
  textureAtlas: Atlas;
}) {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (ref) {
      initPixi({
        tileGridData,
        textureAtlas,
        container: ref,
      }).then(() => console.log("haha!"));
    }
  }, [ref, textureAtlas, tileGridData]);
  return <div ref={setRef}></div>;
}

async function initPixi({
  tileGridData,
  textureAtlas,
  container,
}: {
  tileGridData: IsometricTile[][];
  textureAtlas: Atlas;
  container: HTMLElement;
}) {
  const pixiContainer = new Container();

  const width = 800;
  const height = 800;
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

  const Mat = new Matrix();
  const isoMatrix = Mat.rotate(Math.PI / 4).scale(1, 0.63);

  viewport.localTransform = isoMatrix;

  app.stage.addChild(viewport);
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
      pixiContainer.addChild(sprite);
    }
  }
  container.appendChild(app.canvas);
  app.stage.addChild(pixiContainer);
}
