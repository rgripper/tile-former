TODO:

- Classify vegetation of a tile on 3 levels - floor, bushes, trees
- Introduce ore cluster nodes, so workers could build mines on top of them - those nodes are just ceterpoints or local maxima
- List nodes separately alongside the map?
- Add ore rates for each of those nodes
- Rename ore prop - if it means iron, gold, diamonds/gems

Refactoring

- Break the project into subpackages - biomes, rest (trees), rendering UI.
- maybe introduce x,y helper to cycle through each tile instead of nested cycles - would that be easier when converting ot rust. Some repetitive indexed calls to grid[x][y].
- refactor each stage to constain meaningfully named helpers instead of a single sheet of code
- as an LLM if it's better to keep documentation of each stage with the code itself and only reference stage names and not stage spec inside the pipeline file
