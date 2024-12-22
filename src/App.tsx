import { useState } from "react";
import { TileMapTool } from "./TileMapTool.tsx";
import { Assets, Spritesheet, Texture } from "pixi.js";
import atlasUrl from "./assets/grass.png";
import { generateTileMap, tileTypes } from "./tileMap/generateTileMap.ts";

const texture = await Assets.load<Texture>(atlasUrl);
const tileSpritesheet = new Spritesheet(texture, {
  frames: {
    "0": {
      frame: { x: 0, y: 0, w: 64, h: 64 },
      sourceSize: { w: 64, h: 64 },
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
    },
  },
  meta: {
    scale: 1,
  },
});
await tileSpritesheet.parse();

function App() {
  const [tileMap] = useState(() => {
    const map = generateTileMap();
    return map;
  });

  return (
    <>
      <TileMapTool
        tileMap={tileMap}
        tileSpritesheet={tileSpritesheet}
        tileTypes={tileTypes}
      />
    </>
  );
}

export default App;
