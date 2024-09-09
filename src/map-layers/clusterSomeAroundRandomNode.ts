import { CustomRand } from "../config";

export function floodFillNodes<T extends { neighbors: Set<T> }, Y>({
  nodes,
  ratio,
  mapNode,
  rand,
}: {
  nodes: T[];
  ratio: number;
  mapNode: (node: T, isPicked: boolean) => Y;
  rand: CustomRand;
}): Y[] {
  // get furthest point, find one neighbour, unite them
  if (ratio < 0 || ratio > 1) {
    throw new Error("Invalid ratio value");
  }
  const filledCount = Math.round(nodes.length * ratio);

  const filledNodes: T[] = [];
  const pickedNodes: Set<T> = new Set();

  while (filledNodes.length < filledCount) {
    const randomIndex = rand.arrayIndex(nodes);
    const randomNode = nodes[randomIndex]!;

    if (!pickedNodes.has(randomNode)) {
      filledNodes.push(randomNode);
      pickedNodes.add(randomNode);

      randomNode.neighbors.forEach((neighbor) => {
        if (!pickedNodes.has(neighbor)) {
          filledNodes.push(neighbor);
          pickedNodes.add(neighbor);
        }
      });
    }
  }

  const result: Y[] = nodes.map((node) => mapNode(node, pickedNodes.has(node)));

  return result;
}
