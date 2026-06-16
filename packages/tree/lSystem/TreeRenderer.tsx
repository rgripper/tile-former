import React, { useState, useEffect } from "react";
import { generateLSystem, TreeTemplates } from "./l-system-generator";
import { parseLSystem } from "./l-system-parser";
import LSystemRenderer from "./threejs-lsystem-renderer.tsx";
import LSystemRenderer_debug from "./LSystemRenderer_debug.tsx";
import Rand from "rand-seed";

const rand = new Rand("random");

const TEMPLATES = ["pine", "oak", "bush"] as const;
const ITERATIONS = [1, 2, 3, 4, 5] as const;
const ANGLES = [15, 20, 25, 30, 35, 45] as const;
const SEGMENT_LENGTHS = [5, 8, 10, 15, 20] as const;

type Template = (typeof TEMPLATES)[number];

const TreeRenderer: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<Template>("oak");
  const [iterations, setIterations] = useState(2);
  const [angleParameter, setAngleParameter] = useState(25);
  const [segmentLength, setSegmentLength] = useState(10);
  const [tree, setTree] = useState<any>(null);

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
    setTree({ ...parsedTree, _timestamp: Date.now() });
  }, [selectedTemplate, iterations, angleParameter, segmentLength]);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
      <h1>L-System Tree Generator</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
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

      {tree && (
        <div className="grid grid-cols-2 gap-4">
          <LSystemRenderer_debug
            tree={tree}
            width={400}
            height={600}
            backgroundColor="#e6f7ff"
            branchColor="#8B4513"
          />
          <LSystemRenderer
            tree={tree}
            width={400}
            height={600}
            backgroundColor="#e6f7ff"
            branchColor="#8B4513"
          />
        </div>
      )}
    </div>
  );
};

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{ width: "140px", fontSize: "0.9em", color: "#555" }}>{label}</span>
      <div style={{ display: "flex", gap: "4px" }}>{children}</div>
    </div>
  );
}

function Btn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "0.85em",
        background: active ? "#3b82f6" : "#fff",
        color: active ? "#fff" : "#333",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

export default TreeRenderer;
