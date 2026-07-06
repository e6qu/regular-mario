import type { FrameDurationMilliseconds } from "../domain/units";
import { HorizontalInput } from "./input-command";
import type { SimulationInputCommand } from "./input-command";
import type { MovementConstants, MovementState } from "./movement-model";
import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import {
  makeFrameDurationSeconds,
  requireSimulationVelocity,
} from "./simulation-units";

function clampVelocityMagnitude(
  velocity: number,
  maximumSpeed: number,
): number {
  if (velocity > maximumSpeed) {
    return maximumSpeed;
  }

  if (velocity < -maximumSpeed) {
    return -maximumSpeed;
  }

  return velocity;
}

function moveVelocityTowardZero(velocity: number, speedDelta: number): number {
  if (velocity > 0) {
    return Math.max(0, velocity - speedDelta);
  }

  if (velocity < 0) {
    return Math.min(0, velocity + speedDelta);
  }

  return velocity;
}

function makeHorizontalMovementState(
  inputCommand: SimulationInputCommand,
): MovementState["horizontal"] {
  if (inputCommand.horizontal === HorizontalInput.Neutral) {
    return HorizontalMovementState.Idle;
  }

  if (inputCommand.runHeld) {
    return HorizontalMovementState.Running;
  }

  return HorizontalMovementState.Walking;
}

export function applyHorizontalMovement(
  player: PlayerSimulationState,
  inputCommand: SimulationInputCommand,
  frameDurationMilliseconds: FrameDurationMilliseconds,
  movementConstants: MovementConstants,
  // Head-bonk bloodiness in [0, 1] slows the player up to 50% (shabby mode).
  bloodiness = 0,
): PlayerSimulationState {
  const frameDurationSeconds = makeFrameDurationSeconds(
    frameDurationMilliseconds,
  );
  const acceleration = inputCommand.runHeld
    ? movementConstants.runAcceleration
    : movementConstants.walkAcceleration;
  const speedPenaltyFactor = 1 - 0.5 * Math.max(0, Math.min(1, bloodiness));
  const maximumSpeed =
    (inputCommand.runHeld
      ? movementConstants.maxRunSpeed
      : movementConstants.maxWalkSpeed) * speedPenaltyFactor;

  let nextVelocityX: number = player.velocity.x;

  if (inputCommand.horizontal === HorizontalInput.Left) {
    nextVelocityX = clampVelocityMagnitude(
      nextVelocityX - acceleration * frameDurationSeconds,
      maximumSpeed,
    );
  }

  if (inputCommand.horizontal === HorizontalInput.Right) {
    nextVelocityX = clampVelocityMagnitude(
      nextVelocityX + acceleration * frameDurationSeconds,
      maximumSpeed,
    );
  }

  const isAirborne =
    player.movement.vertical === VerticalMovementState.Jumping ||
    player.movement.vertical === VerticalMovementState.Falling;

  if (inputCommand.horizontal === HorizontalInput.Neutral) {
    const friction = isAirborne
      ? movementConstants.airFriction
      : movementConstants.groundFriction;
    nextVelocityX = moveVelocityTowardZero(
      nextVelocityX,
      friction * frameDurationSeconds,
    );
  }

  return {
    position: player.position,
    velocity: {
      x: requireSimulationVelocity(nextVelocityX, "player.velocity.x"),
      y: player.velocity.y,
    },
    collider: player.collider,
    movement: {
      horizontal: makeHorizontalMovementState(inputCommand),
      vertical: player.movement.vertical,
    },
    coyoteFramesRemaining: player.coyoteFramesRemaining,
    jumpBufferFramesRemaining: player.jumpBufferFramesRemaining,
    jumpCutApplied: player.jumpCutApplied,
  };
}
