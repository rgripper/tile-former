import { useEffect, useState } from "react";
import { IsometricTile, TileType } from "./tiles";
import { drawGrid, drawBorders } from "./drawing";
import { applyToPoint } from "transformation-matrix";
import { deisoIndexMatrix, isoTileSize } from "./App";
import { tileHeight, tileWidth } from "./config";

export function TileMapView({
  data,
  tileTypes,
  textureAtlas,
  gridSize,
  canvasSize,
  gridCenter,
}: {
  data: IsometricTile[][];
  tileTypes: TileType[];
  textureAtlas: OffscreenCanvas;
  gridSize: { width: number; height: number };
  canvasSize: { width: number; height: number };
  gridCenter: { x: number; y: number };
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
      testCanvas.width = 160;
      testCanvas.height = 1000;

      const context = testCanvas.getContext("2d")!;
      context.drawImage(textureAtlas, 0, 0);
    }
  }, [testCanvas, textureAtlas]);

  useEffect(() => {
    if (canvas) {
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

      drawGrid({
        ctx,
        textureAtlas,
        grid: data,
        gridSize,
        canvasSize: canvasSize,
        atlasTileSize: { x: tileWidth, y: tileHeight },
        isoTileSize: isoTileSize,
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
    canvasSize,
  ]);

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
          x: event.offsetX - gridCenter.x,
          y: (event.offsetY - gridCenter.y) / 2,
        });

        const x = Math.round(index.x);
        const y = Math.round(index.y);

        setHoveredTileIndex((v) =>
          (v && (v.x !== x || v.y !== y)) || !v ? { x, y } : v
        );
        console.log(x, y);
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
  }, [canvas, hoveredTileIndex, data, gridCenter.x, gridCenter.y]);

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
        <div
          style={{
            display: "flex",
            height: "100vh",
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          <canvas
            ref={setTestCanvas}
            style={{
              width: 160,
              height: 1000,
              border: "1px solid black",
              transform: `scale(0.4)`,
              transformOrigin: "top center",
            }}
          ></canvas>
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
