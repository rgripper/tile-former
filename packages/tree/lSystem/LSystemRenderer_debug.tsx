import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  type Tree,
  type Segment,
  calculateTreeBounds,
} from "./l-system-parser";

interface LSystemRendererProps {
  tree: Tree;
  width?: number;
  height?: number;
  backgroundColor?: string;
  branchColor?: string;
  leafColor?: string;
  showLeaves?: boolean;
}

const LSystemRenderer_debug: React.FC<LSystemRendererProps> = ({
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

    renderer.render(scene, camera);

    return () => {
      renderer.domElement.remove();
      renderer.dispose();
    };
  }, [tree, width, height, backgroundColor, branchColor, leafColor, showLeaves]);

  return <div ref={containerRef} />;
};

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
  const branchMaterial = new THREE.LineBasicMaterial({
    color: branchColor,
    linewidth: 1,
  });

  const treeGroup = new THREE.Group();
  const branchGeometry = new THREE.BufferGeometry();
  const branchPoints: THREE.Vector3[] = [];
  const leafPositions: THREE.Vector3[] = [];
  const terminatingSegments = findTerminatingSegments(segments);

  segments.forEach((segment) => {
    const startX = (segment.start.x - centerX) * scale;
    const startY = (segment.start.y - centerY) * scale;
    const endX = (segment.end.x - centerX) * scale;
    const endY = (segment.end.y - centerY) * scale;

    branchPoints.push(new THREE.Vector3(startX, startY, 0));
    branchPoints.push(new THREE.Vector3(endX, endY, 0));

    if (terminatingSegments.has(segment) && showLeaves) {
      leafPositions.push(new THREE.Vector3(endX, endY, 0));
    }
  });

  branchGeometry.setFromPoints(branchPoints);
  const branchLines = new THREE.LineSegments(branchGeometry, branchMaterial);
  treeGroup.add(branchLines);

  if (showLeaves) {
    const leafMaterial = new THREE.PointsMaterial({
      color: leafColor,
      size: 3,
      sizeAttenuation: false,
    });

    const leafGeometry = new THREE.BufferGeometry();
    leafGeometry.setFromPoints(leafPositions);
    treeGroup.add(new THREE.Points(leafGeometry, leafMaterial));
  }

  scene.add(treeGroup);
};

const findTerminatingSegments = (segments: Segment[]): Set<Segment> => {
  const startPoints = new Set<string>();

  segments.forEach((segment) => {
    startPoints.add(`${segment.start.x},${segment.start.y}`);
  });

  return new Set(
    segments.filter(
      (segment) => !startPoints.has(`${segment.end.x},${segment.end.y}`)
    )
  );
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

export default LSystemRenderer_debug;
