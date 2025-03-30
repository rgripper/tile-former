import { Branch, Segment, Tree } from "./l-system-parser";

export type Point = {
  x: number;
  y: number;
};

function generateCurvedTopShape({
  leftPoint,
  rightPoint,
  height,
  numberOfChildren,
  curvature,
}: {
  leftPoint: Point;
  rightPoint: Point;
  height: number;
  numberOfChildren: number;
  curvature: number;
}) {
  // Array to hold all shape points
  const shapePoints = [];

  // Array to hold top points from left to right
  const topPoints = [];

  // Calculate the vector from left to right point
  const baseVector = {
    x: rightPoint.x - leftPoint.x,
    y: rightPoint.y - leftPoint.y,
  };

  // Calculate the length of the base vector
  const baseLength = Math.sqrt(
    baseVector.x * baseVector.x + baseVector.y * baseVector.y
  );
  // Normalize the base vector
  const normalizedBase = {
    x: baseVector.x / baseLength,
    y: baseVector.y / baseLength,
  };

  // Calculate the perpendicular vector (90 degrees clockwise)
  // This will make the shape extend upward from the base points
  const perpVector = {
    x: normalizedBase.y,
    y: -normalizedBase.x,
  };

  // Calculate the top edge points (perpendicular to the base vector)
  const leftTopX = leftPoint.x + perpVector.x * height;
  const leftTopY = leftPoint.y + perpVector.y * height;
  const rightTopX = rightPoint.x + perpVector.x * height;
  const rightTopY = rightPoint.y + perpVector.y * height;

  // Add bottom right point to shape
  shapePoints.push({ x: rightPoint.x, y: rightPoint.y });

  // Add bottom left point to shape
  shapePoints.push({ x: leftPoint.x, y: leftPoint.y });

  // Add top left point to both arrays
  shapePoints.push({ x: leftTopX, y: leftTopY });
  topPoints.push({ x: leftTopX, y: leftTopY });

  // Generate points for the top curved edge
  if (numberOfChildren > 1) {
    // Generate random offsets for each point
    let ratios = [];
    let currentRatio = 0;

    const pointsCount = numberOfChildren - 1; // Number of points between the base points
    // Generate random ratios for the middle points
    for (let i = 0; i < pointsCount; i++) {
      // Calculate a base ratio (evenly distributed)
      const baseStep = 1 / (pointsCount + 1);

      // Make sure we don't go backwards or beyond 1
      currentRatio += Math.max(0.01, baseStep); // Ensure at least some forward movement
      currentRatio = Math.min(currentRatio, 0.999); // Don't exceed 1

      ratios.push(currentRatio);
    }

    // Sort ratios to ensure they're in order from left to right
    ratios.sort((a, b) => a - b);

    // Add points along the arc
    for (let i = 0; i < pointsCount; i++) {
      const ratio = ratios[i];

      // Calculate the position on elliptic arc
      // Parametric equation of ellipse:
      // x = a * cos(t), y = b * sin(t) where t goes from 0 to π
      const t = Math.PI * ratio;

      // Semi-major and semi-minor axes
      const a = baseLength / 2; // half width
      const b = curvature; // height is curvature

      // Vector from left top to right top (normalized)
      const topVectorX = normalizedBase.x;
      const topVectorY = normalizedBase.y;

      // Calculate point position on ellipse
      // Map cos(t) from [-1,1] to [0,1] to go from left to right
      // We want horizontal movement along the top edge direction
      const horizontalPos = (1 - Math.cos(t)) / 2;

      // Base point on the top edge
      const baseX = leftTopX + horizontalPos * baseVector.x;
      const baseY = leftTopY + horizontalPos * baseVector.y;

      // Add sine curve offset along perpendicular vector
      // sin(t) goes from 0 to 0 with max at π/2
      const verticalOffset = Math.sin(t) * b;

      const curveX = baseX + perpVector.x * verticalOffset;
      const curveY = baseY + perpVector.y * verticalOffset;

      const point = { x: curveX, y: curveY };
      shapePoints.push(point);
      topPoints.push(point);
    }
  }

  // Add top right point to both arrays
  shapePoints.push({ x: rightTopX, y: rightTopY });
  topPoints.push({ x: rightTopX, y: rightTopY });

  // Create pairs of top points for segments
  const topPointPairs = [];
  for (let i = 0; i < topPoints.length - 1; i++) {
    topPointPairs.push({
      start: topPoints[i],
      end: topPoints[i + 1],
    });
  }

  return {
    shapePoints, // Complete shape points array
    topPointPairs, // Array of top point pairs
  };
}

export type BranchShape = {
  shapePoints: {
    x: number;
    y: number;
  }[];
  topPointPairs: {
    start: {
      x: number;
      y: number;
    };
    end: {
      x: number;
      y: number;
    };
  }[];
};

export function buildShapeTree(tree: Tree, width: number) {
  const leftPoint = {
    x: tree.root.segments[0].start.x - width / 2,
    y: tree.root.segments[0].start.y,
  };

  const rightPoint = {
    x: tree.root.segments[0].start.x + width / 2,
    y: tree.root.segments[0].start.y,
  };
  return buildTreeShapesAndDescendants(
    buildBranchWithLevels(tree.root),
    width,
    leftPoint,
    rightPoint
  );
}

type BranchWithLevels = {
  descendantLevelCount: number;
  segments: Segment[];
  children: BranchWithLevels[];
};

function buildBranchWithLevels(branch: Branch): BranchWithLevels {
  const childrenWithLevels = branch.children.map(buildBranchWithLevels);

  const descendantLevelCount = childrenWithLevels.length
    ? Math.max(
        ...childrenWithLevels.map((child) => child.descendantLevelCount)
      ) + 1
    : 0;

  return {
    ...branch,
    descendantLevelCount,
    children: childrenWithLevels,
  };
}

export type BranchShapeNode = BranchShape & {
  children: BranchShapeNode[];
};

function buildTreeShapesAndDescendants(
  branch: BranchWithLevels,
  width: number,
  startPoint: Point,
  endPoint: Point
): BranchShapeNode {
  const descendantTotalPoints = branch.children
    .map((child) => child.descendantLevelCount)
    .reduce((a, b) => a + b, 0);
  if (descendantTotalPoints === 0) {
    return {
      ...buildBranchShape(branch, width, startPoint, endPoint),
      children: [],
    };
  }

  const widthSquared = Math.pow(width, 2);

  // thickness of a branch is proportional to the number of levels of descendants
  const fragmentWidth = Math.sqrt(widthSquared / descendantTotalPoints);

  const shape = buildBranchShape(branch, width, startPoint, endPoint);
  return {
    ...shape,
    children: branch.children
      .filter((branch) => branch.segments.length > 0)
      .map((branch, i) =>
        buildTreeShapesAndDescendants(
          branch,
          fragmentWidth,
          shape.topPointPairs[i].start,
          shape.topPointPairs[i].end
        )
      ),
  };
}

function buildBranchShape(
  branch: BranchWithLevels,
  width: number,
  startPoint: Point,
  endPoint: Point
): BranchShape {
  const segment = branch.segments[0]!;

  // const leftPoint = {
  //   x: segment.start.x - width / 2,
  //   y: segment.start.y,
  // };

  // const rightPoint = {
  //   x: segment.start.x + width / 2,
  //   y: segment.start.y,
  // };

  const height = Math.sqrt(
    Math.pow(segment.end.x - segment.start.x, 2) +
      Math.pow(segment.end.y - segment.start.y, 2)
  );

  return generateCurvedTopShape({
    leftPoint: startPoint,
    rightPoint: endPoint,
    height,
    numberOfChildren: branch.children.filter((x) => x.segments.length > 0)
      .length,
    curvature: 1,
  });
}
