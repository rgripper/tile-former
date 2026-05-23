import { Point } from "../old/generateCurvedTopShape";
import { buildNodeWithInlet, NodeWithInlet } from "./buildNodeWithInlet";
import { Branch, Segment, Tree } from "./l-system-parser";

type AbstractSegment = {
  level: number; // level of the segment in the tree
};

type AbstractSegmentNode<T> = T &
  AbstractSegment & {
    children: AbstractSegmentNode<T>[]; // children of the segment
  };

export type ResolvedSegmentNode<T> = T &
  AbstractSegment & {
    descendantLevelCount: number; // the longest segment chain from this segment to the leaf
    children: ResolvedSegmentNode<T>[]; // children of the segment
  };

function buildAbstractTree(
  segments: Segment[],
  level: number
): AbstractSegmentNode<Segment> {
  const [baseSegment, ...descendantSegments] = segments;
  const children: AbstractSegmentNode<Segment>[] = baseSegment.branches.map(
    (branch) => buildAbstractTree(branch.segments, level + 1)
  );

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
  const start = branch.segments[0].start;
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
