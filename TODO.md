# TODO:

## Refactoring:
- maybe introduce x,y helper to cycle through each tile instead of nested cycles - would that be easier when converting ot rust. Some repetitive indexed calls to grid[x][y].
- refactor each stage to constain meaningfully named helpers instead of a single sheet of code


## Vegetation pregen:
- Classify vegetation of a tile on 3 levels - floor, bushes, trees

## Mineable resources:
- The game will have ore mines, I need to allow specific tiles to be designated for that. Building amine on that tile will project an area in which the resources can be mined. The resources are unlimited. We need a way to pass the number of spots for each type of mineable resource. If one resource is mineable there, other resources could not be mined there? 
Possible changes: 
-- each map would have special workers - geologists, that would probe where the mines coudl be placed, but may hit a suboptimal area
-- we may want to allow to extract multiple resources if those are above some meaningful threshold in the mine


- If the resource mining is based on known local maximas
-- Generator may need to produce the list (x,y) of the nodes alongside the tilemap
-- Add mineables' rates for each of those nodes
-- Rename ore prop to "mineable resources"



