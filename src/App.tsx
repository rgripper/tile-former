import { useState } from "react";
import { createTextureAtlas, createTileTypes } from "./tiles";
import { applyToPoint } from "transformation-matrix";
import { TileMapInspector } from "./TileMapInspector";
import {
  createNormalIsoMatrix,
  createDeisoIndexMatrix,
  createIsoMatrix,
} from "./createMatrix";
import { generateInitialParameterMap } from "./generateInitialParameterMap";
import {
  tileWidth,
  tileHeight,
  tileSide,
  gridSize,
  canvasSize,
} from "./config";
import { BiomeFloor } from "./biome-floor/BiomeFloor";
import { Layer } from "./map-layers/Layer";

export const tileTypes = createTileTypes(tileWidth, tileHeight);

export const isometrifyingMatrix = createNormalIsoMatrix();

const isoMatrix = createIsoMatrix({
  size: { x: tileSide, y: tileSide },
});

const right = applyToPoint(isoMatrix, {
  x: tileSide,
  y: 0,
});

const bottom = applyToPoint(isoMatrix, {
  x: tileSide,
  y: tileSide,
});

export const isoTileSize = { x: right.x * 2, y: bottom.y * 2 };

export const deisoIndexMatrix = createDeisoIndexMatrix({
  size: isoTileSize,
});

const textureAtlas = createTextureAtlas(tileTypes, tileWidth, tileHeight);

const initialTileMap = generateInitialParameterMap(
  gridSize.width,
  gridSize.height
); // tile size is 12x12

function App() {
  const [tileMap] = useState(initialTileMap);
  const [toggle, setToggle] = useState(false);
  return (
    <>
      <button onClick={() => setToggle((x) => !x)}>toggle</button>
      {/* <BiomeFloor /> */}
      <Layer />
      {/* <TileMapInspector
        data={tileMap}
        textureAtlas={textureAtlas}
        tileTypes={tileTypes}
        gridSize={gridSize}
        canvasSize={canvasSize}
      /> */}
    </>
  );
}

export default App;
