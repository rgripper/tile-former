import React, { useState, useEffect, useRef } from "react";
import { generateLSystem, TreeTemplates } from "./l-system-generator";
import { parseLSystem } from "./l-system-parser";
import { LSystemSVGRenderer } from "./LSystemSVGRenderer";
import Rand from "rand-seed";

const rand = new Rand("random");

const TEMPLATES = ["pine", "oak", "bush"] as const;
const ITERATIONS = [1, 2, 3, 4, 5] as const;
const ANGLES = [15, 20, 25, 30, 35, 45] as const;
const SEGMENT_LENGTHS = [5, 8, 10, 15, 20] as const;

type Template = (typeof TEMPLATES)[number];

const TreeRenderer: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<Template>("oak");
  const [iterations, setIterations] = useState(3);
  const [angleParameter, setAngleParameter] = useState(25);
  const [segmentLength, setSegmentLength] = useState(10);
  const [tree, setTree] = useState<any>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 700, h: 680 });

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setCanvasSize({ w: Math.floor(width), h: Math.floor(Math.min(width * 0.9, 750)) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let template;
    switch (selectedTemplate) {
      case "pine":
        template = TreeTemplates.pineTree();
        break;
      case "bush":
        template = TreeTemplates.bushTree();
        break;
      case "oak":
      default:
        template = TreeTemplates.oakTree();
        break;
    }

    const generatedString = generateLSystem(template, iterations, () => rand.next());
    const parsedTree = parseLSystem(generatedString, {
      initialPosition: { x: 0, y: 0 },
      initialAngle: -90,
      segmentLength,
      angleDelta: angleParameter,
      widthFactor: 0.8,
    });
    setTree(parsedTree);
  }, [selectedTemplate, iterations, angleParameter, segmentLength]);

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "20px" }}>
      <h1 style={{ marginBottom: "20px", fontSize: "1.4rem", fontWeight: 700 }}>
        L-System Tree Generator
      </h1>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 24px",
          marginBottom: "24px",
          padding: "16px",
          background: "#f8f9fa",
          borderRadius: "8px",
          border: "1px solid #dee2e6",
        }}
      >
        <ControlRow label="Tree Type">
          {TEMPLATES.map((t) => (
            <Btn key={t} active={selectedTemplate === t} onClick={() => setSelectedTemplate(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Btn>
          ))}
        </ControlRow>

        <ControlRow label="Iterations">
          {ITERATIONS.map((n) => (
            <Btn key={n} active={iterations === n} onClick={() => setIterations(n)}>
              {n}
            </Btn>
          ))}
        </ControlRow>

        <ControlRow label="Branching Angle">
          {ANGLES.map((a) => (
            <Btn key={a} active={angleParameter === a} onClick={() => setAngleParameter(a)}>
              {a}°
            </Btn>
          ))}
        </ControlRow>

        <ControlRow label="Segment Length">
          {SEGMENT_LENGTHS.map((l) => (
            <Btn key={l} active={segmentLength === l} onClick={() => setSegmentLength(l)}>
              {l}
            </Btn>
          ))}
        </ControlRow>
      </div>

      <div ref={containerRef} style={{ borderRadius: "8px", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>
        {tree && (
          <LSystemSVGRenderer
            tree={tree}
            width={canvasSize.w}
            height={canvasSize.h}
            backgroundColor="#d7ecd9"
            leafColor="#2e7d32"
            trunkBaseHalfPx={Math.max(18, canvasSize.w * 0.035)}
          />
        )}
      </div>
    </div>
  );
};

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ width: "130px", fontSize: "0.85em", fontWeight: 600, color: "#495057" }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Btn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 13px",
        border: "1px solid " + (active ? "#1a6dbf" : "#ced4da"),
        borderRadius: "5px",
        cursor: "pointer",
        fontSize: "0.82em",
        background: active ? "#3b82f6" : "#fff",
        color: active ? "#fff" : "#343a40",
        fontWeight: active ? 600 : 400,
        transition: "background 0.12s, color 0.12s",
      }}
    >
      {children}
    </button>
  );
}

export default TreeRenderer;
