import { useEffect, useState } from "react";
import { Atlas, IsometricTile, TileType } from "./tiles";
import { TileMapView } from "./TileMapView";

export function TileMapInspector({
  data,
  tileTypes,
  textureAtlas,
  gridSize,
  canvasSize,
}: {
  data: IsometricTile[][];
  tileTypes: TileType[];
  textureAtlas: Atlas;
  gridSize: { width: number; height: number };
  canvasSize: { width: number; height: number };
}) {
  const [testCanvas, setTestCanvas] = useState<HTMLCanvasElement | null>(null);

  const [hoveredTileIndex, setHoveredTileIndex] = useState<{
    x: number;
    y: number;
  }>();

  useEffect(() => {
    if (testCanvas) {
      testCanvas.width = 160;
      testCanvas.height = 1000;

      const context = testCanvas.getContext("2d")!;
      context.drawImage(textureAtlas.canvas, 0, 0);
    }
  }, [testCanvas, textureAtlas]);

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
        <div style={{ width: canvasSize.width, height: canvasSize.height }}>
          <TileMapView
            textureAtlas={textureAtlas}
            tileGridData={data}
            canvasSize={canvasSize}
          />
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
