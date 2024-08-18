type QuadNode<T> = {
  values: Set<T>;
  x: number;
  y: number;
  children: QuadNode<T>[];
};

export const createQuadTree = <T>(
  quadSide: number,
  capturedBox: { width: number; height: number }
): QuadNode<T> & { leaves: QuadNode<T>[] } => {
  return {
    values: new Set<T>(),
    x: 0,
    y: 0,
    children: [],
    leaves: [],
  };
};

export const getLeafIndexesInRadius = <T>(
  tree: QuadNode<T>,
  radius: number,
  maxGranularity: number
): { x: number; y: number }[] => {
  const indexes: [] = [];
  return indexes;
};

export type Effect = {
  id: EffectId;
  effectType: EffectType;
  x: number;
  y: number;
  radius: number;
  strength: number;
  gradientFunction: (radius: number) => number;
  duration: number;
  fadeOutFunction: (
    strength: number,
    totalDuration: number,
    remainingDuration: number
  ) => number;
  totalDuration: number;
  remainingDuration: number;
};

type EffectId = number; //
type EffectType = number;


// Environmental Stats