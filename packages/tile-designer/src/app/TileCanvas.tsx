import { useEffect, useRef } from "react";
import type { PixelBuffer } from "../core/pixels.ts";

// Blits a PixelBuffer to a canvas at a given zoom (integer or fractional)
// with crisp (unfiltered) pixels.
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
    // Changing width/height (below, keyed off zoom) clears the canvas, so this
    // effect must rerun on zoom changes too, not just when buffer is rebaked.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Bakes publish several intermediate buffers in quick succession, so a
    // newer effect run can start before an older bitmap decode resolves.
    // Without this guard, the stale decode still draws (a harmless-looking
    // race) and its ImageData/ImageBitmap are kept alive by the pending
    // promise until it settles, letting several large buffer copies pile up
    // in memory at once instead of one being GC'd before the next starts.
    let stale = false;
    createImageBitmap(image).then((bmp) => {
      if (stale) {
        bmp.close();
        return;
      }
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
    });
    return () => {
      stale = true;
    };
  }, [buffer, zoom]);

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
