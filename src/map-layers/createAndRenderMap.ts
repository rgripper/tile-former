import { Application } from "pixi.js";
import { getChunkMap } from "./ChunkMapLayer";
import { renderChunks } from "./renderChunks";
import { generateCells } from "./generateCells";
import { CustomRand } from "../config";
import { createNoise2D } from "simplex-noise";
import { ValueNoise } from "value-noise-js";
import { encaseLine } from "./encaseLine";
const noise = new ValueNoise();

export async function createAndRenderMap({
  rand,
  width,
  height,
}: {
  rand: CustomRand;
  width: number;
  height: number;
}) {
  const { chunks, mountainRanges } = generateCells(rand);

  const chunkMapApp = new Application();
  await chunkMapApp.init({
    width,
    height,
    backgroundColor: 0x000000,
  });

  await renderChunks({
    app: chunkMapApp,
    chunks,
    mountainRanges,
    colors: {
      land: 0x8dd35f,
      water: 0x1ca3ec,
      mountain: 0xff00a0,
    },
  });

  const chunkMap = getChunkMap({
    app: chunkMapApp,
    colors: {
      land: 0x8dd35f,
      water: 0x1ca3ec,
      mountain: 0xff00a0,
    },
  });

  const canvas = new OffscreenCanvas(width, height);
  const noise2D = createNoise2D();

  const encasing = encaseLine(
    mountainRanges[0],
    () => rand.intBetween(3, 20),
    () => rand.intBetween(5, 15)
  );

  renderEncasing(
    encasing.map(([x, y]) => [x + 100, y + 100]),
    canvas
  );

  // const imageData = generateMountainRidges(
  //   width,
  //   height,
  //   mountainRanges,
  //   8,
  //   10
  // );

  return {
    chunkMapApp,
    chunkMap,
    imageData: canvas.getContext("2d")!.getImageData(0, 0, width, height),
  };
}

function renderEncasing(encasing: [number, number][], canvas: OffscreenCanvas) {
  const ctx = canvas.getContext("2d")!;
  console.log(encasing);
  ctx.beginPath();
  ctx.moveTo(...encasing[0]);
  for (const point of encasing.slice(1)) {
    ctx.lineTo(...point);
  }
  ctx.closePath();
  ctx.fillStyle = "black";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "blue";

  ctx.stroke();
}
