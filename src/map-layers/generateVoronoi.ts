import { Delaunay } from "d3-delaunay";
import { rand } from "../config";
import kmeans from "./kmeans";
import { Edge } from "./Edge";

export type GenerateVoronoi = ReturnType<typeof generateVoronoi>;

export function generateVoronoi(
  {
    width,
    height,
  }: {
    width: number;
    height: number;
  },
  count: number
) {
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    points.push([rand.next() * width, rand.next() * height]);
  }

  // Create Delaunay triangulation
  const delaunay = Delaunay.from(points);

  // Generate Voronoi diagram from Delaunay triangulation
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  return { points, voronoi };
}

export function mergePolygons(polygons: Delaunay.Polygon[]) {
  const allEdges = polygons.flatMap((polygon) => polygonToEdges(polygon));

  const filteredEdges = Map.groupBy(allEdges, (edge) =>
    edge
      .map((x) => x.toString())
      .toSorted()
      .join(",")
  )
    .values()
    .filter((edges) => edges.length === 1)
    .flatMap((x) => x)
    .toArray();

  return connectEdges(
    filteredEdges.filter((edge) => edge[0].toString() !== edge[1].toString())
  );
}

function polygonToEdges(polygon: Delaunay.Polygon): Edge[] {
  return polygon.map((point, i): Edge => {
    const nextPoint = polygon[(i + 1) % polygon.length];
    return [point, nextPoint];
  });
}

export function groupCells(points: Delaunay.Point[], k: number) {
  const kmeansClusters = kmeans(points, k, "kmeans", () => rand.next());

  const pairs = kmeansClusters.indexes.map((clusterIndex, pointIndex) => ({
    clusterIndex,
    pointIndex,
  }));

  return Map.groupBy(pairs, (pair) => pair.clusterIndex)
    .values()
    .map((cluster) => cluster.map((x) => x.pointIndex));
}

function connectEdges([firstEdge, ...edges]: Edge[]): Delaunay.Point[] {
  const points: Delaunay.Point[] = [...firstEdge];
  let current = { edge: firstEdge, nextPoint: firstEdge[1] };
  while (edges.length > 0) {
    current = findNext(current.edge, edges);
    points.push(current.nextPoint);
    edges.splice(edges.indexOf(current.edge), 1);
  }

  return points;
}

function areSamePoint(a: Delaunay.Point, b: Delaunay.Point) {
  return a[0] === b[0] && a[1] === b[1];
}

function findNext(
  edge: Edge,
  edges: Edge[]
): { edge: Edge; nextPoint: Delaunay.Point } {
  for (const otherEdge of edges) {
    if (otherEdge === edge) {
      continue;
    }

    if (areSamePoint(edge[1], otherEdge[0])) {
      return {
        edge: otherEdge,
        nextPoint: otherEdge[1],
      };
    }
    if (areSamePoint(edge[1], otherEdge[1])) {
      return {
        edge: otherEdge,
        nextPoint: otherEdge[0],
      };
    }
  }

  throw new Error("Could not find next point");
}
