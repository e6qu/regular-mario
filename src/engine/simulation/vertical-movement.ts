import type { FrameDurationMilliseconds } from "../domain/units";
import type { SimulationInputCommand } from "./input-command";
import type { CoyoteFrameCount, JumpBufferFrameCount } from "./movement-model";
import type { MovementConstants, MovementState } from "./movement-model";
import { VerticalMovementState } from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import {
  makeFrameDurationSeconds,
  requireSimulationVelocity,
} from "./simulation-units";

function makeVerticalMovementState(
  velocityY: number,
  previousVerticalMovement: MovementState["vertical"],
): MovementState["vertical"] {
  if (velocityY < 0) {
    return VerticalMovementState.Jumping;
  }

  if (velocityY > 0) {
    return VerticalMovementState.Falling;
  }

  return previousVerticalMovement;
}

function decrementFrameCount<T extends number>(value: T): T {
  if (value <= 0) {
    return 0 as T;
  }

  return (value - 1) as T;
}

export function applyVerticalMovement(
  player: PlayerSimulationState,
  inputCommand: SimulationInputCommand,
  frameDurationMilliseconds: FrameDurationMilliseconds,
  movementConstants: MovementConstants,
): PlayerSimulationState {
  const frameDurationSeconds = makeFrameDurationSeconds(
    frameDurationMilliseconds,
  );
  const wasGrounded =
    player.movement.vertical === VerticalMovementState.Grounded;
  const coyoteAvailable = wasGrounded || player.coyoteFramesRemaining > 0;
  const bufferedPressAvailable =
    inputCommand.jumpPressed || player.jumpBufferFramesRemaining > 0;
  // Underwater, a "stroke" fires on each fresh press (anywhere in the water), not
  // just when grounded. The jump buffer sits at its max while the button is held
  // and decays once released, so a buffer below max marks a genuine new press.
  const swimStroke =
    movementConstants.swimming &&
    inputCommand.jumpPressed &&
    player.jumpBufferFramesRemaining < movementConstants.jumpBufferFrameCount;
  const startsJump = movementConstants.swimming
    ? swimStroke
    : coyoteAvailable && bufferedPressAvailable;

  // SMB latches jump physics from |horizontal speed| at launch: the tier's
  // launch speed and gravities apply for the whole arc. With no tiers
  // (swimming) the scalar constants apply instead.
  const tiers = movementConstants.jumpTiers;
  let jumpTierIndex = player.jumpTierIndex;
  if (startsJump && tiers.length > 0) {
    const launchSpeedX = Math.abs(player.velocity.x);
    jumpTierIndex = 0;
    for (const [index, tier] of tiers.entries()) {
      if (launchSpeedX >= tier.minHorizontalSpeed) {
        jumpTierIndex = index;
      }
    }
  }
  const tier = tiers[Math.min(jumpTierIndex, tiers.length - 1)];

  const jumpLaunchSpeed =
    tier?.launchSpeed ??
    (inputCommand.runHeld
      ? movementConstants.runningJumpLaunchSpeed
      : movementConstants.jumpLaunchSpeed);

  const velocityBeforeGravity = startsJump
    ? 0 - jumpLaunchSpeed
    : player.velocity.y;

  const isRising = velocityBeforeGravity < 0;
  // Releasing the jump button while rising applies the falling gravity (the
  // ROM dumps the fall force into the main one) — that is the jump cut.
  const gravity = isRising
    ? inputCommand.jumpPressed
      ? (tier?.gravityRisingHeld ?? movementConstants.gravityRisingHeld)
      : (tier?.gravityFalling ?? movementConstants.gravityRisingReleased)
    : (tier?.gravityFalling ?? movementConstants.gravityFalling);

  let nextVelocityY = startsJump
    ? velocityBeforeGravity
    : velocityBeforeGravity + gravity * frameDurationSeconds;

  if (nextVelocityY > movementConstants.maxFallSpeed) {
    nextVelocityY = movementConstants.maxFallSpeed;
  }

  const nextCoyoteFramesRemaining: CoyoteFrameCount = startsJump
    ? (0 as CoyoteFrameCount)
    : wasGrounded
      ? movementConstants.coyoteFrameCount
      : decrementFrameCount(player.coyoteFramesRemaining);

  // A normal jump consumes the buffer. A swim stroke instead leaves the buffer
  // full while the button stays held, so holding gives a single stroke (then a
  // slow sink) rather than continuous thrust — you tap to swim upward.
  const nextJumpBufferFramesRemaining: JumpBufferFrameCount =
    startsJump && !movementConstants.swimming
      ? (0 as JumpBufferFrameCount)
      : inputCommand.jumpPressed
        ? movementConstants.jumpBufferFrameCount
        : decrementFrameCount(player.jumpBufferFramesRemaining);

  return {
    position: player.position,
    velocity: {
      x: player.velocity.x,
      y: requireSimulationVelocity(nextVelocityY, "player.velocity.y"),
    },
    collider: player.collider,
    movement: {
      horizontal: player.movement.horizontal,
      vertical: makeVerticalMovementState(
        nextVelocityY,
        player.movement.vertical,
      ),
    },
    coyoteFramesRemaining: nextCoyoteFramesRemaining,
    jumpBufferFramesRemaining: nextJumpBufferFramesRemaining,
    jumpCutApplied: false,
    jumpTierIndex,
  };
}
