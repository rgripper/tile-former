import { useEffect, useRef } from "react";
import type { PixelBuffer } from "../core/pixels.ts";

// Blits a PixelBuffer to a canvas at a given zoom (integer or fractional)
// with crisp (unfiltered) pixels.
//
// The expensive part is not the draw, it's the upload: a full copy of the
// buffer into an ImageData plus an async createImageBitmap decode. Two rules
// keep that from piling up:
//
//  - The decoded bitmap is cached by buffer identity, so a zoom-only change
//    (which clears the canvas via its width/height attributes) redraws from
//    the cache instead of re-copying and re-decoding tens of MB.
//  - A stale effect run closes its bitmap the moment the decode resolves, so
//    rapid buffer swaps (slider drags, progressive bakes) never hold more
//    than one in-flight decode plus one cached bitmap at a time.
export function TileCanvas({ buffer, zoom }: { buffer: PixelBuffer; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useRef<{ buffer: PixelBuffer; bmp: ImageBitmap } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    // Changing width/height (keyed off zoom) clears the canvas, so this effect
    // must rerun on zoom changes too, not just when buffer is rebaked.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Zoom-only change: the cached bitmap is still valid, just redraw.
    const cached = cache.current;
    if (cached !== null && cached.buffer === buffer) {
      ctx.drawImage(cached.bmp, 0, 0, canvas.width, canvas.height);
      return;
    }

    // `data` is non-enumerable (pixels.ts, hidePixelData), so a buffer that
    // reached here through a spread has lost its pixels. Without this the
    // symptom is an opaque "ImageData: input data has zero elements".
    if (buffer.data === undefined) {
      throw new Error("TileCanvas: buffer has no pixel data — use aliasBuffer(), not { ...buffer }");
    }

    let stale = false;
    // Copy: ImageData aliases the array it is given, so a caller that keeps
    // mutating a buffer after publishing it would tear the in-flight decode.
    const image = new ImageData(new Uint8ClampedArray(buffer.data), buffer.width, buffer.height);
    createImageBitmap(image).then((bmp) => {
      if (stale) {
        bmp.close();
        return;
      }
      cache.current?.bmp.close();
      cache.current = { buffer, bmp };
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    });
    return () => {
      stale = true;
    };
  }, [buffer, zoom]);

  // Release the cached bitmap when the canvas goes away entirely.
  useEffect(
    () => () => {
      cache.current?.bmp.close();
      cache.current = null;
    },
    [],
  );

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
