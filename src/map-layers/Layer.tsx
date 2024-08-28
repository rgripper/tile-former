import { useEffect, useState } from "react";
import { generateVoronoi, groupCells, mergePolygons } from "./generateVoronoi";
import { renderVoronoi } from "./renderVoronoi";
import { Application } from "pixi.js";
import { rand } from "../config";
import { Delaunay } from "d3-delaunay";


type CellChunk = {
  polygon: Delaunay.Point[];
  neighbors: Set<CellChunk>;
  cellIndexes: number[];
};

const voronoiResult = generateVoronoi({ width: 800, height: 600 }, 50);
const numberOfClusters = Math.ceil(Math.round(voronoiResult.points.length / 5));
let cellChunks: CellChunk[] = groupCells(voronoiResult.points, numberOfClusters)
  .toArray()
  .map((groupIndexes) => ({
    polygon: mergePolygons(
      groupIndexes.map((cellIndex) =>
        voronoiResult.voronoi.cellPolygon(cellIndex)
      )
    ),
    neighbors: new Set(),
    cellIndexes: groupIndexes,
  }));

for (const chunk of cellChunks) {
  chunk.neighbors = new Set(
    cellChunks.filter(
      (otherChunk) =>
        otherChunk !== chunk &&
        chunk.cellIndexes.some((y) => otherChunk.cellIndexes.includes(y))
    )
  );
}

const landChunks = clusterSomeAroundRandomNode(cellChunks, 0.85);

const app = new Application();
await app.init({
  width: 800,
  height: 600,
  backgroundColor: 0x1099bb,
});

// const groups = groupCells(
//   voronoiResult.points,
//   voronoiResult.voronoi,
//   Math.ceil(Math.round(voronoiResult.points.length / 5))
// ).toArray();

await renderVoronoi(
  app,
  Map.groupBy(cellChunks, (x) => landChunks.includes(x))
    .values()
    .map((x) => x.map((x) => x.polygon))
    .toArray()
);

export function Layer() {
  const [ref, setRef] = useState<HTMLDivElement | null>();
  useEffect(() => {
    if (ref) {
      ref.appendChild(app.canvas);
      return () => {
        ref.removeChild(app.canvas);
      };
    }
  }, [ref]);

  return <div ref={setRef}></div>;
}
function clusterSomeAroundRandomNode<T extends { neighbors: Set<T> }>(
  nodes: T[],
  ratio: number
): T[] {
  // get furthest point, find one neighbour, unite them
  if (ratio < 0 || ratio > 1) {
    throw new Error("Invalid ratio value");
  }
  const clusteredCount = Math.round(nodes.length * ratio);
  // then we can floodfill from one point to get all the points in the cluster

  const clusterIndexes: number[] = [];
  const startIndex = rand.intBetween(0, nodes.length);
  const visited: boolean[] = new Array(nodes.length).fill(false);
  const queue: number[] = [startIndex];
  visited[startIndex] = true;
  clusterIndexes.push(startIndex);

  while (queue.length > 0 && clusterIndexes.length < clusteredCount) {
    const currentIndex = queue.shift()!;
    const neighbors = nodes[currentIndex].neighbors;

    for (const neighbor of neighbors) {
      const neighborIndex = nodes.indexOf(neighbor);
      if (!visited[neighborIndex]) {
        visited[neighborIndex] = true;
        clusterIndexes.push(neighborIndex);
        queue.push(neighborIndex);

        if (clusterIndexes.length === clusteredCount) {
          break;
        }
      }
    }
  }

  return clusterIndexes.map((i) => nodes[i]);
}
