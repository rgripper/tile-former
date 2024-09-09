import { Application } from "pixi.js";
import { getChunkMap } from "./ChunkMapLayer";
import { renderVoronoi } from "./renderVoronoi";
import { generateCells } from "./generateCells";
import { CustomRand } from "../config";

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

  await renderVoronoi({
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

  return { chunkMapApp, chunkMap };
}
