import { describe, expect, it } from "vitest";

import {
  assertValidPlayerReactionState,
  headBonkReactionFrames,
  makeEmptyPlayerReactionState,
  PlayerReactionKind,
  resolvePlayerReactionState,
} from "./player-reaction";

describe("player reaction", () => {
  it("starts empty", () => {
    expect(makeEmptyPlayerReactionState()).toEqual({
      kind: PlayerReactionKind.None,
      remainingFrames: 0,
    });
  });

  it("starts a head-bonk reaction countdown on a fresh bonk", () => {
    const result = resolvePlayerReactionState(makeEmptyPlayerReactionState(), {
      headBonked: true,
    });

    expect(result.kind).toBe(PlayerReactionKind.HeadBonk);
    expect(result.remainingFrames).toBe(headBonkReactionFrames);
  });

  it("counts the reaction down each frame with no new bonk", () => {
    const step1 = resolvePlayerReactionState(makeEmptyPlayerReactionState(), {
      headBonked: true,
    });
    const step2 = resolvePlayerReactionState(step1, { headBonked: false });

    expect(step2.kind).toBe(PlayerReactionKind.HeadBonk);
    expect(step2.remainingFrames).toBe(headBonkReactionFrames - 1);
  });

  it("clears back to none when the countdown reaches zero", () => {
    const almostDone = {
      kind: PlayerReactionKind.HeadBonk,
      remainingFrames: 1,
    };
    const cleared = resolvePlayerReactionState(almostDone, {
      headBonked: false,
    });

    expect(cleared).toEqual(makeEmptyPlayerReactionState());
  });

  it("refreshes the countdown when bonking again mid-reaction", () => {
    const midReaction = {
      kind: PlayerReactionKind.HeadBonk,
      remainingFrames: 3,
    };
    const refreshed = resolvePlayerReactionState(midReaction, {
      headBonked: true,
    });

    expect(refreshed.remainingFrames).toBe(headBonkReactionFrames);
  });

  it("validates well-formed and rejects malformed reaction state", () => {
    expect(() =>
      assertValidPlayerReactionState(makeEmptyPlayerReactionState()),
    ).not.toThrow();
    expect(() =>
      assertValidPlayerReactionState({
        kind: PlayerReactionKind.None,
        remainingFrames: 5,
      }),
    ).toThrow();
    expect(() =>
      assertValidPlayerReactionState({
        kind: PlayerReactionKind.HeadBonk,
        remainingFrames: -1,
      }),
    ).toThrow();
  });
});
