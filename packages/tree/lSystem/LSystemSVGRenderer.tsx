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

/** Normalised count stored per segment — width ∝ sqrt(count). */
type SegmentShape = {
  segment: Segment;
  /** Normalised start half-width (multiply by baseHalf to get world units). */
  startNorm: number;
  /** Normalised end half-width. */
  endNorm: number;
  isTerminal: boolean;
};

// ---------------------------------------------------------------------------
// Tree traversal helpers
// ---------------------------------------------------------------------------

/**
 * DFS post-order: counts total segment nodes reachable from segments[startIdx]
 * (inclusive). Memoises into `map`.
 */
function buildCountMap(
  segments: Segment[],
  startIdx: number,
  map: Map<Segment, number>,
): number {
  if (startIdx >= segments.length) return 0;
  const seg = segments[startIdx];
  let total = 1;
  for (const br of seg.branches) {
    total += buildCountMap(br.segments, 0, map);
  }
  total += buildCountMap(segments, startIdx + 1, map);
  map.set(seg, total);
  return total;
}

/**
 * Traverses the tree and emits SegmentShapes with normalised widths.
 * Leonardo's rule: endNorm = sqrt(Σ childStartNorm²) so that cross-sectional
 * area is conserved at every branching point.
 */
function gatherShapes(
  segments: Segment[],
  startIdx: number,
  map: Map<Segment, number>,
  out: SegmentShape[],
): void {
  if (startIdx >= segments.length) return;
  const seg = segments[startIdx];
  const count = map.get(seg)!;
  const startNorm = Math.sqrt(count);

  const childNorms: number[] = [];
  if (startIdx + 1 < segments.length) {
    childNorms.push(Math.sqrt(map.get(segments[startIdx + 1])!));
  }
  for (const br of seg.branches) {
    if (br.segments.length > 0) {
      childNorms.push(Math.sqrt(map.get(br.segments[0])!));
    }
  }

  const isTerminal = childNorms.length === 0;
  const endNorm = isTerminal
    ? 0.5
    : Math.sqrt(childNorms.reduce((s, n) => s + n * n, 0));

  out.push({ segment: seg, startNorm, endNorm, isTerminal });
  gatherShapes(segments, startIdx + 1, map, out);
  for (const br of seg.branches) {
    gatherShapes(br.segments, 0, map, out);
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Builds the SVG path `d` for a tapered segment with a round cap at the
 * forward (end) tip.
 *
 * Shape: trapezoid M start-left → L start-right → L end-right
 *        → A (semicircle, sweep=1) end-left → Z
 *
 * Sweep direction proof: for any angle θ the cross-product
 *   (center→end-right) × (center→forward-point) = sin²θ + cos²θ = 1 > 0
 * which is always CW in SVG (y-down) → sweep-flag = 1.
 */
function segmentPath(
  seg: Segment,
  h1: number,       // world half-width at start
  h2: number,       // world half-width at end
  tx: (x: number) => number,
  ty: (y: number) => number,
  viewScale: number,
): string {
  const { angleRad: θ, start: s, end: e } = seg;
  const sinθ = Math.sin(θ);
  const cosθ = Math.cos(θ);
  const h2px = h2 * viewScale; // end half-width in SVG px (arc radius)

  const f = (n: number) => n.toFixed(2);
  const sLx = tx(s.x - sinθ * h1), sLy = ty(s.y + cosθ * h1); // start-left
  const sRx = tx(s.x + sinθ * h1), sRy = ty(s.y - cosθ * h1); // start-right
  const eRx = tx(e.x + sinθ * h2), eRy = ty(e.y - cosθ * h2); // end-right
  const eLx = tx(e.x - sinθ * h2), eLy = ty(e.y + cosθ * h2); // end-left

  return [
    `M ${f(sLx)},${f(sLy)}`,
    `L ${f(sRx)},${f(sRy)}`,
    `L ${f(eRx)},${f(eRy)}`,
    `A ${f(h2px)},${f(h2px)} 0 1 1 ${f(eLx)},${f(eLy)}`,
    "Z",
  ].join(" ");
}

/** Linearly interpolate between two RGB triples. t ∈ [0, 1]. */
function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
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
  backgroundColor   = "#c8e6c9",
  leafColor         = "#2e7d32",
  trunkBaseHalfPx   = 28,
}) => {
  const { shapes, rootNorm } = useMemo(() => {
    if (tree.root.segments.length === 0) {
      return { shapes: [] as SegmentShape[], rootNorm: 1 };
    }
    const map = new Map<Segment, number>();
    const rootCount = buildCountMap(tree.root.segments, 0, map);
    const shapes: SegmentShape[] = [];
    gatherShapes(tree.root.segments, 0, map, shapes);
    return { shapes, rootNorm: Math.sqrt(rootCount) };
  }, [tree]);

  // Tight bounding box over all segment endpoints
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

  // baseHalf: world-space half-width such that the trunk is trunkBaseHalfPx pixels wide.
  // startNorm of the root = rootNorm, so trunk px width = baseHalf * rootNorm * viewScale = trunkBaseHalfPx.
  const baseHalf = trunkBaseHalfPx / (rootNorm * viewScale);

  // View transform: world → SVG px.
  // The parser uses y-down convention but the tree grows upward (y decreasing).
  // We flip so the tree stands upright:
  //   maxY is the visual BOTTOM (base, y=0 typically) → SVG y = height − padding
  //   minY is the visual TOP  (tips)                  → SVG y = padding
  const cx = width / 2 - ((minX + maxX) / 2) * viewScale;
  const tx = (x: number) => x * viewScale + cx;
  const ty = (y: number) => (height - padding) - (maxY - y) * viewScale;

  if (shapes.length === 0) {
    return <svg width={width} height={height} style={{ background: backgroundColor }} />;
  }

  return (
    <svg
      width={width}
      height={height}
      style={{ background: backgroundColor, display: "block" }}
    >
      {/* Tapered branch quads, back-to-front (thickest first for Z-order) */}
      {[...shapes]
        .sort((a, b) => b.startNorm - a.startNorm)
        .map((shape, i) => {
          const h1 = shape.startNorm * baseHalf;
          const h2 = shape.endNorm   * baseHalf;

          // Colour: thick = dark brown, thin = light brown
          const t = Math.min(1, shape.startNorm / rootNorm);
          const fill =
            t > 0.6
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

      {/* Leaf clusters on all segments in the outer canopy zone (thin branches) */}
      {shapes
        .filter((s) => s.startNorm / rootNorm < 0.5)
        .map((shape, i) => {
          const lx = tx(shape.segment.end.x);
          const ly = ty(shape.segment.end.y);
          // Leaves are roughly uniform size — don't scale with branch thickness
          const r  = Math.max(3, Math.min(7, shape.startNorm * baseHalf * viewScale * 2.5));
          return (
            <g key={`leaf-${i}`}>
              <circle cx={lx}              cy={ly}              r={r * 1.15} fill={leafColor}  opacity={0.50} />
              <circle cx={lx - r * 0.45}  cy={ly - r * 0.55}  r={r * 0.75} fill="#43a047"   opacity={0.60} />
              <circle cx={lx + r * 0.50}  cy={ly - r * 0.35}  r={r * 0.65} fill="#388e3c"   opacity={0.55} />
              <circle cx={lx + r * 0.10}  cy={ly - r * 0.80}  r={r * 0.55} fill="#66bb6a"   opacity={0.50} />
            </g>
          );
        })}
    </svg>
  );
};

export default LSystemSVGRenderer;
