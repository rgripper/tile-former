import { ResolvedSegmentNode } from "./buildTree";
import { Segment } from "./l-system-parser";

type Point = { x: number; y: number };

export type NodeWithInlet = {
  node: ResolvedSegmentNode<Segment>;
  inlet: [Point, Point];
  children: NodeWithInlet[];
};

export function buildNodeWithInlet(
  node: ResolvedSegmentNode<Segment>,
  inlet: [Point, Point],
  totalLevels: number,
  widthReductionFactor: number
): NodeWithInlet {
  const { children } = node;

  const inletWidth = getSegmentNodeInletWidth(inlet);
  const outletWidth = getSegmentNodeOutletWidth(
    node,
    inletWidth,
    totalLevels,
    widthReductionFactor
  );
  const fragmentWidth = getWidthFragment(
    node.descendantLevelCount,
    outletWidth
  );

  return {
    node,
    inlet,
    children: children.map((node) =>
      buildNodeWithInlet(
        node,
        getOutlet(node, fragmentWidth * node.descendantLevelCount),
        totalLevels,
        widthReductionFactor
      )
    ),
  };
}

function getSegmentNodeInletWidth(inlet: [Point, Point]): number {
  const [point1, point2] = inlet;
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getSegmentNodeOutletWidth(
  node: ResolvedSegmentNode<Segment>,
  inletWidth: number,
  totalLevels: number,
  reductionFactor: number
): number {
  const localReductionFactor = 1 - node.level / totalLevels;
  return reductionFactor * localReductionFactor * inletWidth;
}

function getWidthFragment(descendantLevelCount: number, width: number): number {
  const widthSquared = Math.pow(width, 2);
  return Math.sqrt(widthSquared / descendantLevelCount);
}

function getOutlet(
  node: ResolvedSegmentNode<Segment>,
  width: number
): [Point, Point] {
  const { angleRad, start } = node;
  const point1 = {
    x: start.x + Math.sin(angleRad) * width,
    y: start.y - Math.cos(angleRad) * width,
  };
  const point2 = {
    x: start.x - Math.sin(angleRad) * width,
    y: start.y + Math.cos(angleRad) * width,
  };
  return [point1, point2];
}
