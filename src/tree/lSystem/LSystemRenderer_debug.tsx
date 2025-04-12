import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  type Tree,
  type Segment,
  calculateTreeBounds,
} from "./l-system-parser";

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
const LSystemRenderer_debug: React.FC<LSystemRendererProps> = ({
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
    console.log("real tree", tree);
    const segments = flattenTreeForRendering(tree);

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
    renderTreeLines(
      scene,
      segments,
      centerX,
      centerY,
      scale,
      branchColor,
      leafColor,
      showLeaves
    );

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
const renderTreeLines = (
  scene: THREE.Scene,
  segments: Segment[],
  centerX: number,
  centerY: number,
  scale: number,
  branchColor: string,
  leafColor: string,
  showLeaves: boolean
) => {
  // Create materials
  const branchMaterial = new THREE.LineBasicMaterial({
    color: branchColor,
    linewidth: 1,
  });

  // Group to hold all lines
  const treeGroup = new THREE.Group();

  // Create geometry for branches
  const branchGeometry = new THREE.BufferGeometry();

  // Collect points for branches
  const branchPoints: THREE.Vector3[] = [];

  // Set to keep track of leaf positions (end points of terminal branches)
  const leafPositions: THREE.Vector3[] = [];
  const terminatingSegments = findTerminatingSegments(segments);

  // Process each segment
  segments.forEach((segment) => {
    const startX = (segment.start.x - centerX) * scale;
    const startY = (segment.start.y - centerY) * scale;
    const endX = (segment.end.x - centerX) * scale;
    const endY = (segment.end.y - centerY) * scale;

    // Add points for this segment
    branchPoints.push(new THREE.Vector3(startX, startY, 0));
    branchPoints.push(new THREE.Vector3(endX, endY, 0));

    // If this is a terminating segment, add its end position as a leaf position
    if (terminatingSegments.has(segment) && showLeaves) {
      leafPositions.push(new THREE.Vector3(endX, endY, 0));
    }
  });

  // Set positions for branch lines
  branchGeometry.setFromPoints(branchPoints);

  // Create branch line segments
  const branchLines = new THREE.LineSegments(branchGeometry, branchMaterial);
  treeGroup.add(branchLines);

  // Add leaves at terminal points if enabled
  if (showLeaves) {
    const leafMaterial = new THREE.PointsMaterial({
      color: leafColor,
      size: 3,
      sizeAttenuation: false,
    });

    const leafGeometry = new THREE.BufferGeometry();
    const leafPoints = Array.from(leafPositions);
    leafGeometry.setFromPoints(leafPoints);

    const leaves = new THREE.Points(leafGeometry, leafMaterial);
    treeGroup.add(leaves);
  }

  // Add the tree group to the scene
  scene.add(treeGroup);
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

  const traverseBranch = (branch: { segments: Segment[] }) => {
    segments.push(...branch.segments);
    branch.segments.flatMap((x) => x.branches).forEach(traverseBranch);
  };

  traverseBranch(tree.root);

  return segments;
};

export default LSystemRenderer_debug;
