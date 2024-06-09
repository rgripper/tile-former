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
  normalToIsometric,
  isometricToNormal,
} from "./tiles";
import {
  applyToPoint,
  applyToPoints,
  compose,
  rotate,
  shear,
  skew,
  translate,
} from "transformation-matrix";

const rand = new Rand("1234");

const tileSide = 32;
const tileHeight = tileSide;
const tileWidth = tileHeight * 2;
const tileTypes = createTileTypes(tileWidth, tileHeight);

const gridSize = { width: 10, height: 10 };
const textureAtlas = createTextureAtlas(tileTypes, tileWidth, tileHeight);
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
    new Array(width).fill(0).map((_, y) => {
      const tempCenter = normalToIsometric(
        {
          x,
          y,
        },
        width
      );
      return {
        tileTypeId: Math.floor(
          ((noise2D(x / 40, y / 40) + 1) / 2) * tileTypes.length
        ),
        x,
        y,
        center: {
          x: tempCenter.x * tileWidth,
          y: tempCenter.y * tileHeight,
        },
        value: (noise2D(x / 40, y / 40) + 1) / 2,
      };
    })
  );
  return result;
}

function TileMapView({ data }: { data: Tile[][] }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [testCanvas, setTestCanvas] = useState<HTMLCanvasElement | null>(null);

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
    if (testCanvas) {
      testCanvas.width = 500;
      testCanvas.height = 500;

      const context = testCanvas.getContext("2d")!;

      const gridSize = 100;

      context.beginPath();
      const matrix = compose(
        translate(testCanvas.width / 2, testCanvas.height / 2),
        rotate(Math.PI / 4),
        skew(-0.5, -0.5)
      );
      const rhombusPoints = applyToPoints(matrix, [
        { x: 0, y: 0 },
        { x: gridSize, y: 0 },
        { x: gridSize, y: gridSize },
        { x: 0, y: gridSize },
      ]);

      context.beginPath();
      context.moveTo(rhombusPoints[0].x, rhombusPoints[0].y);
      context.lineTo(rhombusPoints[1].x, rhombusPoints[1].y);
      context.strokeStyle = "red";
      context.stroke();

      context.beginPath();
      context.moveTo(rhombusPoints[1].x, rhombusPoints[1].y);
      context.lineTo(rhombusPoints[2].x, rhombusPoints[2].y);
      context.strokeStyle = "yellow";
      context.stroke();

      context.beginPath();
      context.moveTo(rhombusPoints[2].x, rhombusPoints[2].y);
      context.lineTo(rhombusPoints[3].x, rhombusPoints[3].y);
      context.strokeStyle = "green";
      context.stroke();

      context.beginPath();
      context.moveTo(rhombusPoints[3].x, rhombusPoints[3].y);
      context.lineTo(rhombusPoints[0].x, rhombusPoints[0].y);
      context.strokeStyle = "grey";
      context.stroke();

      context.strokeRect(0, 180, 425, 140);
    }
  }, [testCanvas]);

  useEffect(() => {
    if (canvas) {
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      //ctx.drawImage(textureAtlas, 0, 0);
      drawGrid({
        ctx,
        textureAtlas,
        grid: data,
        gridSize,
        tileHeight,
        tileWidth,
        tileTypes,
      });
    }
  }, [canvas, data, hoveredTileIndex]);

  useEffect(() => {
    if (canvas) {
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      if (hoveredTileIndex) {
        const tile = data[hoveredTileIndex.x][hoveredTileIndex.y];
        drawBorders(ctx, tileHeight * 2, tileHeight, tile.center);
      }
    }
  }, [canvas, data, hoveredTileIndex]);

  useEffect(() => {
    if (canvas) {
      const trackTile = (event: MouseEvent) => {
        const notBounded = isometricToNormal(
          { x: event.offsetX / tileWidth, y: event.offsetY / tileHeight },
          data[0].length
        );
        const x = Math.max(Math.min(notBounded.x, data[0].length - 1), 0);
        const y = Math.max(Math.min(notBounded.y, data.length - 1), 0);

        setHoveredTileIndex((v) =>
          (v && (v.x !== x || v.y !== y)) || !v ? { x, y } : v
        );
        // console.log(x, y);
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
    <div
      style={{
        display: "flex",
        height: "100vh",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div className="tile-map">
        <TileInfo
          tile={
            hoveredTileIndex && data[hoveredTileIndex.x][hoveredTileIndex.y]
          }
        />
        <canvas
          ref={setTestCanvas}
          style={{ width: 500, height: 500, border: "1px solid black" }}
        ></canvas>
        <canvas
          style={{
            transform: `scale(0.2)`,
            transformOrigin: "top center",
            width: tileWidth * gridSize.width,
            height: tileHeight * gridSize.height,
            border: "1px solid black",
          }}
          ref={setCanvas}
        ></canvas>
      </div>
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
function getTileIndex(
  offsetX: number,
  offsetY: number,
  tileWidth: number,
  tileHeight: number
): { col: any; row: any } {
  throw new Error("Function not implemented.");
}
