import "./App.css";
import { useEffect, useState } from "react";
import { createNoise2D } from "simplex-noise";
import Rand from "rand-seed";
import {
  Tile,
  createTextureAtlas,
  drawGrid,
  createTileTypes,
  drawBorders,
} from "./tiles";

const rand = new Rand("1234");

const tileHeight = 32;
const tileWidth = tileHeight * 2;
const tileTypes = createTileTypes(32);

const gridSize = { width: 128, height: 128 };
const textureAtlas = createTextureAtlas(tileTypes, tileHeight);
const initialTileMap = generateInitialParameterMap(
  gridSize.width,
  gridSize.height
); // tile size is 12x12

function App() {
  const [tileMap] = useState(initialTileMap);

  return (
    <>
      <TileMapView data={tileMap} />
    </>
  );
}

export default App;
function generateInitialParameterMap(width: number, height: number): Tile[][] {
  const noise2D = createNoise2D(() => rand.next());

  const result = new Array(height).fill(0).map((_, x) =>
    new Array(width).fill(0).map((_, y) => ({
      tileTypeId: Math.floor(
        ((noise2D(x / 40, y / 40) + 1) / 2) * tileTypes.length
      ),
      x,
      y,
      value: (noise2D(x / 40, y / 40) + 1) / 2,
    }))
  );
  return result;
}

function TileMapView({ data }: { data: Tile[][] }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [hoveredTileIndex, setHoveredTileIndex] = useState<{
    x: number;
    y: number;
  }>();
  useEffect(() => {
    if (canvas) {
      canvas.width = gridSize.width * tileWidth;
      canvas.height = gridSize.height * tileHeight;
    }
  }, [canvas]);

  useEffect(() => {
    if (canvas) {
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      drawGrid({
        ctx,
        textureAtlas,
        grid: data,
        gridSize,
        tileHeight,
        tileTypes,
      });
    }
  }, [canvas, data, hoveredTileIndex]);

  useEffect(() => {
    if (canvas) {
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      drawBorders(ctx, tileHeight, hoveredTileIndex);
    }
  }, [canvas, data, hoveredTileIndex]);

  useEffect(() => {
    if (canvas) {
      const trackTile = (event: MouseEvent) => {
        const x = Math.floor(event.offsetX / tileWidth);
        const y = Math.floor(event.offsetY / tileHeight);
        setHoveredTileIndex((v) =>
          (v && (v.x !== x || v.y !== y)) || !v ? { x, y } : v
        );
      };

      const untrackTile = () => {
        setHoveredTileIndex(undefined);
      };
      canvas.addEventListener("mousemove", trackTile);
      canvas.addEventListener("mouseleave", untrackTile);

      return () => {
        canvas.removeEventListener("mousemove", trackTile);
        canvas.removeEventListener("mouseleave", untrackTile);
      };
    }
  }, [canvas, hoveredTileIndex]);

  return (
    <div className="tile-map">
      <TileInfo
        tile={hoveredTileIndex && data[hoveredTileIndex.x][hoveredTileIndex.y]}
      />
      <canvas
        style={{
          transform: `scale(0.2)`,
          transformOrigin: "top left",
          width: tileWidth * gridSize.width,
          height: tileHeight * gridSize.height,
        }}
        ref={setCanvas}
      ></canvas>
    </div>
  );
}

function TileInfo({ tile }: { tile: Tile | undefined }) {
  return (
    <div style={{ height: "5rem" }}>
      {tile && (
        <>
          ({tile.x},{tile.y}) {tileTypes[tile.tileTypeId].name}
        </>
      )}
    </div>
  );
}
