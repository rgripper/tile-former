import { Delaunay } from "d3-delaunay";
import { generateVoronoi, groupCells, mergePolygons } from "./generateVoronoi";
import { floodFillNodes } from "./clusterSomeAroundRandomNode";
import { Edge } from "./Edge";
import { rand } from "../config";

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

export type AreaChunk = CellChunk & { isLand: boolean };

export function generateCells(): {
  chunks: AreaChunk[];
  mountainRanges: Edge[];
} {
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
      (x) => cells[x]!
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
      cells: groupIndexes.map((i): Cell => cells[i]!),
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

  const chunks = floodFillNodes(cellChunks, 0.85, (x, isPicked) => ({
    ...x,
    isLand: isPicked,
  }));

  const landChunks = chunks.filter((x) => x.isLand);
  const mountainRanges = addMountainRanges({
    landChunks,
    count: 10,
  });

  return { chunks, mountainRanges };
}

function addMountainRanges({
  landChunks,
  count,
}: {
  landChunks: CellChunk[];
  count: number;
}) {
  const mountainRanges: Edge[] = [];

  const _rand = rand;
  const edges = landChunks.flatMap((x) =>
    x.cells.flatMap((x) => getEdges(x.polygon))
  );

  if (count > edges.length) {
    throw new Error("Not enough edges to create that many mountain ranges");
  }

  for (let i = 0; i < count; i++) {
    const edge = edges.splice(_rand.intBetween(0, edges.length), 1)[0]!;
    mountainRanges.push(edge);
  }

  return mountainRanges;
}

function getEdges(polygon: Delaunay.Polygon): Edge[] {
  return polygon.map((point, i) => [point, polygon[(i + 1) % polygon.length]!]);
}
