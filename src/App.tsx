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
  createRand,
  defaultRandSeed,
} from "./config";
import { BiomeFloor } from "./biome-floor/BiomeFloor";
import { ChunkMapLayer } from "./map-layers/ChunkMapLayer";
import { Button } from "./components/Button";
import { createAndRenderMap } from "./map-layers/createAndRenderMap";
import { HeightMapLayer } from "./map-layers/HeightMapLayer";

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
  gridSize.height,
  createRand(defaultRandSeed)
); // tile size is 12x12

const { chunkMapApp, chunkMap } = await createAndRenderMap({
  rand: createRand(defaultRandSeed),
  width: 800,
  height: 800,
});

function App() {
  const [tileMap] = useState(initialTileMap);
  const [toggle, setToggle] = useState(false);
  return (
    <>
      <Button onClick={() => setToggle((x) => !x)}>toggle</Button>
      {/* <BiomeFloor /> */}
      {/* <ChunkMapLayer app={chunkMapApp} /> */}
      <HeightMapLayer chunkMap={chunkMap} />
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
