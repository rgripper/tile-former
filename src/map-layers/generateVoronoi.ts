import { Delaunay, Voronoi } from "d3-delaunay";
import { rand } from "../config";
import kmeans from "./kmeans";

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

type Edge = [Delaunay.Point, Delaunay.Point];

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

  console.log(
    [...filteredEdges]
      .map((edge) =>
        edge
          .map((x) => x.map((x) => x.toFixed(1)).join("|"))
          .toSorted()
          .join(",")
      )
      .toSorted()
      .join("\n")
  );
  return connectEdges(
    filteredEdges.filter((edge) => edge[0].toString() !== edge[1].toString())
  );
}

export function mergePolygons2(polygons: Delaunay.Polygon[]) {
  // Create a set to store unique points
  const uniquePoints = new Set<string>();

  // Combine all points from the polygons
  for (const polygon of polygons) {
    for (const point of polygon) {
      uniquePoints.add(`${point[0]},${point[1]}`);
    }
  }

  // Create a new polygon with the combined points
  const mergedPolygon: Delaunay.Polygon = [];

  for (const pointStr of uniquePoints) {
    const [x, y] = pointStr.split(",").map(Number);
    mergedPolygon.push([x, y]);
  }

  // Sort the points in a clockwise direction (adjust if needed)
  mergedPolygon.sort((a, b) => {
    // Implement a sorting algorithm based on your specific needs
    // For example, using atan2 for angle calculation
    const angleA = Math.atan2(
      a[1] - mergedPolygon[0][1],
      a[0] - mergedPolygon[0][0]
    );
    const angleB = Math.atan2(
      b[1] - mergedPolygon[0][1],
      b[0] - mergedPolygon[0][0]
    );
    return angleA - angleB;
  });

  return mergedPolygon;
}

function polygonToEdges(polygon: Delaunay.Polygon): Edge[] {
  return polygon.map((point, i): Edge => {
    const nextPoint = polygon[(i + 1) % polygon.length];
    return [point, nextPoint];
  });
}

export function groupCells(
  points: [number, number][],
  voronoi: Voronoi<Delaunay.Point>,
  k: number
) {
  const kmeansClusters = kmeans(points, k, "kmeans", () => rand.next());

  const pairs = kmeansClusters.indexes.map((clusterIndex, pointIndex) => ({
    clusterIndex,
    voronoiIndex: voronoi.delaunay.find(...points[pointIndex]),
  }));

  return Map.groupBy(pairs, (pair) => pair.clusterIndex)
    .values()
    .map((cluster) => cluster.map((x) => x.voronoiIndex));
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

  console.log(edge, edges);
  throw new Error("Could not find next point");
}

function findNextPoint(edge: Edge, edges: Edge[]): Delaunay.Point {
  for (const otherEdge of edges) {
    if (otherEdge === edge) {
      continue;
    }

    if (areSamePoint(edge[1], otherEdge[0])) {
      return otherEdge[1];
    }
    if (areSamePoint(edge[1], otherEdge[1])) {
      return otherEdge[0];
    }
  }

  console.log(edge, edges);
  throw new Error("Could not find next point");
}
