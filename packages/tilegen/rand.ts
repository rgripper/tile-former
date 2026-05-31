import Rand from "rand-seed";

export type CustomRand = ReturnType<typeof createRand>;

export function createRand(input: string) {
  const rand = new Rand(input);
  const intBetween = ((min: number, exclusiveMax: number) =>
    Math.round(rand.next() * (exclusiveMax - 1 - min) + min)).bind(rand);
  return {
    next: () => rand.next(),
    intBetween,
    arrayIndex: (arr: unknown[]) => intBetween(0, arr.length),
  };
}
