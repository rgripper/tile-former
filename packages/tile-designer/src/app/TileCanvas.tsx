import { useEffect, useRef } from "react";
import type { PixelBuffer } from "../core/pixels.ts";

// Blits a PixelBuffer to a canvas at an integer zoom with crisp pixels.
export function TileCanvas({ buffer, zoom }: { buffer: PixelBuffer; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new ImageData(
      // Copy: ImageData requires its own backing buffer.
      new Uint8ClampedArray(buffer.data),
      buffer.width,
      buffer.height,
    );
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    createImageBitmap(image).then((bmp) => {
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
    });
  }, [buffer]);

  return (
    <canvas
      ref={ref}
      className="tile-canvas"
      width={buffer.width * zoom}
      height={buffer.height * zoom}
      style={{ width: buffer.width * zoom, height: buffer.height * zoom }}
    />
  );
}
