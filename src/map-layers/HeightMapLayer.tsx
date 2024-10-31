import { useEffect, useState } from "react";

export function HeightMapLayer({ data }: { data: ImageData }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>();

  useEffect(() => {
    if (canvas) {
      canvas.width = data.width;
      canvas.height = data.height;
      const ctx = canvas.getContext("2d")!;
      console.log(canvas.width, canvas.height);
      // const imageData = ctx.createImageData(canvas.width, canvas.height);
      // for (let i = 0; i < data.length; i++) {
      //   imageData.data[i * 4] = data[i];     // Red
      //   imageData.data[i * 4 + 1] = data[i]; // Green
      //   imageData.data[i * 4 + 2] = data[i]; // Blue
      //   imageData.data[i * 4 + 3] = 255;     // Alpha
      // }
      ctx.putImageData(data, 0, 0);

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
    <div className="flex justify-center">
      <canvas
        style={{ width: data.width, height: data.height }}
        ref={setCanvas}
      ></canvas>
    </div>
  );
}

// function assignHeighMap(heightMap: number[][], data: Uint8ClampedArray) {
//   for (let y = 0; y < heightMap.length; y++) {
//     for (let x = 0; x < heightMap[y].length; x++) {
//       const i = (y * heightMap[y].length + x) * 4;
//       const height = heightMap[y][x];
//       data[i] = height;
//       data[i + 1] = height;
//       data[i + 2] = height;
//       data[i + 3] = 255;
//     }
//   }
// }
