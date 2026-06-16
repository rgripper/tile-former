export type Rule = {
  predecessor: string;
  successors: { successor: string; probability: number }[];
};

export type LSystem = {
  axiom: string;
  rules: Rule[];
};

export const createLSystem = (axiom: string, rules: Rule[]): LSystem => ({
  axiom,
  rules,
});

export const generateNextIteration = (
  current: string,
  rules: Rule[],
  random: () => number
): string => {
  let result = "";

  for (let i = 0; i < current.length; i++) {
    const char = current[i];
    const rule = rules.find((rule) => rule.predecessor === char);

    if (rule) {
      const randomValue = random();
      let cumulativeProbability = 0;

      for (const { successor, probability } of rule.successors) {
        cumulativeProbability += probability;
        if (randomValue <= cumulativeProbability) {
          result += successor;
          break;
        }
      }
    } else {
      result += char;
    }
  }

  return result;
};

export const generateLSystem = (
  system: LSystem,
  iterations: number,
  random: () => number
): string => {
  let result = system.axiom;

  for (let i = 0; i < iterations; i++) {
    result = generateNextIteration(result, system.rules, random);
  }

  return result;
};

export const TreeTemplates = {
  pineTree: (): LSystem =>
    createLSystem("F", [
      {
        predecessor: "F",
        successors: [
          { successor: "FF-[-F+F+F]+[+F-F-F]", probability: 0.7 },
          { successor: "FF-[-F+F]+[+F-F]", probability: 0.3 },
        ],
      },
    ]),

  oakTree: (): LSystem =>
    createLSystem("X", [
      {
        predecessor: "X",
        successors: [
          { successor: "F[+X][-X]FX", probability: 0.5 },
          { successor: "F[-X]FX", probability: 0.3 },
          { successor: "F[+X]FX", probability: 0.2 },
        ],
      },
      {
        predecessor: "F",
        successors: [
          { successor: "FF", probability: 0.8 },
          { successor: "FFF", probability: 0.2 },
        ],
      },
    ]),

  bushTree: (): LSystem =>
    createLSystem("Y", [
      {
        predecessor: "Y",
        successors: [
          { successor: "YFX[+Y][-Y]", probability: 0.6 },
          { successor: "YFX[+Y]", probability: 0.2 },
          { successor: "YFX[-Y]", probability: 0.2 },
        ],
      },
      {
        predecessor: "X",
        successors: [
          { successor: "X[-FFF][+FFF]FX", probability: 0.7 },
          { successor: "X[-FF][+FF]FX", probability: 0.3 },
        ],
      },
      {
        predecessor: "F",
        successors: [
          { successor: "FF", probability: 0.85 },
          { successor: "F", probability: 0.15 },
        ],
      },
    ]),
};
