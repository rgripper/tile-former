import { useEffect, useRef, useState } from "react";
import { initApp } from "./initApp.ts";
import { Application, Spritesheet } from "pixi.js";
import type { Tile } from "@tile-former/tilegen";
import { Viewport } from "pixi-viewport";
import type { Container } from "pixi.js";
import type { VoronoiData } from "./voronoi.ts";

export function TileMapView({
  tileMap,
  tileSpritesheet,
  onTileClick,
  largeVoronoiData,
  smallVoronoiData,
  seed,
  showLargeVoronoi,
  showSmallVoronoi,
  showVoronoiFeatures,
}: {
  tileMap: Tile[][];
  tileSpritesheet: Spritesheet;
  onTileClick: (tile: Tile) => void;
  largeVoronoiData: VoronoiData;
  smallVoronoiData: VoronoiData;
  seed: string;
  showLargeVoronoi: boolean;
  showSmallVoronoi: boolean;
  showVoronoiFeatures: boolean;
}) {
  const [ref, setRef] = useState<HTMLElement | null>(null);
  const appAndViewportRef = useRef<
    { app: Application; viewport: Viewport } | undefined
  >(undefined);
  const voronoiLayersRef = useRef<{
    large: Container;
    small: Container;
    features: Container;
  } | null>(null);

  useEffect(() => {
    if (ref) {
      let unsubscribe = () => {};
      initApp({
        tileMap,
        tileSpritesheet,
        container: ref,
        onTileClick,
        largeVoronoiData,
        smallVoronoiData,
        seed,
        showLargeVoronoi,
        showSmallVoronoi,
        showVoronoiFeatures,
      }).then(({ app, viewport, largeVoronoiLayer, smallVoronoiLayer, voronoiFeaturesLayer }) => {
        appAndViewportRef.current = { app, viewport };
        voronoiLayersRef.current = { large: largeVoronoiLayer, small: smallVoronoiLayer, features: voronoiFeaturesLayer };
        ref.appendChild(app.canvas);
        unsubscribe = () => {
          appAndViewportRef.current = undefined;
          voronoiLayersRef.current = null;
          ref.removeChild(app.canvas);
          app.destroy();
        };
      });

      return () => unsubscribe();
    }
  }, [ref, tileSpritesheet, tileMap, largeVoronoiData, smallVoronoiData, seed, onTileClick]);

  useEffect(() => {
    if (voronoiLayersRef.current) {
      voronoiLayersRef.current.large.visible = showLargeVoronoi;
    }
  }, [showLargeVoronoi]);

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

  return <div className="flex-1 flex" ref={setRef}></div>;
}
