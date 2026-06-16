import { useState } from "react";
import { TileMapTool } from "./TileMapTool.tsx";
import { Assets, Spritesheet, Texture } from "pixi.js";
import atlasUrl from "./assets/grass.png";
import { biomes } from "@tile-former/tilegen";
import { TreeRenderer } from "@tile-former/tree";

const texture = await Assets.load<Texture>(atlasUrl);
const tileSpritesheet = new Spritesheet(texture, {
  frames: {
    "0": {
      frame: { x: 0, y: 0, w: 64, h: 64 },
      sourceSize: { w: 64, h: 64 },
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
    },
  },
  meta: {
    scale: 1,
  },
});
await tileSpritesheet.parse();

type Tab = "tilemap" | "tree";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("tilemap");

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex border-b border-border">
        <TabButton
          label="Tile Map"
          active={activeTab === "tilemap"}
          onClick={() => setActiveTab("tilemap")}
        />
        <TabButton
          label="Tree Renderer"
          active={activeTab === "tree"}
          onClick={() => setActiveTab("tree")}
        />
      </div>
      <div className="flex-1 flex flex-col overflow-auto">
        {activeTab === "tilemap" && (
          <TileMapTool biomes={biomes} tileSpritesheet={tileSpritesheet} />
        )}
        {activeTab === "tree" && <TreeRenderer />}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-b-2 border-primary text-primary"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

export default App;
