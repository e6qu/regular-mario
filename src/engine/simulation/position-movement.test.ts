import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";
import { describe, expect, it } from "vitest";

import {
  playerWithTestVelocity,
  testFrameDurationMilliseconds,
} from "./movement-test-support";
import { makeInitialPlayerSimulationState } from "./player-state";
import { applyPositionMovement } from "./position-movement";

describe("position movement", () => {
  it("integrates x and y positions from typed velocity and frame duration", () => {
    const nextPlayer = applyPositionMovement(
      playerWithTestVelocity(
        {
          x: 90,
          y: 120,
        },
        {
          horizontal: HorizontalMovementState.Walking,
          vertical: VerticalMovementState.Falling,
        },
      ),
      testFrameDurationMilliseconds(100),
    );

    expect(nextPlayer.position).toEqual({
      x: 25,
      y: 68,
    });
  });

  it("supports negative velocity without collision fallback", () => {
    const nextPlayer = applyPositionMovement(
      playerWithTestVelocity(
        {
          x: -30,
          y: -40,
        },
        {
          horizontal: HorizontalMovementState.Walking,
          vertical: VerticalMovementState.Jumping,
        },
      ),
      testFrameDurationMilliseconds(100),
    );

    expect(nextPlayer.position).toEqual({
      x: 13,
      y: 52,
    });
  });

  it("does not mutate the previous player state", () => {
    const previousPlayer = makeInitialPlayerSimulationState();

    applyPositionMovement(previousPlayer, testFrameDurationMilliseconds(100));

    expect(previousPlayer.position).toEqual({
      x: 16,
      y: 56,
    });
  });
});
