import { HorizontalInput } from "./input-command";
import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";
import { describe, expect, it } from "vitest";

import type { SimulationInputCommand } from "./input-command";
import { initialMovementConstants } from "./movement-model";
import {
  playerWithTestVelocity,
  testFrameDurationMilliseconds,
} from "./movement-test-support";
import { makeInitialPlayerSimulationState } from "./player-state";
import { applyHorizontalMovement } from "./horizontal-movement";

function inputCommand(
  horizontal: SimulationInputCommand["horizontal"],
  runHeld: boolean,
): SimulationInputCommand {
  return {
    horizontal,
    jumpPressed: false,
    runHeld,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
}

function playerWithVelocityX(velocityX: number) {
  return playerWithTestVelocity(
    {
      x: velocityX,
      y: 0,
    },
    {
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Grounded,
    },
  );
}

describe("horizontal movement", () => {
  it("accelerates right using walking acceleration", () => {
    const nextPlayer = applyHorizontalMovement(
      makeInitialPlayerSimulationState(),
      inputCommand(HorizontalInput.Right, false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.x).toBe(45.5);
    expect(nextPlayer.movement.horizontal).toBe(
      HorizontalMovementState.Walking,
    );
  });

  it("accelerates left using walking acceleration", () => {
    const nextPlayer = applyHorizontalMovement(
      makeInitialPlayerSimulationState(),
      inputCommand(HorizontalInput.Left, false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.x).toBe(-45.5);
    expect(nextPlayer.movement.horizontal).toBe(
      HorizontalMovementState.Walking,
    );
  });

  it("uses running acceleration and caps at running max speed", () => {
    const nextPlayer = applyHorizontalMovement(
      makeInitialPlayerSimulationState(),
      inputCommand(HorizontalInput.Right, true),
      testFrameDurationMilliseconds(1000),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.x).toBe(initialMovementConstants.maxRunSpeed);
    expect(nextPlayer.movement.horizontal).toBe(
      HorizontalMovementState.Running,
    );
  });

  it("caps walking speed separately from running speed", () => {
    const nextPlayer = applyHorizontalMovement(
      makeInitialPlayerSimulationState(),
      inputCommand(HorizontalInput.Right, false),
      testFrameDurationMilliseconds(1000),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.x).toBe(initialMovementConstants.maxWalkSpeed);
  });

  it("halves the running speed cap at maximum bloodiness", () => {
    const nextPlayer = applyHorizontalMovement(
      makeInitialPlayerSimulationState(),
      inputCommand(HorizontalInput.Right, true),
      testFrameDurationMilliseconds(1000),
      initialMovementConstants,
      1,
    );

    expect(nextPlayer.velocity.x).toBe(
      initialMovementConstants.maxRunSpeed * 0.5,
    );
  });

  it("does not slow the player when bloodiness is zero", () => {
    const nextPlayer = applyHorizontalMovement(
      makeInitialPlayerSimulationState(),
      inputCommand(HorizontalInput.Right, true),
      testFrameDurationMilliseconds(1000),
      initialMovementConstants,
      0,
    );

    expect(nextPlayer.velocity.x).toBe(initialMovementConstants.maxRunSpeed);
  });

  it("applies ground friction toward zero for neutral input", () => {
    const nextPlayer = applyHorizontalMovement(
      playerWithVelocityX(90),
      inputCommand(HorizontalInput.Neutral, false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.x).toBe(32);
    expect(nextPlayer.movement.horizontal).toBe(HorizontalMovementState.Idle);
  });

  it("does not mutate the previous player state", () => {
    const previousPlayer = playerWithVelocityX(90);

    applyHorizontalMovement(
      previousPlayer,
      inputCommand(HorizontalInput.Neutral, false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(previousPlayer.velocity.x).toBe(90);
  });
});
