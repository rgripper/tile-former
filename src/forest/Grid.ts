type Coordinate = [number, number];
export class DynamicGridClustering {
  // Public state for direct access
  public grid: number[][];
  public clusters: Coordinate[][] = [];

  // Renamed to more descriptive term
  private minClusterValue: number;

  // Static 8-way connectivity directions
  private static readonly DIRECTIONS: Coordinate[] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0], // 4-way
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1], // Diagonals
  ];

  constructor(grid: number[][], minClusterValue: number) {
    // Deep clone input grid
    this.grid = grid.map((row) => [...row]);
    this.minClusterValue = minClusterValue;

    // Initial cluster computation
    this.computeClusters();
  }

  // Compute clusters for entire grid
  private computeClusters(): void {
    const processed = new Set<string>();
    const newClusters: Coordinate[][] = [];

    const coordToKey = (r: number, c: number): string => `${r},${c}`;

    const isValidCell = (
      r: number,
      c: number,
      processedSet: Set<string>
    ): boolean => {
      return (
        r >= 0 &&
        r < this.grid.length &&
        c >= 0 &&
        c < this.grid[0].length &&
        this.grid[r][c] >= this.minClusterValue &&
        !processedSet.has(coordToKey(r, c))
      );
    };

    const findClusterBFS = (startR: number, startC: number): Coordinate[] => {
      const cluster: Coordinate[] = [];
      const queue: Coordinate[] = [[startR, startC]];
      const clusterProcessed = new Set<string>();

      const key = coordToKey(startR, startC);
      clusterProcessed.add(key);
      processed.add(key);

      while (queue.length > 0) {
        const [r, c] = queue.shift()!;
        cluster.push([r, c]);

        for (const [dr, dc] of DynamicGridClustering.DIRECTIONS) {
          const newR = r + dr;
          const newC = c + dc;
          const newKey = coordToKey(newR, newC);

          if (
            isValidCell(newR, newC, processed) &&
            !clusterProcessed.has(newKey)
          ) {
            queue.push([newR, newC]);
            clusterProcessed.add(newKey);
            processed.add(newKey);
          }
        }
      }

      return cluster;
    };

    // Find all clusters
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[0].length; c++) {
        if (isValidCell(r, c, processed)) {
          const cluster = findClusterBFS(r, c);
          if (cluster.length > 0) {
            newClusters.push(cluster);
          }
        }
      }
    }

    // Update clusters state
    this.clusters = newClusters;
  }

  // Update multiple cells and recompute clusters
  updateCells(updates: { x: number; y: number; newValue: number }[]): void {
    // Compute bounds of affected area
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    // Apply updates to grid
    for (const update of updates) {
      this.grid[update.y][update.x] = update.newValue;

      // Update affected area bounds
      minX = Math.min(minX, update.x);
      maxX = Math.max(maxX, update.x);
      minY = Math.min(minY, update.y);
      maxY = Math.max(maxY, update.y);
    }

    // Recompute entire grid clusters
    this.computeClusters();
  }
}

// Example usage
function exampleMutableClustering() {
  // Create a sample grid
  const initialGrid = Array.from({ length: 100 }, () =>
    Array.from({ length: 100 }, () => Math.floor(Math.random() * 4))
  );

  // Initialize clustering
  const clusterer = new DynamicGridClustering(initialGrid, 2);

  // Initial clusters
  console.log("Initial Cluster Count:", clusterer.clusters.length);

  // Simulate updates
  clusterer.updateCells([
    { x: 50, y: 50, newValue: 3 },
    { x: 51, y: 50, newValue: 3 },
    { x: 52, y: 50, newValue: 3 },
  ]);

  // Get updated clusters
  console.log("Updated Cluster Count:", clusterer.clusters.length);
}
