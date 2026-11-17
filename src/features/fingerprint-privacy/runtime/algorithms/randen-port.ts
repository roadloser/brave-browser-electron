export interface BraveRandenPort {
  next(): bigint;
  discard(count: number): void;
}
