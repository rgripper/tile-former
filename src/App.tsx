import "./App.css";
import { useState } from "react";
import Rand from "rand-seed";
import { createTextureAtlas, createTileTypes } from "./tiles";
import { applyToPoint } from "transformation-matrix";
import { TileMapView } from "./TileMapView";
import {
  createIsoAndCenterMatrix,
  createDeisoIndexMatrix,
  createIsoMatrix,
} from "./createMatrix";
import { generateInitialParameterMap } from "./generateInitialParameterMap";

export const rand = new Rand("1234");

export const tileSide = 32;
const tileHeight = tileSide;
const tileWidth = tileHeight * 2;
const gridSize = { width: 10, height: 10 };
const canvasSize = { width: 800, height: 800 };
export const tileTypes = createTileTypes(tileWidth, tileHeight);

export const isometrifyingMatrix = createIsoAndCenterMatrix({
  size: { x: tileSide, y: tileSide },
  containerSize: {
    x: canvasSize.width,
    y: canvasSize.height,
  },
});

const isoMatrix = createIsoMatrix({
  size: { x: tileSide, y: tileSide },
});

export const isoTileSize = applyToPoint(isoMatrix, {
  x: tileSide,
  y: 0,
});

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

  return (
    <>
      <TileMapView
        data={tileMap}
        textureAtlas={textureAtlas}
        tileTypes={tileTypes}
        gridSize={gridSize}
        canvasSize={canvasSize}
      />
    </>
  );
}

export default App;
