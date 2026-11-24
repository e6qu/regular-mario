import { describe, expect, it } from "vitest";

import { talkShufflePlaces, talkShuffleStepMilliseconds } from "./talk-shuffle";

const step = talkShuffleStepMilliseconds;
// the order, by prop, once a step's move has finished
const settled = (stepIndex: number): readonly number[] =>
  talkShufflePlaces(3, stepIndex * step + step * 0.9).map(
    (place) => place.slot,
  );

describe("talk shuffle", () => {
  it("starts in order, on the ground", () => {
    expect(talkShufflePlaces(3, 0)).toEqual([
      { slot: 0, lift: 0 },
      { slot: 1, lift: 0 },
      { slot: 2, lift: 0 },
    ]);
  });

  it("hops the left prop over its neighbour, which slides under", () => {
    const [first, second, third] = talkShufflePlaces(3, step * 0.25);
    expect(first?.slot).toBeCloseTo(0.5);
    expect(first?.lift).toBeCloseTo(1);
    expect(second).toEqual({ slot: 0.5, lift: 0 });
    expect(third).toEqual({ slot: 2, lift: 0 });
  });

  it("alternates pairs, visits every order, and comes back after six steps", () => {
    const orders = [0, 1, 2, 3, 4, 5].map((index) => settled(index).join());
    expect(new Set(orders).size).toBe(6);
    expect(orders[0]).toBe("1,0,2");
    expect(orders[1]).toBe("2,0,1");
    expect(settled(6)).toEqual(settled(0));
    expect(talkShufflePlaces(3, 6 * step)).toEqual(talkShufflePlaces(3, 0));
  });

  it("leaves a single prop alone", () => {
    expect(talkShufflePlaces(1, 500)).toEqual([{ slot: 0, lift: 0 }]);
  });
});
