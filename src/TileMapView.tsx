import { useEffect, useState } from "react";
import {
  Tile,
  drawGrid,
  drawBorders,
  isometricToNormal,
  TileType,
} from "./tiles";
import { applyToPoints } from "transformation-matrix";
import { createMatrix } from "./createMatrix";

const isometrifyingMatrix = createMatrix({
  size: { x: 100, y: 100 },
  containerSize: { x: 500, y: 500 },
});

export function TileMapView({
  data,
  tileTypes,
  textureAtlas,
  gridSize,
  tileSize,
}: {
  data: Tile[][];
  tileTypes: TileType[];
  textureAtlas: OffscreenCanvas;
  gridSize: { width: number; height: number };
  tileSize: { width: number; height: number };
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [testCanvas, setTestCanvas] = useState<HTMLCanvasElement | null>(null);

  const [hoveredTileIndex, setHoveredTileIndex] = useState<{
    x: number;
    y: number;
  }>();
  useEffect(() => {
    if (canvas) {
      canvas.width = gridSize.width * tileSize.width;
      canvas.height = gridSize.height * tileSize.height;
    }
  }, [canvas, gridSize, tileSize]);

  useEffect(() => {
    if (testCanvas) {
      testCanvas.width = 500;
      testCanvas.height = 500;

      const context = testCanvas.getContext("2d")!;

      const gridSize = 100;

      context.beginPath();

      const rhombusPoints = applyToPoints(isometrifyingMatrix, [
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

      //context.strokeRect(0, 180, 425, 140);
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
        tileSize,
        tileTypes,
      });
    }
  }, [
    canvas,
    data,
    hoveredTileIndex,
    tileTypes,
    textureAtlas,
    gridSize,
    tileSize,
  ]);

  useEffect(() => {
    if (canvas) {
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      if (hoveredTileIndex) {
        const tile = data[hoveredTileIndex.x][hoveredTileIndex.y];
        drawBorders(ctx, tileSize.width, tileSize.height, tile.center);
      }
    }
  }, [canvas, data, hoveredTileIndex, tileSize.height, tileSize.width]);

  useEffect(() => {
    if (canvas) {
      const trackTile = (event: MouseEvent) => {
        const notBounded = isometricToNormal({
          x: event.offsetX / tileSize.width,
          y: event.offsetY / tileSize.height,
        });
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
  }, [canvas, hoveredTileIndex, data, tileSize.width, tileSize.height]);

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
          tileTypes={tileTypes}
        />
        <canvas
          ref={setTestCanvas}
          style={{ width: 500, height: 500, border: "1px solid black" }}
        ></canvas>
        <canvas
          style={{
            transform: `scale(0.2)`,
            transformOrigin: "top center",
            width: tileSize.width * gridSize.width,
            height: tileSize.height * gridSize.height,
            border: "1px solid black",
          }}
          ref={setCanvas}
        ></canvas>
      </div>
    </div>
  );
}

function TileInfo({
  tile,
  tileTypes,
}: {
  tile: Tile | undefined;
  tileTypes: TileType[];
}) {
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
