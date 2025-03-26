/**
 * L-System Parser
 *
 * Converts L-System strings into structured tree representations
 * for 2D rendering.
 */

// Type Definitions
export type Position = {
  x: number;
  y: number;
};

export type Segment = {
  start: Position;
  end: Position;
  angleRad: number;
  width: number;
};

export type Branch = {
  segments: Segment[];
  children: Branch[];
};

export type Tree = {
  root: Branch;
};

export type ParserOptions = {
  initialPosition: Position;
  initialAngle: number; // In degrees, 0 = right, 90 = up
  segmentLength: number;
  angleDelta: number; // In degrees
  widthFactor: number; // Width reduction for branches
};

/**
 * Default parser options
 */
export const DEFAULT_PARSER_OPTIONS: ParserOptions = {
  initialPosition: { x: 0, y: 0 },
  initialAngle: -90, // Start growing upward
  segmentLength: 10,
  angleDelta: 25, // Turn angle in degrees
  widthFactor: 0.75, // Width reduction factor for branches
};

/**
 * Parse L-System string into a structured tree representation
 *
 * @param lSystemString - The L-System string to parse
 * @param options - Parsing options
 * @returns A structured tree representation
 */
export const parseLSystem = (
  lSystemString: string,
  options: Partial<ParserOptions> = {}
): Tree => {
  // Merge default options with provided options
  const opts: ParserOptions = { ...DEFAULT_PARSER_OPTIONS, ...options };

  // State variables for the turtle
  const positions: Position[] = [opts.initialPosition];
  const angles: number[] = [opts.initialAngle];
  const widths: number[] = [1]; // Start with width of 1

  // Root branch
  const rootBranch: Branch = { segments: [], children: [] };

  // Current branch being built
  let currentBranch: Branch = rootBranch;
  const branchStack: Branch[] = [];

  // Process each character in the L-System string
  for (let i = 0; i < lSystemString.length; i++) {
    const char = lSystemString[i];
    const currentPosition = positions[positions.length - 1];
    const currentAngle = angles[angles.length - 1];
    const currentWidth = widths[widths.length - 1];

    switch (char) {
      case "F": // Move forward and draw
        // Calculate new position
        const radians = (currentAngle * Math.PI) / 180;
        const newPosition = {
          x: currentPosition.x + opts.segmentLength * Math.cos(radians),
          y: currentPosition.y + opts.segmentLength * Math.sin(radians),
        };

        // Create a segment
        const segment: Segment = {
          start: { ...currentPosition },
          end: { ...newPosition },
          angleRad: radians,
          width: currentWidth,
        };

        // Add segment to current branch
        currentBranch.segments.push(segment);

        // Update position
        positions[positions.length - 1] = newPosition;
        break;

      case "+": // Turn right
        angles[angles.length - 1] = currentAngle + opts.angleDelta;
        break;

      case "-": // Turn left
        angles[angles.length - 1] = currentAngle - opts.angleDelta;
        break;

      case "[": // Start a new branch
        // Save current state
        positions.push({ ...currentPosition });
        angles.push(currentAngle);
        widths.push(currentWidth * opts.widthFactor); // Reduce width for new branch

        // Create new branch
        const newBranch: Branch = { segments: [], children: [] };

        // Add new branch as child of current branch
        currentBranch.children.push(newBranch);

        // Save current branch on stack
        branchStack.push(currentBranch);

        // Make new branch the current one
        currentBranch = newBranch;
        break;

      case "]": // End a branch
        // Restore previous state
        positions.pop();
        angles.pop();
        widths.pop();

        // Restore previous branch
        if (branchStack.length > 0) {
          currentBranch = branchStack.pop()!;
        }
        break;

      // Ignore other characters
      default:
        break;
    }
  }

  return { root: rootBranch };
};

/**
 * Calculate tree bounds for rendering
 *
 * @param segments - Array of segments
 * @returns Bounding box information
 */
export const calculateTreeBounds = (segments: Segment[]) => {
  if (segments.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  segments.forEach((segment) => {
    // Check start point
    minX = Math.min(minX, segment.start.x);
    minY = Math.min(minY, segment.start.y);
    maxX = Math.max(maxX, segment.start.x);
    maxY = Math.max(maxY, segment.start.y);

    // Check end point
    minX = Math.min(minX, segment.end.x);
    minY = Math.min(minY, segment.end.y);
    maxX = Math.max(maxX, segment.end.x);
    maxY = Math.max(maxY, segment.end.y);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

/**
 * Creates a simple representation of the tree for debugging
 *
 * @param tree - The tree to stringify
 * @returns String representation of the tree structure
 */
export const stringifyTree = (tree: Tree): string => {
  let result = "";

  const stringifyBranch = (branch: Branch, indent = 0): void => {
    const padding = " ".repeat(indent * 2);
    result += `${padding}Branch with ${branch.segments.length} segments\n`;

    branch.children.forEach((child, index) => {
      result += `${padding}Child ${index + 1}:\n`;
      stringifyBranch(child, indent + 1);
    });
  };

  stringifyBranch(tree.root);
  return result;
};
