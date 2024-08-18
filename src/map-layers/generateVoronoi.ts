import { Delaunay, Voronoi } from "d3-delaunay";
import { rand } from "../config";
import kmeans from "./kmeans";

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

export function groupCells(
  points: [number, number][],
  voronoi: Voronoi<Delaunay.Point>,
  k: number
) {
  const kmeansClusters = kmeans(points, k, "kmeans", () => rand.next());

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
