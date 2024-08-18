import { Delaunay, Voronoi } from "d3-delaunay";
import { rand } from "../config";
import kmeans from "kmeans-ts"; // dist/kmeans-ts.esm.js

export function generateVoronoi({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const points: [number, number][] = [];
  for (let i = 0; i < 40; i++) {
    points.push([rand.next() * width, rand.next() * height]);
  }

  // Create Delaunay triangulation
  const delaunay = Delaunay.from(points);

  // Generate Voronoi diagram from Delaunay triangulation
  const voronoi = delaunay.voronoi([0, 0, width, height]);
  return { points, voronoi };
}

export function groupCells(
  points: [number, number][],
  voronoi: Voronoi<Delaunay.Point>,
  k: number
) {
  const data = points.map((p) => [p[0], p[1]]);

  // Apply K-means clustering

  const kmeansClusters = kmeans(data, k, "kmeans");

  const pairs = kmeansClusters.indexes.map((clusterIndex, pointIndex) => ({
    clusterIndex,
    voronoiIndex: voronoi.delaunay.find(
      points[pointIndex][0],
      points[pointIndex][1]
    ),
  }));

  return Map.groupBy(pairs, (pair) => pair.clusterIndex)
    .values()
    .map((x) => x.map((y) => y.voronoiIndex));
}
