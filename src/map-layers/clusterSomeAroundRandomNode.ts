import { rand } from "../config";

export function clusterSomeAroundRandomNode<T extends { neighbors: Set<T> }, Y>(
  nodes: T[],
  ratio: number,
  mapNode: (node: T, isPicked: boolean) => Y
): Y[] {
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

  return nodes.map((node, i) => mapNode(node, clusterIndexes.includes(i)));
}
