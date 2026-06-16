import React, { useMemo } from "react";
import { type Tree, type Segment } from "./l-system-parser";

interface Props {
  tree: Tree;
  width?: number;
  height?: number;
  backgroundColor?: string;
  leafColor?: string;
  /** Desired half-width of the trunk base in SVG pixels. */
  trunkBaseHalfPx?: number;
}

/** Per-segment shape data produced by traversal. */
type SegmentShape = {
  segment: Segment;
  /** Normalised start half-width (multiply by baseHalf to get world units). */
  startNorm: number;
  /** Normalised end half-width. */
  endNorm: number;
  isTerminal: boolean;
  /** Max segment-hops to any terminal below this segment. 0 = terminal. */
  depth: number;
};

// ---------------------------------------------------------------------------
// Tree traversal helpers
// ---------------------------------------------------------------------------

/**
 * DFS post-order: counts total segment nodes reachable from segments[startIdx]
 * (inclusive). Used by Leonardo's-rule width calculation.
 */
function buildCountMap(
  segments: Segment[],
  startIdx: number,
  map: Map<Segment, number>,
): number {
  if (startIdx >= segments.length) return 0;
  const seg = segments[startIdx];
  let total = 1;
  for (const br of seg.branches) total += buildCountMap(br.segments, 0, map);
  total += buildCountMap(segments, startIdx + 1, map);
  map.set(seg, total);
  return total;
}

/**
 * DFS post-order: records the maximum number of segment-hops from each
 * segment to the furthest terminal below it. Terminal = 0.
 *
 * This is the botanically correct axis for leaf placement: leaves appear
 * only on segments close to the tips (low depth), mimicking how real trees
 * concentrate foliage in the outer canopy shell while inner wood is bare.
 */
function buildDepthMap(
  segments: Segment[],
  startIdx: number,
  map: Map<Segment, number>,
): number {
  if (startIdx >= segments.length) return -1; // nothing here
  const seg = segments[startIdx];

  let maxChildDepth = -1;
  for (const br of seg.branches) {
    const d = buildDepthMap(br.segments, 0, map);
    if (d > maxChildDepth) maxChildDepth = d;
  }
  const fwd = buildDepthMap(segments, startIdx + 1, map);
  if (fwd > maxChildDepth) maxChildDepth = fwd;

  const depth = maxChildDepth + 1;
  map.set(seg, depth);
  return depth;
}

/**
 * Traverses the tree and emits SegmentShapes with normalised widths and depth.
 * Leonardo's rule: endNorm = sqrt(Σ childStartNorm²) — cross-sectional area
 * is conserved at every branching point.
 */
function gatherShapes(
  segments: Segment[],
  startIdx: number,
  countMap: Map<Segment, number>,
  depthMap: Map<Segment, number>,
  out: SegmentShape[],
): void {
  if (startIdx >= segments.length) return;
  const seg = segments[startIdx];
  const count = countMap.get(seg)!;
  const startNorm = Math.sqrt(count);

  const childNorms: number[] = [];
  if (startIdx + 1 < segments.length) {
    childNorms.push(Math.sqrt(countMap.get(segments[startIdx + 1])!));
  }
  for (const br of seg.branches) {
    if (br.segments.length > 0) {
      childNorms.push(Math.sqrt(countMap.get(br.segments[0])!));
    }
  }

  const isTerminal = childNorms.length === 0;
  const endNorm = isTerminal
    ? 0.5
    : Math.sqrt(childNorms.reduce((s, n) => s + n * n, 0));

  out.push({ segment: seg, startNorm, endNorm, isTerminal, depth: depthMap.get(seg)! });
  gatherShapes(segments, startIdx + 1, countMap, depthMap, out);
  for (const br of seg.branches) {
    gatherShapes(br.segments, 0, countMap, depthMap, out);
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * SVG path for a tapered segment with a round cap at the forward tip.
 * Sweep=1 is correct for any angle θ (cross-product proof in earlier commit).
 */
function segmentPath(
  seg: Segment,
  h1: number,
  h2: number,
  tx: (x: number) => number,
  ty: (y: number) => number,
  viewScale: number,
): string {
  const { angleRad: θ, start: s, end: e } = seg;
  const sinθ = Math.sin(θ), cosθ = Math.cos(θ);
  const h2px = h2 * viewScale;

  const f = (n: number) => n.toFixed(2);
  const sLx = tx(s.x - sinθ * h1), sLy = ty(s.y + cosθ * h1);
  const sRx = tx(s.x + sinθ * h1), sRy = ty(s.y - cosθ * h1);
  const eRx = tx(e.x + sinθ * h2), eRy = ty(e.y - cosθ * h2);
  const eLx = tx(e.x - sinθ * h2), eLy = ty(e.y + cosθ * h2);

  return [
    `M ${f(sLx)},${f(sLy)}`,
    `L ${f(sRx)},${f(sRy)}`,
    `L ${f(eRx)},${f(eRy)}`,
    `A ${f(h2px)},${f(h2px)} 0 1 1 ${f(eLx)},${f(eLy)}`,
    "Z",
  ].join(" ");
}

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): string {
  const r  = Math.round(a[0] + (b[0] - a[0]) * t);
  const g  = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

const DARK_BROWN:  [number, number, number] = [62,  28,   6];
const MID_BROWN:   [number, number, number] = [130, 80,  30];
const LIGHT_BROWN: [number, number, number] = [190, 145, 85];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const LSystemSVGRenderer: React.FC<Props> = ({
  tree,
  width  = 500,
  height = 700,
  backgroundColor = "#c8e6c9",
  leafColor       = "#2e7d32",
  trunkBaseHalfPx = 28,
}) => {
  const { shapes, rootNorm, maxDepth } = useMemo(() => {
    if (tree.root.segments.length === 0) {
      return { shapes: [] as SegmentShape[], rootNorm: 1, maxDepth: 0 };
    }
    const countMap = new Map<Segment, number>();
    const rootCount = buildCountMap(tree.root.segments, 0, countMap);

    const depthMap = new Map<Segment, number>();
    const maxDepth = buildDepthMap(tree.root.segments, 0, depthMap);

    const shapes: SegmentShape[] = [];
    gatherShapes(tree.root.segments, 0, countMap, depthMap, shapes);
    return { shapes, rootNorm: Math.sqrt(rootCount), maxDepth };
  }, [tree]);

  const { minX, maxX, minY, maxY } = useMemo(() => {
    if (shapes.length === 0) return { minX: 0, maxX: 1, minY: -1, maxY: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const { segment: s } of shapes) {
      for (const p of [s.start, s.end]) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return { minX, maxX, minY, maxY };
  }, [shapes]);

  const padding   = 32;
  const worldW    = maxX - minX || 1;
  const worldH    = maxY - minY || 1;
  const viewScale = Math.min(
    (width  - padding * 2) / worldW,
    (height - padding * 2) / worldH,
  );
  const baseHalf = trunkBaseHalfPx / (rootNorm * viewScale);

  const cx = width / 2 - ((minX + maxX) / 2) * viewScale;
  const tx = (x: number) => x * viewScale + cx;
  const ty = (y: number) => (height - padding) - (maxY - y) * viewScale;

  // Outermost ~40% of depth levels get leaves — the canopy shell.
  // Inner branches (high depth = far from tips) remain bare wood.
  const leafThreshold = Math.max(2, Math.round(maxDepth * 0.4));

  if (shapes.length === 0) {
    return <svg width={width} height={height} style={{ background: backgroundColor }} />;
  }

  return (
    <svg
      width={width}
      height={height}
      style={{ background: backgroundColor, display: "block" }}
    >
      {/* Tapered branch quads, back-to-front */}
      {[...shapes]
        .sort((a, b) => b.startNorm - a.startNorm)
        .map((shape, i) => {
          const h1 = shape.startNorm * baseHalf;
          const h2 = shape.endNorm   * baseHalf;
          const t  = Math.min(1, shape.startNorm / rootNorm);
          const fill = t > 0.6
            ? lerpColor(DARK_BROWN, MID_BROWN,   (t - 0.6) / 0.4)
            : lerpColor(MID_BROWN,  LIGHT_BROWN,  t / 0.6);
          return (
            <path
              key={i}
              d={segmentPath(shape.segment, h1, h2, tx, ty, viewScale)}
              fill={fill}
            />
          );
        })}

      {/* Leaf clusters on the outer canopy shell only.
          Filter: depth <= leafThreshold (close to the tips).
          Botanically: real temperate trees leaf only on the outermost
          2–3 branching orders; interior wood is bare due to self-shading. */}
      {shapes
        .filter((s) => s.depth <= leafThreshold)
        .flatMap((shape, si) => {
          const { start: s, end: e, angleRad: θ } = shape.segment;
          const sx = tx(s.x), sy = ty(s.y);
          const ex = tx(e.x), ey = ty(e.y);
          const segLenPx = Math.hypot(ex - sx, ey - sy);
          const LEAF_SPACING = 11;
          const count = Math.max(1, Math.round(segLenPx / LEAF_SPACING));
          const r = Math.max(6, Math.min(11, shape.startNorm * baseHalf * viewScale * 3));
          const perpX = -Math.sin(θ), perpY = Math.cos(θ);

          return Array.from({ length: count }, (_, k) => {
            const t   = (k + 0.5) / count;
            const side = (k % 2 === 0 ? 1 : -1) * r * 0.35;
            const lx  = sx + t * (ex - sx) + side * perpX;
            const ly  = sy + t * (ey - sy) + side * perpY;
            return (
              <g key={`leaf-${si}-${k}`}>
                <circle cx={lx}             cy={ly}             r={r * 1.1} fill={leafColor} opacity={0.55} />
                <circle cx={lx - r * 0.4}  cy={ly - r * 0.5}  r={r * 0.7} fill="#43a047"  opacity={0.60} />
                <circle cx={lx + r * 0.45} cy={ly - r * 0.3}  r={r * 0.6} fill="#388e3c"  opacity={0.55} />
                <circle cx={lx + r * 0.1}  cy={ly - r * 0.75} r={r * 0.5} fill="#66bb6a"  opacity={0.50} />
              </g>
            );
          });
        })}
    </svg>
  );
};

export default LSystemSVGRenderer;
