import React, { useState, useEffect, useRef } from "react";
import { generateCurvedTopShape } from "./generateCurvedTopShape";
import { randerBranch } from "./randerBranch";

const CurvedTopRectangle = () => {
  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const height = 200;
  // State for shape data
  const [topSegmentsCount, setTopSegmentsCount] = useState(0);

  // Draw the shape on canvas
  const drawShape = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const baseParameter = {
      curvature: 3,
      maxChildRadiusDeviation: 0.12,
      numberOfChildren: 3,
    };

    const treeBase = {
      leftPoint: { x: 200, y: 600 },
      rightPoint: { x: 220, y: 600 },
    };

    const trunk = generateCurvedTopShape({
      ...treeBase,
      height,
      random: Math.random,
      ...baseParameter,
    });
    randerBranch({ ctx, branch: trunk });

    for (const branchBottom of trunk.topPointPairs) {
      const branch = generateCurvedTopShape({
        leftPoint: branchBottom.start,
        rightPoint: branchBottom.end,
        height,
        random: Math.random,
        ...baseParameter,
      });
      randerBranch({ ctx, branch });
    }

    setTopSegmentsCount(trunk.topPointPairs.length);
  };

  // Effect hook to draw shape whenever parameters change
  useEffect(() => {
    drawShape();
  }, []);

  // Handle slider change events
  const handleSliderChange =
    (setter: {
      (value: React.SetStateAction<number>): void;
      (value: React.SetStateAction<number>): void;
      (value: React.SetStateAction<number>): void;
      (value: React.SetStateAction<number>): void;
      (value: React.SetStateAction<number>): void;
      (value: React.SetStateAction<number>): void;
      (value: React.SetStateAction<number>): void;
      (value: React.SetStateAction<number>): void;
      (arg0: number): void;
    }) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(parseInt(e.target.value));
    };

  return (
    <div className="flex flex-col items-center p-6">
      <canvas
        ref={canvasRef}
        width="800"
        height="800"
        className="border border-gray-300 bg-gray-50"
      />

      <div className="mt-4">
        <p className="text-lg">Total top segments: {topSegmentsCount}</p>
      </div>
    </div>
  );
};

export default CurvedTopRectangle;
