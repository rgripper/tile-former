import { compose, rotateDEG, scale, translate } from "transformation-matrix";
import { Point } from "./tiles";

export function createNormalIsoMatrix() {
  return compose(
    // NOTE: transformations are applied in reverse order
    scale(1, 0.5), // stretch horizontally
    rotateDEG(45) // rotate 45 degrees
  );
}

export function createIsoMatrix({ size }: { size: Point }) {
  return compose(
    // NOTE: transformations are applied in reverse order
    scale(1, 0.5), // stretch horizontally
    rotateDEG(45), // rotate 45 degrees
    translate(-size.x / 2, -size.y / 2) // center the square relative to its size
  );
}

export function createDeisoIndexMatrix({ size }: { size: Point }) {
  return compose(scale(1 / size.x, 1 / size.y), rotateDEG(-45), scale(1, 2));
}
