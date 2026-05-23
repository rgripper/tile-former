import { Point } from "./generateCurvedTopShape";

export type TreeNode<T> = T & {
  children: TreeNode<T>[];
};

export type SegmentShape = {
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

export type SegmentNode = {
  shape: SegmentShape;
  children: SegmentNode[];
};

export type PositionedSegment = {
  start: Point;
  end: Point;
  level: number;
  isPrimary: boolean;
  children: PositionedSegment[];
};

export function buildSegmentNode(
  segment: PositionedSegment,
  width: number,
  startPoint: Point,
  endPoint: Point,
  maxLevel: number,
  buildSegmentShape: (
    segment: PositionedSegment,
    width: number,
    startPoint: Point,
    endPoint: Point
  ) => SegmentShape
): SegmentNode {
  const shape = buildSegmentShape(segment, width, startPoint, endPoint);

  const descendantTotalLevels = maxLevel - segment.level;
  if (descendantTotalLevels === 0) {
    return {
      shape,
      children: [],
    };
  }

  const widthSquared = Math.pow(width, 2);

  // thickness of a segment is proportional to the number of levels of descendants
  const fragmentWidth = Math.sqrt(widthSquared / descendantTotalLevels);

  return {
    shape,
    children: segment.children.map((child, i) =>
      buildSegmentNode(
        child,
        fragmentWidth,
        shape.topPointPairs[i].start,
        shape.topPointPairs[i].end,
        maxLevel,
        buildSegmentShape
      )
    ),
  };
}
