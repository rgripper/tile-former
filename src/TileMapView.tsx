import { useEffect, useRef, useState } from "react";
import { initApp } from "./initApp.ts";
import { initIsoApp } from "./isoRenderer.ts";
import { Application, Spritesheet } from "pixi.js";
import type { Tile } from "@tile-former/tilegen";
import { Viewport } from "pixi-viewport";
import type { Container } from "pixi.js";
import type { VoronoiData } from "./voronoi.ts";

type RenderMode = "topdown" | "isometric";

export function TileMapView({
  tileMap,
  tileSpritesheet,
  onTileClick,
  smallVoronoiData,
  seed,
  showSmallVoronoi,
  showVoronoiFeatures,
}: {
  tileMap: Tile[][];
  tileSpritesheet: Spritesheet;
  onTileClick: (tile: Tile) => void;
  smallVoronoiData: VoronoiData;
  seed: string;
  showSmallVoronoi: boolean;
  showVoronoiFeatures: boolean;
}) {
  const [renderMode, setRenderMode] = useState<RenderMode>("isometric");
  const [canvasRef, setCanvasRef] = useState<HTMLElement | null>(null);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const appAndViewportRef = useRef<
    { app: Application; viewport: Viewport } | undefined
  >(undefined);
  const voronoiLayersRef = useRef<{
    small: Container;
    features: Container;
  } | null>(null);
  const highlightTileRef = useRef<((tile: Tile | null) => void) | null>(null);

  useEffect(() => {
    if (!canvasRef) return;

    let unsubscribe = () => {};

    const handleClick = (tile: Tile) => {
      setSelectedTile(tile);
      highlightTileRef.current?.(tile);
      onTileClick(tile);
    };

    if (renderMode === "topdown") {
      initApp({
        tileMap,
        tileSpritesheet,
        container: canvasRef,
        onTileClick: handleClick,
        smallVoronoiData,
        seed,
        showSmallVoronoi,
        showVoronoiFeatures,
      }).then(({ app, viewport, smallVoronoiLayer, voronoiFeaturesLayer }) => {
        appAndViewportRef.current = { app, viewport };
        voronoiLayersRef.current = { small: smallVoronoiLayer, features: voronoiFeaturesLayer };
        canvasRef.appendChild(app.canvas);
        unsubscribe = () => {
          appAndViewportRef.current = undefined;
          voronoiLayersRef.current = null;
          canvasRef.removeChild(app.canvas);
          app.destroy();
        };
      });
    } else {
      initIsoApp({
        tileMap,
        container: canvasRef,
        onTileClick: handleClick,
      }).then(({ app, viewport, highlightTile }) => {
        appAndViewportRef.current = { app, viewport };
        voronoiLayersRef.current = null;
        highlightTileRef.current = highlightTile;
        canvasRef.appendChild(app.canvas);
        unsubscribe = () => {
          appAndViewportRef.current = undefined;
          highlightTileRef.current = null;
          canvasRef.removeChild(app.canvas);
          app.destroy();
        };
      });
    }

    return () => unsubscribe();
  }, [canvasRef, tileSpritesheet, tileMap, smallVoronoiData, seed, onTileClick, renderMode]);

  useEffect(() => {
    if (voronoiLayersRef.current) {
      voronoiLayersRef.current.small.visible = showSmallVoronoi;
    }
  }, [showSmallVoronoi]);

  useEffect(() => {
    if (voronoiLayersRef.current) {
      voronoiLayersRef.current.features.visible = showVoronoiFeatures;
    }
  }, [showVoronoiFeatures]);

  return (
    <div className="flex-1 flex relative">
      <div className="flex-1 flex" ref={setCanvasRef} />
      <button
        onClick={() => setRenderMode((m) => m === "topdown" ? "isometric" : "topdown")}
        className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded shadow transition-colors"
      >
        {renderMode === "topdown" ? "2.5D View" : "Top Down"}
      </button>
      {selectedTile && (
        <div className="absolute bottom-2 left-2 z-10 bg-black/70 text-white text-xs font-mono px-3 py-2 rounded shadow space-y-1">
          <div>
            tile ({selectedTile.index.x}, {selectedTile.index.y})
          </div>
          <div>
            level <span className="text-yellow-300 font-bold">{selectedTile.altitudeLevel}</span>
            <span className="opacity-50"> / 10</span>
          </div>
          {(
            [
              { label: "moisture", value: selectedTile.effectiveMoisture, color: "bg-blue-400" },
              { label: "light", value: selectedTile.light, color: "bg-yellow-300" },
              { label: "fertility", value: selectedTile.fertility, color: "bg-green-400" },
            ] as const
          ).map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="opacity-60 w-16">{label}</span>
              <div className="w-20 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
