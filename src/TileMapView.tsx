import { useEffect, useState } from "react";
import { IsometricTile, drawGrid, drawBorders, TileType } from "./tiles";
import { applyToPoint, applyToPoints } from "transformation-matrix";
import { createIsoAndCenterMatrix } from "./createMatrix";
import { deisoIndexMatrix, isoTileSize } from "./App";

const isoAndCenterMatrix = createIsoAndCenterMatrix({
  size: { x: 100, y: 100 },
});

export function TileMapView({
  data,
  tileTypes,
  textureAtlas,
  gridSize,
  canvasSize,
}: {
  data: IsometricTile[][];
  tileTypes: TileType[];
  textureAtlas: OffscreenCanvas;
  gridSize: { width: number; height: number };
  canvasSize: { width: number; height: number };
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [testCanvas, setTestCanvas] = useState<HTMLCanvasElement | null>(null);

  const [hoveredTileIndex, setHoveredTileIndex] = useState<{
    x: number;
    y: number;
  }>();
  useEffect(() => {
    if (canvas) {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
    }
  }, [canvas, canvasSize]);

  useEffect(() => {
    if (testCanvas) {
      testCanvas.width = 500;
      testCanvas.height = 500;

      const context = testCanvas.getContext("2d")!;

      const gridSize = 100;

      context.beginPath();

      const rhombusPoints = applyToPoints(isoAndCenterMatrix, [
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
        canvasSize: canvasSize,
        atlasTileSize: { x: 64, y: 32 },
        isoTileSize: isoTileSize,
        tileTypes,
      });
    }
  }, [canvas, data, hoveredTileIndex, tileTypes, textureAtlas, gridSize]);

  useEffect(() => {
    if (canvas) {
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      if (hoveredTileIndex) {
        const isoTile = data[hoveredTileIndex.x][hoveredTileIndex.y];
        drawBorders(ctx, isoTileSize.x, isoTileSize.y, isoTile.center);
      }
    }
  }, [canvas, data, hoveredTileIndex]);

  useEffect(() => {
    if (canvas) {
      const trackTile = (event: MouseEvent) => {
        const index = applyToPoint(deisoIndexMatrix, {
          x: event.offsetX,
          y: event.offsetY,
        });

        const x = Math.round(index.x);
        const y = Math.round(index.y);

        // setHoveredTileIndex((v) =>
        //   (v && (v.x !== x || v.y !== y)) || !v ? { x, y } : v
        // );
        //console.log(x, y);
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
  }, [canvas, hoveredTileIndex, data]);

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
        {/* <canvas
          ref={setTestCanvas}
          style={{ width: 500, height: 500, border: "1px solid black" }}
        ></canvas> */}
        <canvas
          style={{
            transform: `scale(0.8)`,
            transformOrigin: "top center",
            width: canvasSize.width,
            height: canvasSize.height,
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
  tile: IsometricTile | undefined;
  tileTypes: TileType[];
}) {
  return (
    <div style={{ height: "5rem" }}>
      {tile && (
        <>
          ({tile.index.x},{tile.index.y}) {tileTypes[tile.tileTypeId].name}
        </>
      )}
    </div>
  );
}
