import { describe, expect, it } from "vitest";

import {
  assertValidStompReactionState,
  makeEmptyStompReactionState,
  resolveStompReactionState,
  stompReactionFrames,
} from "./stomp-reaction";

describe("stomp reaction", () => {
  it("starts empty and inactive", () => {
    expect(makeEmptyStompReactionState()).toEqual({
      active: false,
      remainingFrames: 0,
      x: 0,
      y: 0,
    });
  });

  it("starts a burst at the stomp location", () => {
    const result = resolveStompReactionState(makeEmptyStompReactionState(), {
      stomped: true,
      x: 40,
      y: 72,
    });

    expect(result).toEqual({
      active: true,
      remainingFrames: stompReactionFrames,
      x: 40,
      y: 72,
    });
  });

  it("counts down and keeps the location while inactive input continues", () => {
    const started = resolveStompReactionState(makeEmptyStompReactionState(), {
      stomped: true,
      x: 10,
      y: 20,
    });
    const next = resolveStompReactionState(started, {
      stomped: false,
      x: 999,
      y: 999,
    });

    expect(next.remainingFrames).toBe(stompReactionFrames - 1);
    expect(next.x).toBe(10);
    expect(next.y).toBe(20);
  });

  it("clears at the end of the countdown", () => {
    const almostDone = { active: true, remainingFrames: 1, x: 5, y: 6 };
    expect(
      resolveStompReactionState(almostDone, { stomped: false, x: 0, y: 0 }),
    ).toEqual(makeEmptyStompReactionState());
  });

  it("validates well-formed and rejects malformed state", () => {
    expect(() =>
      assertValidStompReactionState(makeEmptyStompReactionState()),
    ).not.toThrow();
    expect(() =>
      assertValidStompReactionState({
        active: false,
        remainingFrames: 3,
        x: 0,
        y: 0,
      }),
    ).toThrow();
  });
});
