import React, { useState, useEffect } from "react";
import { generateLSystem, TreeTemplates } from "./l-system-generator";
import { parseLSystem } from "./l-system-parser";
import LSystemRenderer from "./threejs-lsystem-renderer.tsx";
import LSystemRenderer_debug from "./LSystemRenderer_debug.tsx";
import Rand from "rand-seed";

const rand = new Rand("random");

const TreeRenderer: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>("oak");
  const [iterations, setIterations] = useState<number>(2);
  const [angleParameter, setAngleParameter] = useState<number>(25);
  const [segmentLength, setSegmentLength] = useState<number>(10);
  const [lSystemString, setLSystemString] = useState<string>("");
  const [tree, setTree] = useState<any>(null);

  useEffect(() => {
    const timestamp = Date.now();

    let template;
    switch (selectedTemplate) {
      case "pine":
        template = TreeTemplates.pineTree();
        break;
      case "oak":
      default:
        template = TreeTemplates.oakTree();
        break;
      case "bush":
        template = TreeTemplates.bushTree();
        break;
    }

    const generatedString = generateLSystem(template, iterations, () =>
      rand.next()
    );
    setLSystemString(generatedString);

    const parsedTree = parseLSystem(generatedString, {
      initialPosition: { x: 0, y: 0 },
      initialAngle: -90,
      segmentLength: segmentLength,
      angleDelta: angleParameter,
      widthFactor: 0.8,
    });
    setTree({ ...parsedTree, _timestamp: timestamp });
  }, [selectedTemplate, iterations, angleParameter, segmentLength]);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
      <h1>L-System Tree Generator</h1>

      <div style={{ marginBottom: "20px" }}>
        <div style={{ marginBottom: "10px" }}>
          <label htmlFor="template-select" style={{ marginRight: "10px" }}>
            Tree Type:
          </label>
          <select
            id="template-select"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            style={{ padding: "5px" }}
          >
            <option value="pine">Pine Tree</option>
            <option value="oak">Oak Tree</option>
            <option value="bush">Bush</option>
          </select>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label htmlFor="iterations-input" style={{ marginRight: "10px" }}>
            Iterations:
          </label>
          <input
            id="iterations-input"
            type="number"
            min="1"
            max="6"
            value={iterations}
            onChange={(e) => setIterations(parseInt(e.target.value))}
            style={{ padding: "5px" }}
          />
          <span style={{ marginLeft: "10px", fontSize: "0.8em", color: "#666" }}>
            (Higher values may affect performance)
          </span>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label htmlFor="angle-input" style={{ marginRight: "10px" }}>
            Branching Angle:
          </label>
          <input
            id="angle-input"
            type="number"
            min="10"
            max="45"
            value={angleParameter}
            onChange={(e) => setAngleParameter(parseInt(e.target.value))}
            style={{ padding: "5px" }}
          />
          <span style={{ marginLeft: "5px" }}>degrees</span>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label htmlFor="length-input" style={{ marginRight: "10px" }}>
            Segment Length:
          </label>
          <input
            id="length-input"
            type="number"
            min="5"
            max="20"
            value={segmentLength}
            onChange={(e) => setSegmentLength(parseInt(e.target.value))}
            style={{ padding: "5px" }}
          />
          <span style={{ marginLeft: "5px" }}>units</span>
        </div>
      </div>

      {tree && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <LSystemRenderer_debug
              tree={tree}
              width={400}
              height={600}
              backgroundColor="#e6f7ff"
              branchColor="#8B4513"
            />
          </div>
          <div>
            <LSystemRenderer
              tree={tree}
              width={400}
              height={600}
              backgroundColor="#e6f7ff"
              branchColor="#8B4513"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TreeRenderer;
