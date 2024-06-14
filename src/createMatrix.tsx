import { compose, rotateDEG, scale, translate } from "transformation-matrix";

export function createMatrix({
  size,
  containerSize,
}: {
  size: { x: number; y: number };
  containerSize: { x: number; y: number };
}) {
  return compose(
    //scale(2, 1, 50, 50),
    //rotateDEG(45, 50, 50)
    translate(containerSize.x / 2, containerSize.y / 2),
    scale(1, 0.5),
    rotateDEG(45),
    //shear(0, 0.5),
    translate(-size.x / 2, -size.y / 2)
  );
}
