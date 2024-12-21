export function calcClustersAndGradients(
  gridSize: number,
  clusterSizeThreshold: number,
  densityThreshold: number,
  gradientRange: number,
  grid: number[][]
) {
  const newClusters = findClusters({
    gridSize,
    clusterSizeThreshold,
    densityThreshold,
    grid,
  });

  const newGradients = calculateGradients({
    gridSize,
    densityThreshold,
    gradientRange,
    clusters: newClusters,
  });
  return { newClusters, newGradients };
}
// Find clusters using flood fill
function findClusters({
  gridSize,
  clusterSizeThreshold,
  densityThreshold,
  grid,
}: {
  gridSize: number;
  clusterSizeThreshold: number;
  densityThreshold: number;
  grid: number[][];
}) {
  const visited = Array(gridSize)
    .fill(0)
    .map(() => Array(gridSize).fill(false));
  const clusters: {
    cells: { row: number; col: number; trees: number }[];
    density?: number;
  }[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (!visited[row][col] && grid[row][col] > 0) {
        const cluster = {
          cells: [] as { row: number; col: number; trees: number }[],
        };
        floodFill(row, col, visited, cluster, grid, gridSize);

        if (cluster.cells.length >= clusterSizeThreshold) {
          const totalTrees = cluster.cells.reduce(
            (sum, cell) => sum + cell.trees,
            0
          );
          const density = totalTrees / cluster.cells.length;

          if (density >= densityThreshold) {
            clusters.push({ ...cluster, density });
            clusters.push(cluster);
          }
        }
      }
    }
  }
  return clusters;
}

function floodFill(
  row: number,
  col: number,
  visited: boolean[][],
  cluster: { cells: { row: number; col: number; trees: number }[] },
  grid: number[][],
  gridSize: number
) {
  if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return;
  if (visited[row][col] || grid[row][col] === 0) return;

  visited[row][col] = true;
  cluster.cells.push({ row, col, trees: grid[row][col] });

  // Check neighbors (8-directional)
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      floodFill(row + i, col + j, visited, cluster, grid, gridSize);
    }
  }
}

// Calculate gradient influence for each cell
function calculateGradients({
  gridSize,
  densityThreshold,
  gradientRange,
  clusters,
}: {
  gridSize: number;
  densityThreshold: number;
  gradientRange: number;
  clusters: {
    cells: { row: number; col: number; trees: number }[];
    density?: number;
  }[];
}) {
  const gradientMap = Array(gridSize)
    .fill(0)
    .map(() => Array(gridSize).fill(0));

  // For each cluster
  clusters.forEach((cluster) => {
    // For each cell in the cluster and surrounding area
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        // Find minimum distance to any cluster cell
        const minDistance = Math.min(
          ...cluster.cells.map((clusterCell) => {
            const dx = clusterCell.row - row;
            const dy = clusterCell.col - col;
            return Math.sqrt(dx * dx + dy * dy);
          })
        );

        if (minDistance <= gradientRange) {
          // Calculate gradient influence based on distance
          const influence =
            ((1 - minDistance / gradientRange) * (cluster.density || 0)) /
            densityThreshold;
          gradientMap[row][col] = Math.max(gradientMap[row][col], influence);
        }
      }
    }
  });

  return gradientMap;
}
