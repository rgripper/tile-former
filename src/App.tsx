import "./App.css";
import { useState } from "react";
import { createNoise2D } from "simplex-noise";
import Rand from "rand-seed";
import { Tile, createTextureAtlas, createTileTypes } from "./tiles";
import { applyToPoint } from "transformation-matrix";
import { TileMapView } from "./TileMapView";
import { createMatrix } from "./createMatrix";

const rand = new Rand("1234");

const tileSide = 32;
const tileHeight = tileSide;
const tileWidth = tileHeight * 2;
const tileSize = { width: tileWidth, height: tileHeight };
const gridSize = { width: 10, height: 10 };

const tileTypes = createTileTypes(tileWidth, tileHeight);

const isometrifyingMatrixReal = createMatrix({
  size: { x: tileSide, y: tileSide },
  containerSize: {
    x: gridSize.width * tileWidth,
    y: gridSize.height * tileHeight,
  },
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
        tileSize={tileSize}
      />
    </>
  );
}

export default App;
function generateInitialParameterMap(width: number, height: number): Tile[][] {
  const noise2D = createNoise2D(() => rand.next());

  const result = new Array(height).fill(0).map((_, x) =>
    new Array(width).fill(0).map((_, y) => {
      const tempCenter = applyToPoint(isometrifyingMatrixReal, {
        x: x - gridSize.width / 2,
        y: y - gridSize.height / 2,
      });

      const center = {
        x: tempCenter.x * tileWidth,
        y: tempCenter.y * tileHeight,
      };
      console.log(center, {
        x,
        y,
      });
      return {
        tileTypeId: Math.floor(
          ((noise2D(x / 40, y / 40) + 1) / 2) * tileTypes.length
        ),
        x,
        y,
        center,
        value: (noise2D(x / 40, y / 40) + 1) / 2,
      };
    })
  );
  return result;
}
