import { describe, expect, it } from "vitest";
import { HorizontalInput } from "./input-command";
import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";

import type { SimulationInputCommand } from "./input-command";
import {
  initialMovementConstants,
  swimmingMovementConstants,
} from "./movement-model";
import {
  playerWithTestVelocity,
  testFrameDurationMilliseconds,
} from "./movement-test-support";
import { makeInitialPlayerSimulationState } from "./player-state";
import type { PlayerSimulationState } from "./player-state";
import { applyVerticalMovement } from "./vertical-movement";

function inputCommand(jumpPressed: boolean): SimulationInputCommand {
  return {
    horizontal: HorizontalInput.Neutral,
    jumpPressed,
    runHeld: false,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
}

function applyAirborneVerticalMovement(
  overrides: Partial<
    Pick<
      PlayerSimulationState,
      "coyoteFramesRemaining" | "jumpBufferFramesRemaining"
    >
  >,
  jumpPressed: boolean,
): PlayerSimulationState {
  return applyVerticalMovement(
    {
      ...playerWithVerticalVelocity(100, VerticalMovementState.Falling),
      ...overrides,
    },
    inputCommand(jumpPressed),
    testFrameDurationMilliseconds(100),
    initialMovementConstants,
  );
}

function playerWithVerticalVelocity(
  velocityY: number,
  verticalMovement: PlayerSimulationState["movement"]["vertical"],
): PlayerSimulationState {
  return playerWithTestVelocity(
    {
      x: 0,
      y: velocityY,
    },
    {
      horizontal: HorizontalMovementState.Idle,
      vertical: verticalMovement,
    },
  );
}

describe("vertical movement", () => {
  it("launches a jump from grounded state", () => {
    const nextPlayer = applyVerticalMovement(
      makeInitialPlayerSimulationState(),
      inputCommand(true),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.y).toBe(
      0 - initialMovementConstants.jumpLaunchSpeed,
    );
    expect(nextPlayer.movement.vertical).toBe(VerticalMovementState.Jumping);
  });

  it("does not relaunch while already jumping", () => {
    const nextPlayer = applyVerticalMovement(
      playerWithVerticalVelocity(-200, VerticalMovementState.Jumping),
      inputCommand(true),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.y).toBe(-143.7);
    expect(nextPlayer.movement.vertical).toBe(VerticalMovementState.Jumping);
  });

  it("applies gravity while falling", () => {
    const nextPlayer = applyVerticalMovement(
      playerWithVerticalVelocity(100, VerticalMovementState.Falling),
      inputCommand(false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.y).toBe(240);
    expect(nextPlayer.movement.vertical).toBe(VerticalMovementState.Falling);
  });

  it("preserves airborne state at zero vertical velocity before collision", () => {
    const nextPlayer = applyVerticalMovement(
      playerWithVerticalVelocity(-200, VerticalMovementState.Jumping),
      inputCommand(false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.y).toBe(0);
    expect(nextPlayer.movement.vertical).toBe(VerticalMovementState.Jumping);
  });

  it("does not mutate the previous player state", () => {
    const previousPlayer = playerWithVerticalVelocity(
      100,
      VerticalMovementState.Falling,
    );

    applyVerticalMovement(
      previousPlayer,
      inputCommand(false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(previousPlayer.velocity.y).toBe(100);
    expect(previousPlayer.movement.vertical).toBe(
      VerticalMovementState.Falling,
    );
  });

  it("launches a jump within the coyote window after leaving the ground", () => {
    const nextPlayer = applyAirborneVerticalMovement(
      {
        coyoteFramesRemaining:
          3 as PlayerSimulationState["coyoteFramesRemaining"],
      },
      true,
    );

    expect(nextPlayer.velocity.y).toBe(
      0 - initialMovementConstants.jumpLaunchSpeed,
    );
    expect(nextPlayer.movement.vertical).toBe(VerticalMovementState.Jumping);
    expect(nextPlayer.coyoteFramesRemaining).toBe(0);
  });

  it("does not launch a jump after the coyote window expires", () => {
    const nextPlayer = applyAirborneVerticalMovement(
      {
        coyoteFramesRemaining:
          0 as PlayerSimulationState["coyoteFramesRemaining"],
      },
      true,
    );

    expect(nextPlayer.velocity.y).toBeGreaterThan(100);
    expect(nextPlayer.movement.vertical).toBe(VerticalMovementState.Falling);
  });

  it("decrements the remaining coyote window each airborne frame", () => {
    const nextPlayer = applyAirborneVerticalMovement(
      {
        coyoteFramesRemaining:
          2 as PlayerSimulationState["coyoteFramesRemaining"],
      },
      false,
    );

    expect(nextPlayer.coyoteFramesRemaining).toBe(1);
  });

  it("resets the coyote window while grounded", () => {
    const nextPlayer = applyVerticalMovement(
      makeInitialPlayerSimulationState(),
      inputCommand(false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.coyoteFramesRemaining).toBe(
      initialMovementConstants.coyoteFrameCount,
    );
  });

  it("fills the jump buffer while airborne and pressing jump", () => {
    const nextPlayer = applyAirborneVerticalMovement(
      {
        coyoteFramesRemaining:
          0 as PlayerSimulationState["coyoteFramesRemaining"],
      },
      true,
    );

    expect(nextPlayer.jumpBufferFramesRemaining).toBe(
      initialMovementConstants.jumpBufferFrameCount,
    );
    expect(nextPlayer.movement.vertical).toBe(VerticalMovementState.Falling);
  });

  it("launches a buffered jump on landing within the buffer window", () => {
    const groundedPlayerWithBuffer: PlayerSimulationState = {
      ...makeInitialPlayerSimulationState(),
      jumpBufferFramesRemaining:
        2 as PlayerSimulationState["jumpBufferFramesRemaining"],
    };

    const nextPlayer = applyVerticalMovement(
      groundedPlayerWithBuffer,
      inputCommand(false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.y).toBe(
      0 - initialMovementConstants.jumpLaunchSpeed,
    );
    expect(nextPlayer.movement.vertical).toBe(VerticalMovementState.Jumping);
    expect(nextPlayer.jumpBufferFramesRemaining).toBe(0);
  });

  it("decrements the jump buffer while airborne without pressing jump", () => {
    const airbornePlayer: PlayerSimulationState = {
      ...playerWithVerticalVelocity(100, VerticalMovementState.Falling),
      jumpBufferFramesRemaining:
        3 as PlayerSimulationState["jumpBufferFramesRemaining"],
    };

    const nextPlayer = applyVerticalMovement(
      airbornePlayer,
      inputCommand(false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.jumpBufferFramesRemaining).toBe(2);
  });

  it("applies lighter gravity when ascending with jump held", () => {
    const ascendingPlayer = playerWithVerticalVelocity(
      -300,
      VerticalMovementState.Jumping,
    );
    const heldPlayer = applyVerticalMovement(
      ascendingPlayer,
      inputCommand(true),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );
    const releasedPlayer = applyVerticalMovement(
      ascendingPlayer,
      inputCommand(false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(releasedPlayer.velocity.y).toBeGreaterThan(heldPlayer.velocity.y);
  });

  it("caps fall speed at the authored maximum", () => {
    const fastFallingPlayer: PlayerSimulationState = {
      ...playerWithVerticalVelocity(500, VerticalMovementState.Falling),
    };

    const nextPlayer = applyVerticalMovement(
      fastFallingPlayer,
      inputCommand(false),
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.y).toBeLessThanOrEqual(
      initialMovementConstants.maxFallSpeed,
    );
  });

  it("uses running jump launch speed when run is held", () => {
    const runningJumpInput = {
      horizontal: HorizontalInput.Neutral as const,
      jumpPressed: true,
      runHeld: true,
      firePressed: false,
      upHeld: false,
      downHeld: false,
    };

    const nextPlayer = applyVerticalMovement(
      makeInitialPlayerSimulationState(),
      runningJumpInput,
      testFrameDurationMilliseconds(100),
      initialMovementConstants,
    );

    expect(nextPlayer.velocity.y).toBe(
      0 - initialMovementConstants.runningJumpLaunchSpeed,
    );
  });
});

describe("swimming (underwater) vertical movement", () => {
  it("strokes upward on a fresh press", () => {
    const next = applyVerticalMovement(
      {
        ...playerWithVerticalVelocity(50, VerticalMovementState.Falling),
        jumpBufferFramesRemaining:
          0 as PlayerSimulationState["jumpBufferFramesRemaining"],
      },
      inputCommand(true),
      testFrameDurationMilliseconds(100),
      swimmingMovementConstants,
    );
    // A stroke sets the upward launch speed (150 px/s).
    expect(next.velocity.y).toBeCloseTo(-150, 0);
  });

  it("does not re-stroke while the button stays held (buffer at max)", () => {
    const next = applyVerticalMovement(
      {
        ...playerWithVerticalVelocity(-150, VerticalMovementState.Jumping),
        jumpBufferFramesRemaining:
          swimmingMovementConstants.jumpBufferFrameCount,
      },
      inputCommand(true),
      testFrameDurationMilliseconds(100),
      swimmingMovementConstants,
    );
    // No new stroke: the rise decays under buoyant gravity instead of resetting.
    expect(next.velocity.y).toBeGreaterThan(-150);
  });

  it("sinks slowly, capped at the low swim terminal speed", () => {
    const next = applyVerticalMovement(
      {
        ...playerWithVerticalVelocity(300, VerticalMovementState.Falling),
        jumpBufferFramesRemaining:
          0 as PlayerSimulationState["jumpBufferFramesRemaining"],
      },
      inputCommand(false),
      testFrameDurationMilliseconds(100),
      swimmingMovementConstants,
    );
    expect(next.velocity.y).toBeGreaterThan(0);
    expect(next.velocity.y).toBeLessThanOrEqual(105);
  });
});
