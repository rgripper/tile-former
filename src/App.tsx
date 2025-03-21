import { useState } from "react";
import { TileMapTool } from "./TileMapTool.tsx";
import { Assets, Spritesheet, Texture } from "pixi.js";
import atlasUrl from "./assets/grass.png";
import { generateTileMap } from "./tileMap/generateTileMap.ts";
import { WeatherTool } from "./temperature/WeatherTool.tsx";
import { AnnualDateTime } from "./temperature/AnnualDateTime.ts";
import { biomes } from "./tileMap/biomes.ts";
import CurvedTopRectangle from "./CurvedTopRectangle.tsx";

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
  const [dateTime, setDateTime] = useState<AnnualDateTime>({
    dayOfYear: 0,
    dayPart: 0,
    daysInYear: 365,
  });
  return (
    <>
      <CurvedTopRectangle />
      {/* <WeatherTool dateTime={dateTime} onDateTimeChange={setDateTime} /> */}
      {/* <TileMapTool
        biomes={biomes}
        tileMap={tileMap}
        tileSpritesheet={tileSpritesheet}
      /> */}
    </>
  );
}

export default App;
