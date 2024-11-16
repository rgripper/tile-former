import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';

const ForestClusters = () => {
  const GRID_SIZE = 40;
  const [grid, setGrid] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [gradientMap, setGradientMap] = useState([]);
  const [densityThreshold, setDensityThreshold] = useState(3);
  const [clusterSizeThreshold, setClusterSizeThreshold] = useState(8);
  const [temperatureThreshold, setTemperatureThreshold] = useState(0.6);
  const GRADIENT_RANGE = 5; // How far the gradient spreads
  
  // Initialize grid
  useEffect(() => {
    const newGrid = Array(GRID_SIZE).fill(0).map(() =>
      Array(GRID_SIZE).fill(0).map(() => Math.random() < 0.3 ? Math.floor(Math.random() * 3) + 1 : 0)
    );
    setGrid(newGrid);
  }, []);

  // Find clusters using flood fill
  const findClusters = (grid) => {
    const visited = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(false));
    const clusters = [];
    
    const floodFill = (row, col, cluster) => {
      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;
      if (visited[row][col] || grid[row][col] === 0) return;
      
      visited[row][col] = true;
      cluster.cells.push({row, col, trees: grid[row][col]});
      
      // Check neighbors (8-directional)
      for(let i = -1; i <= 1; i++) {
        for(let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          floodFill(row + i, col + j, cluster);
        }
      }
    };
    
    for(let row = 0; row < GRID_SIZE; row++) {
      for(let col = 0; col < GRID_SIZE; col++) {
        if (!visited[row][col] && grid[row][col] > 0) {
          const cluster = { cells: [] };
          floodFill(row, col, cluster);
          
          if (cluster.cells.length >= clusterSizeThreshold) {
            const totalTrees = cluster.cells.reduce((sum, cell) => sum + cell.trees, 0);
            cluster.density = totalTrees / cluster.cells.length;
            
            if (cluster.density >= densityThreshold) {
              clusters.push(cluster);
            }
          }
        }
      }
    }
    return clusters;
  };

  // Calculate gradient influence for each cell
  const calculateGradients = (clusters) => {
    const gradientMap = Array(GRID_SIZE).fill().map(() => 
      Array(GRID_SIZE).fill(0)
    );

    // For each cluster
    clusters.forEach(cluster => {
      // For each cell in the cluster and surrounding area
      for(let row = 0; row < GRID_SIZE; row++) {
        for(let col = 0; col < GRID_SIZE; col++) {
          // Find minimum distance to any cluster cell
          let minDistance = Math.min(...cluster.cells.map(clusterCell => {
            const dx = clusterCell.row - row;
            const dy = clusterCell.col - col;
            return Math.sqrt(dx * dx + dy * dy);
          }));

          // Calculate gradient influence based on distance
          if (minDistance <= GRADIENT_RANGE) {
            const influence = (1 - minDistance / GRADIENT_RANGE) * cluster.density / densityThreshold;
            gradientMap[row][col] = Math.max(gradientMap[row][col], influence);
          }
        }
      }
    });

    return gradientMap;
  };

  useEffect(() => {
    if (grid.length > 0) {
      const newClusters = findClusters(grid);
      setClusters(newClusters);
      setGradientMap(calculateGradients(newClusters));
    }
  }, [grid, densityThreshold, clusterSizeThreshold]);

  const getCellColor = (row, col) => {
    const trees = grid[row]?.[col] || 0;
    const gradientValue = gradientMap[row]?.[col] || 0;
    
    // Find if cell is part of a cluster
    const cluster = clusters.find(c => 
      c.cells.some(cell => cell.row === row && cell.col === col)
    );
    
    // Temperature overlay (pink gradient)
    if (gradientValue >= temperatureThreshold) {
      const intensity = Math.min(1, (gradientValue - temperatureThreshold) / (1 - temperatureThreshold));
      return `bg-gradient-to-r from-pink-500/${Math.floor(intensity * 60)} to-pink-600/${Math.floor(intensity * 60)}`;
    }
    
    // Forest and gradient colors
    if (cluster) {
      return cluster.density >= densityThreshold * 1.5 
        ? 'bg-green-900' // Dark forest
        : 'bg-green-700'; // Normal forest cluster
    } else if (gradientValue > 0) {
      const intensity = Math.floor(gradientValue * 500);
      return `bg-green-${Math.min(500, intensity)}`;
    }
    
    // Base colors for trees or empty tiles
    return trees === 0 ? 'bg-green-100' : `bg-green-${trees * 100 + 300}`;
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Forest Cluster Visualization with Temperature Gradients</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Density Threshold: {densityThreshold}</label>
            <Slider 
              min={1} 
              max={5} 
              step={0.5}
              value={[densityThreshold]}
              onValueChange={([value]) => setDensityThreshold(value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Cluster Size Threshold: {clusterSizeThreshold}</label>
            <Slider 
              min={4} 
              max={20} 
              step={1}
              value={[clusterSizeThreshold]}
              onValueChange={([value]) => setClusterSizeThreshold(value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Temperature Threshold: {temperatureThreshold}</label>
            <Slider 
              min={0.2} 
              max={0.8} 
              step={0.1}
              value={[temperatureThreshold]}
              onValueChange={([value]) => setTemperatureThreshold(value)}
            />
          </div>
          <div className="grid gap-px bg-gray-200" 
               style={{
                 gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`,
                 width: 'fit-content'
               }}>
            {grid.map((row, i) =>
              row.map((cell, j) => (
                <div
                  key={`${i}-${j}`}
                  className={`w-3 h-3 ${getCellColor(i, j)}`}
                  title={`Trees: ${cell}, Gradient: ${gradientMap[i]?.[j]?.toFixed(2)}`}
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

export default ForestClusters;
