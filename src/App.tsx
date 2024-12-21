import { useState } from "react";
import { canvasSize, defaultRandSeed, gridSize, tileSide } from "./config.ts";
import { TileMapTool } from "./TileMapTool.tsx";
import { Tile } from "./tile.ts";
import { createRand, CustomRand } from "./rand.ts";
import { Assets, Spritesheet, Texture } from "pixi.js";
import atlasUrl from "./assets/grass.png";

const texture = await Assets.load<Texture>(atlasUrl);
const tileSpritesheet = new Spritesheet(texture, {
  frames: {
    "0": {
      frame: { x: 0, y: 0, w: 64, h: 64 },
      sourceSize: { w: 16, h: 16 },
      spriteSourceSize: { x: 0, y: 0, w: 16, h: 32 },
    },
  },
  meta: {
    scale: 1,
  },
});
await tileSpritesheet.parse();

const tileTypes = [{ id: 0, name: "Grass" } as const];

function generateTile({
  x,
  y,
  rand,
}: {
  x: number;
  y: number;
  rand: CustomRand;
}): Tile {
  return {
    index: { x, y },
    typeId: tileTypes[0].id,
  };
}

function App() {
  const [tileMap] = useState(() => {
    const rand = createRand(defaultRandSeed);
    const map = Iterator.range(0, gridSize.height)
      .map((y) =>
        Iterator.range(0, gridSize.width)
          .map((x) => generateTile({ x, y, rand }))
          .toArray()
      )
      .toArray();
    return map;
  });

  return (
    <>
      <TileMapTool
        tileMap={tileMap}
        tileSpritesheet={tileSpritesheet}
        tileTypes={tileTypes}
        canvasSize={canvasSize}
      />
    </>
  );
}

export default App;
