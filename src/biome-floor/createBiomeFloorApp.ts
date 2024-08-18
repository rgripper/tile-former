import { Application, Matrix, Sprite, Texture } from "pixi.js";
import { PixelateFilter } from "pixi-filters";
import { createNoise2D } from "simplex-noise";
import Rand from "rand-seed";

export async function createBiomeFloorApp() {
  const app = new Application();

  const width = 800;
  const height = 800;
  await app.init({
    width,
    height,
  });

  const canvas = createFloor(width, height);

  const texture = Texture.from(canvas);
  const sprite = new Sprite(texture);
  app.stage.addChild(sprite);
  app.stage.filters = new PixelateFilter(5);
  return app;
}

const rand = new Rand("1234");
const Mat = new Matrix();
const isoMatrix = Mat.rotate(Math.PI / 4)
  .scale(1, 0.63)
  .translate(400, 0);

function getPointValueMap<T>(
  width: number,
  height: number,
  factor: number,
  apply: (x: number, y: number) => T
): { x: number; y: number; value: T }[][] {
  const points: { x: number; y: number; value: T }[][] = [];
  for (let x = 0; x < width / factor; x++) {
    points[x] = [];
    for (let y = 0; y < height / factor; y++) {
      points[x][y] = { x, y, value: apply(x, y) };
    }
  }
  return points;
}

function createFloor(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const noise2D = createNoise2D(() => rand.next());
  const factor = 26;
  const points10 = getPointValueMap(width, height, factor, (x, y) =>
    noise2D(x / 100, y / 100)
  );

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const point = { x, y };
      const isoPoint = isoMatrix.apply(point);
      if (isoPoint.x < 0 || isoPoint.x > width) continue;
      if (isoPoint.y < 0 || isoPoint.y > height) continue;
      const noise =
        noise2D(x / 10, y / 10) +
        points10[Math.floor(x / factor)][Math.floor(y / factor)].value;

      const color = noise > 0.1 ? "#84cc16" : "#a3e635"; // : noise > 0.1 ? "#65a30d" : "#84cc16";

      ctx.fillStyle = color;
      ctx.fillRect(isoPoint.x, isoPoint.y, 1, 1);
    }
  }

  return canvas;
}
