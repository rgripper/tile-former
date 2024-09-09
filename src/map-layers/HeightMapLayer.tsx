import { useEffect, useState } from "react";
import { ChunkMapFeature } from "./ChunkMapLayer";
import * as StackBlur from "stackblur-canvas";

export function HeightMapLayer({
  chunkMap,
}: {
  chunkMap: ChunkMapFeature[][];
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>();

  useEffect(() => {
    if (canvas) {
      const blurRadius = 2;
      const width = chunkMap[0].length;
      const height = chunkMap.length;
      canvas.width = width + blurRadius * 2;
      canvas.height = height + blurRadius * 2;
      const context = canvas.getContext("2d")!;

      const imageData = context.createImageData(width, height);
      const data = imageData.data;
      const byteScaledHeightMap = chunkMap.map((row) =>
        row.map((height) => Math.floor((height * 255) / 2))
      );
      data.fill(ChunkMapFeature.Land);
      assignHeighMap(byteScaledHeightMap, data);

      context.putImageData(imageData, 0, 0);

      // StackBlur.canvasRGB(
      //   canvas,
      //   0,
      //   0,
      //   canvas.width,
      //   canvas.height,
      //   blurRadius
      // );
    }
  }, [canvas]);

  return (
    <canvas
      style={{ width: chunkMap[0].length, height: chunkMap.length }}
      ref={setCanvas}
      className="flex justify-center"
    ></canvas>
  );
}

function assignHeighMap(heightMap: number[][], data: Uint8ClampedArray) {
  for (let y = 0; y < heightMap.length; y++) {
    for (let x = 0; x < heightMap[y].length; x++) {
      const i = (y * heightMap[y].length + x) * 4;
      const height = heightMap[y][x];
      data[i] = height;
      data[i + 1] = height;
      data[i + 2] = height;
      data[i + 3] = 255;
    }
  }
}
