/**
 * L-System Generator
 *
 * A collection of stateless functions for generating L-Systems,
 * particularly focused on creating 2D tree structures.
 */

// Type Definitions
export type Rule = {
  predecessor: string;
  successors: { successor: string; probability: number }[];
};

export type LSystem = {
  axiom: string;
  rules: Rule[];
};

/**
 * Creates a new L-System with the specified axiom and rules
 *
 * @param axiom - The starting string
 * @param rules - Array of production rules
 * @returns A new LSystem object
 */
export const createLSystem = (axiom: string, rules: Rule[]): LSystem => ({
  axiom,
  rules,
});

/**
 * Applies L-System rules to generate the next iteration
 *
 * @param current - The current string
 * @param rules - Array of production rules
 * @returns The new string after applying the rules
 */
export const generateNextIteration = (current: string, rules: Rule[]): string => {
  let result = '';
  
  for (let i = 0; i < current.length; i++) {
    const char = current[i];
    const rule = rules.find(rule => rule.predecessor === char);
    
    if (rule) {
      // Choose a successor based on probability
      const random = Math.random();
      let cumulativeProbability = 0;
      
      for (const {successor, probability} of rule.successors) {
        cumulativeProbability += probability;
        if (random <= cumulativeProbability) {
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
/**
 * Generates an L-System string after the specified number of iterations
 *
 * @param system - The L-System to use
 * @param iterations - Number of iterations to perform
 * @returns The final L-System string
 */
export const generateLSystem = (
  system: LSystem,
  iterations: number
): string => {
  let result = system.axiom;

  for (let i = 0; i < iterations; i++) {
    result = generateNextIteration(result, system.rules);
  }

  return result;
};

/**
 * Predefined L-Systems for different tree types
 */
export const TreeTemplates = {
  /**
   * Pine tree
   * Characterized by a central trunk with symmetric branches
   */
  pineTree: (): LSystem => createLSystem(
    "F",
    [
      { 
        predecessor: "F", 
        successors: [
          { successor: "FF-[-F+F+F]+[+F-F-F]", probability: 0.7 },
          { successor: "FF-[-F+F]+[+F-F]", probability: 0.3 }
        ] 
      }
    ]
  ),
  
  /**
   * Oak-like tree
   * More irregular branching pattern with thicker main branches
   */
  oakTree: (): LSystem => createLSystem(
    "X",
    [
      { 
        predecessor: "X", 
        successors: [
          { successor: "F[+X][-X]FX", probability: 0.5 },
          { successor: "F[-X]FX", probability: 0.3 },
          { successor: "F[+X]FX", probability: 0.2 }
        ] 
      },
      { 
        predecessor: "F", 
        successors: [
          { successor: "FF", probability: 0.8 },
          { successor: "FFF", probability: 0.2 }
        ] 
      }
    ]
  ),
  
  /**
   * Bush-like structure
   * Dense branching with shorter segments
   */
  bushTree: (): LSystem => createLSystem(
    "Y",
    [
      { 
        predecessor: "Y", 
        successors: [
          { successor: "YFX[+Y][-Y]", probability: 0.6 },
          { successor: "YFX[+Y]", probability: 0.2 },
          { successor: "YFX[-Y]", probability: 0.2 }
        ] 
      },
      { 
        predecessor: "X", 
        successors: [
          { successor: "X[-FFF][+FFF]FX", probability: 0.7 },
          { successor: "X[-FF][+FF]FX", probability: 0.3 }
        ] 
      },
      { 
        predecessor: "F", 
        successors: [
          { successor: "FF", probability: 0.85 },
          { successor: "F", probability: 0.15 }
        ] 
      }
    ])
};
