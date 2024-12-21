import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { calcClustersAndGradients } from "./calcClustersAndGradients";
import { DynamicGridClustering } from "./Grid";

const ForestClusters = () => {
  const GRID_SIZE = 40;
  const [clustering, setClustering] = useState<DynamicGridClustering>(() => {
    const newGrid = Array(GRID_SIZE)
      .fill(0)
      .map(() =>
        Array(GRID_SIZE)
          .fill(0)
          .map(() =>
            Math.random() < 0.3 ? Math.floor(Math.random() * 3) + 1 : 0
          )
      );

    return new DynamicGridClustering(newGrid, clusterSizeThreshold);
  });
  const [clusters, setClusters] = useState<
    { cells: { row: number; col: number; trees: number }[]; density?: number }[]
  >([]);
  const [gradientMap, setGradientMap] = useState<number[][]>([]);
  const [densityThreshold, setDensityThreshold] = useState(3);
  const [clusterSizeThreshold, setClusterSizeThreshold] = useState(8);
  const [temperatureThreshold, setTemperatureThreshold] = useState(0.6);
  const GRADIENT_RANGE = 5; // How far the gradient spreads

  useEffect(() => {
    if (grid.length > 0) {
      const { newClusters, newGradients } = calcClustersAndGradients(
        GRID_SIZE,
        clusterSizeThreshold,
        densityThreshold,
        GRADIENT_RANGE,
        grid
      );
      setClusters(newClusters);
      setGradientMap(newGradients);
    }
  }, [grid, densityThreshold, clusterSizeThreshold]);

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>
          Forest Cluster Visualization with Temperature Gradients
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Density Threshold: {densityThreshold}
            </label>
            <Slider
              min={1}
              max={5}
              step={0.5}
              value={[densityThreshold]}
              onValueChange={([value]) => setDensityThreshold(value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Cluster Size Threshold: {clusterSizeThreshold}
            </label>
            <Slider
              min={4}
              max={20}
              step={1}
              value={[clusterSizeThreshold]}
              onValueChange={([value]) => setClusterSizeThreshold(value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Temperature Threshold: {temperatureThreshold}
            </label>
            <Slider
              min={0.2}
              max={0.8}
              step={0.1}
              value={[temperatureThreshold]}
              onValueChange={([value]) => setTemperatureThreshold(value)}
            />
          </div>
          <div
            className="grid gap-px bg-gray-200"
            style={{
              gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
              width: "fit-content",
            }}
          >
            {grid.map((row, x) =>
              row.map((cell, y) => (
                <div
                  key={`${x}-${y}`}
                  className={`w-3 h-3 ${getCellColor({
                    row: x,
                    col: y,
                    clusters,
                    grid,
                    gradientMap,
                    densityThreshold,
                    temperatureThreshold,
                  })}`}
                  title={`Trees: ${cell}, Gradient: ${gradientMap[x]?.[
                    y
                  ]?.toFixed(2)}`}
                />
              ))
            )}
          </div>
          <div className="text-sm space-y-1">
            <p>Clusters found: {clusters.length}</p>
            <p>Color legend:</p>
            <ul className="list-disc list-inside">
              <li>Light green: Empty tiles</li>
              <li>Medium green: Individual trees (1-3 trees)</li>
              <li>Forest green: Forest cluster</li>
              <li>Dark green: Dense forest (inner area)</li>
              <li>Green gradient: Forest influence area</li>
              <li>Pink overlay: Temperature effect zones</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

function getCellColor({
  grid,
  gradientMap,
  clusters,
  densityThreshold,
  temperatureThreshold,
  row,
  col,
}: {
  grid: number[][];
  gradientMap: number[][];
  clusters: {
    cells: { row: number; col: number; trees: number }[];
    density?: number;
  }[];
  densityThreshold: number;
  temperatureThreshold: number;
  row: number;
  col: number;
}) {
  const trees = grid[row]?.[col] || 0;
  const gradientValue = gradientMap[row]?.[col] || 0;

  // Find if cell is part of a cluster
  const cluster = clusters.find((c) =>
    c.cells.some((cell) => cell.row === row && cell.col === col)
  );

  // Temperature overlay (pink gradient)
  if (gradientValue >= temperatureThreshold) {
    const intensity = Math.min(
      1,
      (gradientValue - temperatureThreshold) / (1 - temperatureThreshold)
    );
    return `bg-gradient-to-r from-pink-500/${Math.floor(
      intensity * 60
    )} to-pink-600/${Math.floor(intensity * 60)}`;
  }

  // Forest and gradient colors
  if (cluster) {
    return cluster.density! >= densityThreshold * 1.5
      ? "bg-green-900" // Dark forest
      : "bg-green-700"; // Normal forest cluster
  } else if (gradientValue > 0) {
    const intensity = Math.floor(gradientValue * 500);
    return `bg-green-${Math.min(500, intensity)}`;
  }

  // Base colors for trees or empty tiles
  return trees === 0 ? "bg-green-100" : `bg-green-${trees * 100 + 300}`;
}

export default ForestClusters;
