import "core-js/modules/esnext.iterator.range";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { biomes } from "@tile-former/tilegen";
// import { parseLSystem } from "./tree/lSystem/l-system-parser.ts";
// import TreeRenderer from "./tree/lSystem/TreeRenderer.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {/* <TreeRenderer /> */}
  </React.StrictMode>,
);

// Example plant
// const examplePlant = {
//   name: "Cactus",
//   temperatureRange: [20, 40],
//   moistureRange: [1, 2],
//   lightRange: [3, 4],
// } as const;

// console.log(classifyPlantBiome(examplePlant, biomes));
