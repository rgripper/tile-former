import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  type Tree,
  type Segment,
  calculateTreeBounds,
} from "./l-system-parser";
import { buildShapeTree } from "./buildTree";
import { NodeWithInlet } from "./buildNodeWithInlet";

interface LSystemRendererProps {
  tree: Tree;
  width?: number;
  height?: number;
  backgroundColor?: string;
  branchColor?: string;
  leafColor?: string;
  showLeaves?: boolean;
}

const LSystemRenderer: React.FC<LSystemRendererProps> = ({
  tree,
  width = 800,
  height = 600,
  backgroundColor = "#f0f0f0",
  branchColor = "#8B4513",
  leafColor = "#6B8E23",
  showLeaves = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);

    const segments = flattenTreeForRendering(tree);
    const abstractTree = buildShapeTree(tree.root, 40);

    const bounds = calculateTreeBounds(segments);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const marginFactor = 0.8;
    const scaleX = (width * marginFactor) / bounds.width;
    const scaleY = (height * marginFactor) / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    const camera = new THREE.OrthographicCamera(
      -width / 2,
      width / 2,
      height / 2,
      -height / 2,
      0.1,
      1000
    );

    scene.scale.set(1, -1, 1);
    camera.position.z = 100;

    renderShapeTree(scene, abstractTree, centerX, centerY, scale, branchColor);

    renderer.render(scene, camera);

    return () => {
      renderer.domElement.remove();
      renderer.dispose();
    };
  }, [tree, width, height, backgroundColor, branchColor, leafColor, showLeaves]);

  return <div ref={containerRef} />;
};

const renderShapeTree = (
  scene: THREE.Scene,
  tree: NodeWithInlet,
  centerX: number,
  centerY: number,
  scale: number,
  branchColor: string
) => {
  const material = new THREE.LineBasicMaterial({ color: branchColor });

  const drawBranch = (node: NodeWithInlet) => {
    const points = node.inlet;
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
    scene.add(new THREE.Line(geometry, material));

    node.children.forEach(drawBranch);
  };

  drawBranch(tree);
};

const flattenTreeForRendering = (tree: Tree): Segment[] => {
  const segments: Segment[] = [];

  const traverseBranch = (branch: { segments: Segment[] }) => {
    segments.push(...branch.segments);
    branch.segments.flatMap((x) => x.branches).forEach(traverseBranch);
  };

  traverseBranch(tree.root);
  return segments;
};

export default LSystemRenderer;
