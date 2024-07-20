import { useEffect, useState } from "react";
import { IsometricTile, TileType } from "./tiles";
import { drawGrid, drawBorders } from "./drawing";
import { applyToPoint } from "transformation-matrix";
import { deisoIndexMatrix, isoTileSize } from "./App";
import { tileHeight, tileWidth } from "./config";
import { AppPixi } from "./App2";

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
      const maxTilesInSide = Math.max(gridSize.height, gridSize.width);

      const gridTopLeft = {
        x: data[0][data[0].length - 1].topLeft.x,
        y: data[0][0].topLeft.y,
      };

      const gridBoxSize = {
        width: maxTilesInSide * isoTileSize.x,
        height: maxTilesInSide * isoTileSize.y,
      };

      const gridOffset = {
        x: canvasSize.width / 2 - gridBoxSize.width / 2 - gridTopLeft.x,
        y: canvasSize.height / 2 - gridBoxSize.height / 2 - gridTopLeft.y,
      };

      const trackTile = (event: MouseEvent) => {
        const center = {
          x:
            Math.floor(event.offsetX / isoTileSize.x) * isoTileSize.x +
            isoTileSize.x,
          y:
            Math.floor(event.offsetY / isoTileSize.y) * isoTileSize.y +
            isoTileSize.y,
        };
        console.log({ x: event.offsetX, y: event.offsetY }, center);
        const offsetCenter = {
          x: center.x - gridOffset.x,
          y: center.y - gridOffset.y,
        };
        console.log(offsetCenter);

        const index = applyToPoint(deisoIndexMatrix, {
          x: offsetCenter.x,
          y: offsetCenter.y,
        });

        const x = Math.min(
          Math.max(Math.round(index.x), 0),
          gridSize.width - 1
        );
        const y = Math.min(
          Math.max(Math.round(index.y), 0),
          gridSize.width - 1
        );

        // setHoveredTileIndex((v) =>
        //   (v && (v.x !== x || v.y !== y)) || !v ? { x, y } : v
        // );
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
  }, [
    canvas,
    hoveredTileIndex,
    data,
    gridSize.height,
    gridSize.width,
    canvasSize.width,
    canvasSize.height,
  ]);

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
        <div style={{ width: 800, height: 800 }}>
          <AppPixi textureAtlas={textureAtlas} tileGridData={data} />
        </div>
        {/* <div
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
        </div> */}
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
