import { Delaunay } from "d3-delaunay";
import { generateVoronoi, groupCells, mergePolygons } from "./generateVoronoi";
import { clusterSomeAroundRandomNode } from "./clusterSomeAroundRandomNode";
import { Edge } from "./Edge";

type Cell = {
  point: Delaunay.Point;
  polygon: Delaunay.Polygon;
  neighbors: Cell[];
};

type CellChunk = {
  polygon: Delaunay.Point[];
  neighbors: Set<CellChunk>;
  cells: Cell[];
};

export function generateCells() {
  const voronoiResult = generateVoronoi({ width: 800, height: 600 }, 50);
  const numberOfClusters = Math.ceil(
    Math.round(voronoiResult.points.length / 5)
  );

  const cells: Cell[] = voronoiResult.points.map((point, i) => ({
    point,
    polygon: voronoiResult.voronoi.cellPolygon(i),
    neighbors: [],
  }));
  cells.forEach((cell, i) => {
    cell.neighbors = Array.from(voronoiResult.voronoi.neighbors(i)).map(
      (x) => cells[x]
    );
  });

  let cellChunks: CellChunk[] = groupCells(
    voronoiResult.points,
    numberOfClusters
  )
    .toArray()
    .map((groupIndexes) => ({
      polygon: mergePolygons(
        groupIndexes.map((cellIndex) =>
          voronoiResult.voronoi.cellPolygon(cellIndex)
        )
      ),
      neighbors: new Set(),
      cells: groupIndexes.map((i): Cell => cells[i]),
    }));

  for (const chunk of cellChunks) {
    chunk.neighbors = new Set(
      cellChunks.filter(
        (otherChunk) =>
          otherChunk !== chunk &&
          chunk.cells.some((cell) => otherChunk.cells.includes(cell))
      )
    );
  }

  const chunks = clusterSomeAroundRandomNode(
    cellChunks,
    0.85,
    (x, isPicked) => ({
      ...x,
      isLand: isPicked,
    })
  );

  const mountainRanges = addMountainRanges({
    landChunks: chunks.filter((x) => x.isLand),
    groupCount: 2,
    groupSize: 5,
  });

  return { chunks, mountainRanges };
}

function addMountainRanges({
  landChunks,
  groupCount,
  groupSize,
}: {
  landChunks: CellChunk[];
  groupCount: number;
  groupSize: number;
}) {
  const mountainRanges: Edge[][] = [];

  for (let i = 0; i < groupCount; i++) {
    const range: Edge[] = [];

    for (let j = 0; j < groupSize; j++) {
      const chunk = landChunks[Math.floor(Math.random() * landChunks.length)];
      const cell = chunk.cells[Math.floor(Math.random() * chunk.cells.length)];

      const neighborChunks = Array.from(chunk.neighbors);
      const neighborChunk =
        neighborChunks[Math.floor(Math.random() * neighborChunks.length)];

      const neighborCell =
        neighborChunk.cells[
          Math.floor(Math.random() * neighborChunk.cells.length)
        ];

      range.push([cell.point, neighborCell.point]);
    }

    mountainRanges.push(range);
  }

  return mountainRanges;
}
