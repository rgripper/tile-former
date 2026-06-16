export type Position = {
  x: number;
  y: number;
};

export type Segment = {
  start: Position;
  end: Position;
  angleRad: number;
  width: number;
  branches: Branch[];
};

export type Branch = {
  segments: Segment[];
};

export type Tree = {
  root: Branch;
};

export type ParserOptions = {
  initialPosition: Position;
  initialAngle: number;
  segmentLength: number;
  angleDelta: number;
  widthFactor: number;
};

export const DEFAULT_PARSER_OPTIONS: ParserOptions = {
  initialPosition: { x: 0, y: 0 },
  initialAngle: -90,
  segmentLength: 10,
  angleDelta: 25,
  widthFactor: 0.75,
};

export const parseLSystem = (
  lSystemString: string,
  options: Partial<ParserOptions> = {}
): Tree => {
  const opts: ParserOptions = { ...DEFAULT_PARSER_OPTIONS, ...options };

  const positions: Position[] = [opts.initialPosition];
  const angles: number[] = [opts.initialAngle];
  const widths: number[] = [1];

  const rootBranch: Branch = { segments: [] };
  let currentBranch: Branch = rootBranch;
  const branchStack: Branch[] = [];

  for (let i = 0; i < lSystemString.length; i++) {
    const char = lSystemString[i];
    const currentPosition = positions[positions.length - 1];
    const currentAngle = angles[angles.length - 1];
    const currentWidth = widths[widths.length - 1];

    switch (char) {
      case "F": {
        const radians = (currentAngle * Math.PI) / 180;
        const newPosition = {
          x: currentPosition.x + opts.segmentLength * Math.cos(radians),
          y: currentPosition.y + opts.segmentLength * Math.sin(radians),
        };

        const segment: Segment = {
          start: { ...currentPosition },
          end: { ...newPosition },
          angleRad: radians,
          width: currentWidth,
          branches: [],
        };

        currentBranch.segments.push(segment);
        positions[positions.length - 1] = newPosition;
        break;
      }

      case "+":
        angles[angles.length - 1] = currentAngle + opts.angleDelta;
        break;

      case "-":
        angles[angles.length - 1] = currentAngle - opts.angleDelta;
        break;

      case "[": {
        positions.push({ ...currentPosition });
        angles.push(currentAngle);
        widths.push(currentWidth * opts.widthFactor);

        const newBranch: Branch = { segments: [] };
        const lastSegment = currentBranch.segments.at(-1);
        if (!lastSegment) {
          throw new Error("No segment found to attach the new branch.");
        }
        lastSegment.branches.push(newBranch);
        branchStack.push(currentBranch);
        currentBranch = newBranch;
        break;
      }

      case "]":
        positions.pop();
        angles.pop();
        widths.pop();

        if (branchStack.length > 0) {
          currentBranch = branchStack.pop()!;
        }
        break;

      default:
        break;
    }
  }

  return { root: rootBranch };
};

export const calculateTreeBounds = (segments: Segment[]) => {
  if (segments.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  segments.forEach((segment) => {
    minX = Math.min(minX, segment.start.x, segment.end.x);
    minY = Math.min(minY, segment.start.y, segment.end.y);
    maxX = Math.max(maxX, segment.start.x, segment.end.x);
    maxY = Math.max(maxY, segment.start.y, segment.end.y);
  });

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

export const stringifyTree = (tree: Tree): string => {
  let result = "";

  const stringifyBranch = (branch: Branch, indent = 0): void => {
    const padding = " ".repeat(indent * 2);
    result += `${padding}Branch with ${branch.segments.length} segments\n`;

    branch.segments
      .flatMap((x) => x.branches)
      .forEach((child, index) => {
        result += `${padding}Child ${index + 1}:\n`;
        stringifyBranch(child, indent + 1);
      });
  };

  stringifyBranch(tree.root);
  return result;
};
