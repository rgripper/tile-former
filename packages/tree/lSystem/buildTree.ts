import { buildNodeWithInlet, NodeWithInlet } from "./buildNodeWithInlet";
import { Branch, Segment } from "./l-system-parser";

type Point = { x: number; y: number };

type AbstractSegment = {
  level: number;
};

type AbstractSegmentNode<T> = T &
  AbstractSegment & {
    children: AbstractSegmentNode<T>[];
  };

export type ResolvedSegmentNode<T> = T &
  AbstractSegment & {
    descendantLevelCount: number;
    children: ResolvedSegmentNode<T>[];
  };

function buildAbstractTree(
  segments: Segment[],
  level: number
): AbstractSegmentNode<Segment> {
  const [baseSegment, ...descendantSegments] = segments;
  const children: AbstractSegmentNode<Segment>[] = baseSegment.branches
    .filter((branch) => branch.segments.length > 0)
    .map((branch) => buildAbstractTree(branch.segments, level + 1));

  if (descendantSegments.length > 0) {
    children.push(buildAbstractTree(descendantSegments, level + 1));
  }

  return {
    ...baseSegment,
    level,
    children,
  };
}

function buildResolvedTree<T>(
  node: AbstractSegmentNode<T>
): ResolvedSegmentNode<T> {
  const children = node.children.map((child) => buildResolvedTree(child));
  const descendantLevelCount = Math.max(
    ...children.map((child) => child.descendantLevelCount),
    0
  );
  return {
    ...node,
    descendantLevelCount,
    children,
  };
}

function buildTree(branch: Branch): ResolvedSegmentNode<Segment> {
  const abstractTree = buildAbstractTree(branch.segments, 0);
  return buildResolvedTree(abstractTree);
}

export function buildShapeTree(branch: Branch, width: number): NodeWithInlet {
  const node = buildTree(branch);
  const start: Point = branch.segments[0].start;
  return buildNodeWithInlet(
    node,
    [
      { x: start.x - width / 2, y: start.y },
      { x: start.x + width / 2, y: start.y },
    ],
    node.descendantLevelCount,
    0.2
  );
}
