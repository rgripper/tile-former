import { Application, Graphics, Renderer } from "pixi.js";
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

  mountainRanges.forEach((range) => {
    const encasing = encaseLine(
      range,
      () => rand.intBetween(3, 20),
      () => rand.intBetween(5, 15)
    );

    renderEncasing(
      encasing.map(([x, y]) => [x, y]),
      chunkMapApp
    );
  });

  return {
    chunkMapApp,
    chunkMap,
    imageData: canvas.getContext("2d")!.getImageData(0, 0, width, height),
  };
}

function renderEncasing(
  encasing: [number, number][],
  app: Application<Renderer>
) {
  const graphics = new Graphics();
  graphics.fillStyle = "grey";
  graphics.setStrokeStyle({ width: 1, color: "blue" });

  graphics.moveTo(encasing[0][0], encasing[0][1]);
  for (const point of encasing.slice(1)) {
    graphics.lineTo(point[0], point[1]);
  }
  graphics.closePath();
  graphics.fill();

  app.stage.addChild(graphics);
}
