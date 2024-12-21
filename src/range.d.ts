type Infinity = number;
declare var Iterator: {
  new (): Iterator<never, void, void>;
  prototype: Iterator<never, void, void>;
  range(
    start: number,
    end: number,
    option?: number | NumericRangeOptions<number>
  ): IteratorObject<number, BuiltinIteratorReturn, unknown>;
};
interface NumericRangeOptions<T extends bigint | number> {
  step?: T;
  inclusive?: boolean;
}
