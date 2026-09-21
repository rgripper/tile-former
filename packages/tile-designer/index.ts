// Public API of the generation core — consumed by the designer app and by the
// game's iso renderer.
//
// Milestone G note: this is the v2 surface. The v1 per-tile world-coordinate
// bake (`bake.ts` and the `substrate/`, `mats/`, `scatter/`, `stamps.ts`
// generators it drove) is gone; a consumer now builds an atlas and composes
// dual cells against it, which is the whole point of the redesign.
export * from "./src/core/types.ts";
export * from "./src/core/rng.ts";
export * from "./src/core/resolve.ts";
export * from "./src/core/palette/index.ts";
export * from "./src/core/pixels.ts";
export * from "./src/core/lattice.ts";
export * from "./src/core/noise.ts";
export * from "./src/core/biomeInput.ts";

// The dual-grid pipeline.
export * from "./src/core/masks.ts";
export * from "./src/core/materials/index.ts";
export * from "./src/core/atlas.ts";
export * from "./src/core/compose.ts";
export * from "./src/core/features/index.ts";
export * from "./src/core/terrain.ts";
