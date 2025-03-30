import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  type Tree,
  type Segment,
  calculateTreeBounds,
} from "./l-system-parser";
import { BranchShapeNode, buildShapeTree } from "./generateCurvedTopShape";

// Props for the LSystemRenderer component
interface LSystemRendererProps {
  tree: Tree;
  width?: number;
  height?: number;
  backgroundColor?: string;
  branchColor?: string;
  leafColor?: string;
  showLeaves?: boolean;
}

/**
 * React component that renders an L-System tree using Three.js in 2D
 */
const LSystemRenderer: React.FC<LSystemRendererProps> = ({
  tree,
  width = 800,
  height = 600,
  backgroundColor = "#f0f0f0",
  branchColor = "#8B4513", // SaddleBrown
  leafColor = "#6B8E23", // OliveDrab
  showLeaves = true,
}) => {
  // Reference to the container div
  const containerRef = useRef<HTMLDivElement>(null);

  // Setup and render the Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Create Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);

    // Flatten the tree into segments
    const segments = flattenTreeForRendering(tree);
    const shapeTree = buildShapeTree(tree, 20);
    // Calculate bounds to center and scale the tree
    const bounds = calculateTreeBounds(segments);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    // Calculate scaling to fit in the view
    const marginFactor = 0.8; // Add some margin
    const scaleX = (width * marginFactor) / bounds.width;
    const scaleY = (height * marginFactor) / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    // Setup orthographic camera for 2D view
    const camera = new THREE.OrthographicCamera(
      -width / 2,
      width / 2,
      height / 2,
      -height / 2,
      0.1,
      1000
    );

    // Flip the y-axis to make the tree grow upward
    scene.scale.set(1, -1, 1);
    camera.position.z = 100;

    // Render the tree using lines
    renderShapeTree(scene, shapeTree, centerX, centerY, scale, branchColor);

    // Render once
    renderer.render(scene, camera);

    // Cleanup on unmount
    return () => {
      renderer.domElement.remove();
      renderer.dispose();
    };
  }, [
    tree,
    width,
    height,
    backgroundColor,
    branchColor,
    leafColor,
    showLeaves,
  ]);

  return <div ref={containerRef} />;
};

/**
 * Renders the L-System tree using line segments for a simpler 2D appearance
 */
const renderShapeTree = (
  scene: THREE.Scene,
  tree: BranchShapeNode,
  centerX: number,
  centerY: number,
  scale: number,
  branchColor: string
) => {
  const material = new THREE.LineBasicMaterial({ color: branchColor });

  const drawBranch = (node: BranchShapeNode) => {
    const points = node.shapePoints;
    console.log(points);

    // Close the shape by adding the first point to the end
    const closedPoints = [...points, points[0]];

    const scaledPoints = closedPoints.map(
      (point) =>
        new THREE.Vector3(
          point.x * scale - centerX,
          point.y * scale - centerY,
          0
        )
    );

    const geometry = new THREE.BufferGeometry().setFromPoints(scaledPoints);
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    node.children.forEach(drawBranch);
  };

  drawBranch(tree);
};

/**
 * Find terminating segments (those that don't have any segments continuing from their end point)
 */
const findTerminatingSegments = (segments: Segment[]): Set<Segment> => {
  const terminatingSegments = new Set<Segment>();
  const endPoints = new Set<string>();
  const startPoints = new Set<string>();

  // Collect all start and end points
  segments.forEach((segment) => {
    const startKey = `${segment.start.x},${segment.start.y}`;
    const endKey = `${segment.end.x},${segment.end.y}`;

    startPoints.add(startKey);
    endPoints.add(endKey);
  });

  // Find segments whose end points aren't the start of any other segment
  segments.forEach((segment) => {
    const endKey = `${segment.end.x},${segment.end.y}`;
    if (!startPoints.has(endKey)) {
      terminatingSegments.add(segment);
    }
  });

  return terminatingSegments;
};

/**
 * Transforms the tree into a flat list of segments for rendering
 */
const flattenTreeForRendering = (tree: Tree): Segment[] => {
  const segments: Segment[] = [];

  const traverseBranch = (branch: { segments: Segment[]; children: any[] }) => {
    segments.push(...branch.segments);
    branch.children.forEach(traverseBranch);
  };

  traverseBranch(tree.root);

  return segments;
};

export default LSystemRenderer;
