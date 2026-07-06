import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { firstAuthoredLevelInput } from "../levels/first-authored-level";
import {
  assertValidLevelTimerState,
  hasLevelTimerExpired,
  makeInitialLevelTimerState,
  runtimeLevelTimerId,
  stepLevelTimerState,
} from "./level-timer-state";

function levelSpecWithTimer(frames: number) {
  const result = makeLevelSpec({
    ...firstAuthoredLevelInput,
    levelTimers: [
      {
        timerId: runtimeLevelTimerId,
        frames,
      },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected level with timer to validate.");
  }

  return result.value;
}

describe("level timer state", () => {
  it("creates an inactive level timer when no runtime timer is defined", () => {
    const result = makeLevelSpec(firstAuthoredLevelInput);

    if (!result.ok) {
      throw new Error("Expected first authored level to validate.");
    }

    expect(makeInitialLevelTimerState(result.value)).toEqual({
      remainingFrames: undefined,
    });
  });

  it("initializes and counts down an explicit frame timer", () => {
    const initialState = makeInitialLevelTimerState(levelSpecWithTimer(2));
    const firstStep = stepLevelTimerState(initialState);
    const secondStep = stepLevelTimerState(firstStep);

    expect(initialState).toEqual({ remainingFrames: 2 });
    expect(firstStep).toEqual({ remainingFrames: 1 });
    expect(secondStep).toEqual({ remainingFrames: 0 });
    expect(hasLevelTimerExpired(secondStep)).toBe(true);
  });

  it("rejects malformed timer state", () => {
    expect(() =>
      assertValidLevelTimerState({
        remainingFrames: -1,
      }),
    ).toThrow(
      "Level timer remainingFrames must be undefined or a non-negative safe integer.",
    );
  });
});
