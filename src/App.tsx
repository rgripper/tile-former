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
import {
  tileWidth,
  tileHeight,
  tileSide,
  gridSize,
  canvasSize,
} from "./config";

export const rand = new Rand("1234");

export const tileTypes = createTileTypes(tileWidth, tileHeight);

export const isometrifyingMatrix = createIsoAndCenterMatrix({
  size: { x: tileSide, y: tileSide },
});

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

console.log("isoTileSize", { x: tileSide, y: tileSide }, isoTileSize);

export const deisoIndexMatrix = createDeisoIndexMatrix({
  size: isoTileSize,
});

const textureAtlas = createTextureAtlas(tileTypes, tileWidth, tileHeight);

const initialTileMap = generateInitialParameterMap(
  gridSize.width,
  gridSize.height
); // tile size is 12x12

const gridCenter = {
  x: canvasSize.width / 2,
  y: -(isoTileSize.y * gridSize.height) / 2 + canvasSize.height / 2,
};

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
        gridCenter={gridCenter}
      />
    </>
  );
}

export default App;
