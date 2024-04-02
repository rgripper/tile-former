import { useState } from "react";
import "./App.css";
import { Effect, createQuadTree } from "./NewApp";

const initialTileMap = generateInitialMap(60, 60);
const tree = createQuadTree<Effect>(128, { width: 800, height: 800 });

function App() {
  const [tileMap, setTileMap] = useState(initialTileMap);

  return (
    <>
      <TileMapView data={tileMap} />
    </>
  );
}

// TODO:
/*
  1. We create an effect in a radius (and we need to correct the Effect type with settings below)
  2. We specify the strength
  3. We specify the radial gradient
  4. We specify the duration
  5. We specify the fadeOut function: fade(strength, totalDuration, remainingDuration) => centralValue
  6. We specify the effect speed (if any)

  A. We need to render the effect on the tile map
  B. We need to move the effect along the tile map
  C. We need to calculate the cumulative value of the Parameter on each tile of the map
  D. We need to remove the effect after the duration elapsed

  Side questions:

  Should we add decay to the Parameter values accumulated over the tiles? (otherwise the values can accumulate indefinitely)
*/

export default App;
function generateInitialMap(x: number, y: number): TileParameter[][] {
  return new Array(y)
    .fill(0)
    .map(() => new Array(x).fill(0).map(() => ({ value: 0 })));
}

type TileParameter = {
  value: number;
};

function TileMapView({ data }: { data: TileParameter[][] }) {
  return (
    <div className="tile-map">
      {data.map((row, y) => (
        <div key={y} className="tile-row">
          {row.map((tileParameter, x) => (
            <TileOverlay key={x} tileParameter={tileParameter} />
          ))}
        </div>
      ))}
    </div>
  );
}

function TileOverlay({ tileParameter }: { tileParameter: TileParameter }) {
  return <div className="tile">{tileParameter.value}</div>;
}

type TileIndex = [number, number];
