/**
 * L-System Generator
 *
 * A collection of stateless functions for generating L-Systems,
 * particularly focused on creating 2D tree structures.
 */

// Type Definitions
export type Rule = {
  predecessor: string;
  successor: string;
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
export const generateNextIteration = (
  current: string,
  rules: Rule[]
): string => {
  return Array.from(current).reduce((result, char) => {
    const rule = rules.find((rule) => rule.predecessor === char);
    return result + (rule ? rule.successor : char);
  }, "");
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
   * Simple binary tree
   * Each branch splits into two with consistent growth
   */
  simpleBinaryTree: (): LSystem =>
    createLSystem("0", [
      { predecessor: "0", successor: "1[0]0" },
      { predecessor: "1", successor: "11" },
    ]),

  /**
   * Pine tree
   * Characterized by a central trunk with symmetric branches
   */
  pineTree: (): LSystem =>
    createLSystem("F", [
      { predecessor: "F", successor: "FF-[-F+F+F]+[+F-F-F]" },
    ]),

  /**
   * Oak-like tree
   * More irregular branching pattern with thicker main branches
   */
  oakTree: (): LSystem =>
    createLSystem("X", [
      { predecessor: "X", successor: "F[+X][-X]FX" },
      { predecessor: "F", successor: "FF" },
    ]),

  /**
   * Bush-like structure
   * Dense branching with shorter segments
   */
  bushTree: (): LSystem =>
    createLSystem("Y", [
      { predecessor: "Y", successor: "YFX[+Y][-Y]" },
      { predecessor: "X", successor: "X[-FFF][+FFF]FX" },
      { predecessor: "F", successor: "FF" },
    ]),
};
