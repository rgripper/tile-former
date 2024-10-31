type Point = [number, number];

// Vector helper functions
const vectorBetweenPoints = (p1: Point, p2: Point): Point => {
  return [p2[0] - p1[0], p2[1] - p1[1]];
};

const normalizeVector = (v: Point): Point => {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  return [v[0] / length, v[1] / length];
};

const rotateVector = (v: Point, angleInRadians: number): Point => {
  const cos = Math.cos(angleInRadians);
  const sin = Math.sin(angleInRadians);
  return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos];
};

const addVectors = (v1: Point, v2: Point): Point => {
  return [v1[0] + v2[0], v1[1] + v2[1]];
};

const scaleVector = (v: Point, scale: number): Point => {
  return [v[0] * scale, v[1] * scale];
};

// Interpolation function
const interpolatePoints = (
  points: Point[],
  getNumInterpolatedPoints: () => number
): Point[] => {
  if (points.length < 2) return points;

  const result: Point[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const numInterpolatedPoints = getNumInterpolatedPoints();
    const start = points[i];
    const end = points[i + 1];

    // Add the start point
    result.push(start);

    // Add interpolated points
    for (let j = 1; j <= numInterpolatedPoints; j++) {
      const t = j / (numInterpolatedPoints + 1);
      const interpolatedPoint: Point = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ];
      result.push(interpolatedPoint);
    }
  }

  // Add the final point
  result.push(points[points.length - 1]);

  return result;
};

export const encaseLine = (
  points: Point[],
  getOffset: () => number,
  getNumInterpolatedPoints: () => number
): Point[] => {
  if (points.length < 2) return points;

  const rightSidePoints = getSidePoints(
    points,
    "right",
    getOffset,
    getNumInterpolatedPoints
  );
  const leftSidePoints = getSidePoints(
    points,
    "left",
    getOffset,
    getNumInterpolatedPoints
  );

  const { firstEncasingPoint, lastEncasingPoint } = getFirstAndLastPoints(
    points,
    getOffset()
  );

  return [
    firstEncasingPoint,
    ...rightSidePoints,
    lastEncasingPoint,
    ...leftSidePoints,
    firstEncasingPoint,
  ];
};

function getSidePoints(
  srcPoints: Point[],
  side: "right" | "left",
  getOffset: () => number,
  getNumInterpolatedPoints: () => number
) {
  const points = interpolatePoints(srcPoints, getNumInterpolatedPoints);
  const sidePoints: Point[] = [];

  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];

    const prevPoint = points[i - 1];
    const nextPoint = points[i + 1];

    const dirFromPrev = normalizeVector(
      vectorBetweenPoints(prevPoint, current)
    );
    const dirToNext = normalizeVector(vectorBetweenPoints(current, nextPoint));

    const avgDirection = normalizeVector([
      (dirFromPrev[0] + dirToNext[0]) / 2,
      (dirFromPrev[1] + dirToNext[1]) / 2,
    ]);

    let offsetVector =
      side === "right"
        ? rotateVector(avgDirection, Math.PI / 2)
        : rotateVector(avgDirection, -Math.PI / 2);

    sidePoints.push(
      addVectors(current, scaleVector(offsetVector, getOffset()))
    );
  }

  if (side === "left") {
    sidePoints.reverse();
  }
  return sidePoints;
}

function getFirstAndLastPoints(points: Point[], offset: number) {
  const firstEncasingPoint = getFirstEncasingPoint(points, offset);
  const lastEncasingPoint = getLastEncasingPoint(points, offset);
  return { firstEncasingPoint, lastEncasingPoint };
}

function getFirstEncasingPoint(points: Point[], offset: number) {
  const startPoint = points[0];
  const nextPoint = points[1];
  const direction = normalizeVector(vectorBetweenPoints(nextPoint, startPoint));
  return addVectors(startPoint, scaleVector(direction, offset));
}

function getLastEncasingPoint(points: Point[], offset: number) {
  const endPoint = points[points.length - 1];
  const prevPoint = points[points.length - 2];
  const direction = normalizeVector(vectorBetweenPoints(prevPoint, endPoint));
  return addVectors(endPoint, scaleVector(direction, offset));
}
