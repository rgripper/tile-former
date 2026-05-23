// My work plan:

// - Tree branch structure is generated using L-systems
// - A tree with branches is generated at random
// - A single tree image is generated
// - A wind force is applied to the tree branches using a js library
// - An animation spritemap is generated for multiple values of the wind force
// - An animation spritemap is stored in a file
// - The tree is animated to sway in the wind
// - A website is deployed with that generator.


// generateLSystem (rules) : Tree 
// split possible wind from 0 to 1 into N values
// for each wind value, given a tree: Tree
// - renderTree(tree) -> applyWindForce(tree) -> getTreeImage(tree)
// From the N tree images, generate a spritemap
// Given the wind speed slider, transition to the current wind value and animate between -2 and 2 relative to the current wind value

// Addition later:
// -> upackAndEnrichTree(lSystem): Tree. At this point enrichment simply means angles