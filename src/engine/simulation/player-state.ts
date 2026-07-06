import type {
  ColliderDimensionPixels,
  PixelPosition,
  VelocityPixelsPerSecond,
} from "../domain/units";
import {
  makePixelPosition,
  makeVelocityPixelsPerSecond,
  requireColliderDimensionPixels,
} from "../domain/units";
import { makeInitialMovementState, type MovementState } from "./movement-model";
import type { CoyoteFrameCount, JumpBufferFrameCount } from "./movement-model";
import {
  isEnlargedPlayerVitalityKind,
  type PlayerVitalityState,
} from "./player-vitality";

export type PlayerSimulationState = {
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
    readonly y: VelocityPixelsPerSecond;
  };
  readonly collider: {
    readonly width: ColliderDimensionPixels;
    readonly height: ColliderDimensionPixels;
  };
  readonly movement: MovementState;
  readonly coyoteFramesRemaining: CoyoteFrameCount;
  readonly jumpBufferFramesRemaining: JumpBufferFrameCount;
  readonly jumpCutApplied: boolean;
};

export type InitialPlayerSimulationStateConfig = {
  readonly spawnPositionX: PixelPosition;
  readonly spawnPositionY: PixelPosition;
  readonly velocityX: VelocityPixelsPerSecond;
  readonly velocityY: VelocityPixelsPerSecond;
  readonly colliderWidth: ColliderDimensionPixels;
  readonly colliderHeight: ColliderDimensionPixels;
};

function requirePixelPosition(value: number, path: string): PixelPosition {
  const result = makePixelPosition(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid pixel position.`);
  }

  return result.value;
}

function requireVelocity(value: number, path: string): VelocityPixelsPerSecond {
  const result = makeVelocityPixelsPerSecond(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid velocity.`);
  }

  return result.value;
}

export const initialPlayerSimulationStateConfig: InitialPlayerSimulationStateConfig =
  {
    spawnPositionX: requirePixelPosition(16, "player.position.x"),
    spawnPositionY: requirePixelPosition(56, "player.position.y"),
    velocityX: requireVelocity(0, "player.velocity.x"),
    velocityY: requireVelocity(0, "player.velocity.y"),
    colliderWidth: requireColliderDimensionPixels(14, "player.collider.width"),
    colliderHeight: requireColliderDimensionPixels(
      24,
      "player.collider.height",
    ),
  };

export const smallPlayerColliderDimensions = {
  width: initialPlayerSimulationStateConfig.colliderWidth,
  height: initialPlayerSimulationStateConfig.colliderHeight,
} as const;

export const poweredPlayerColliderDimensions = {
  width: requireColliderDimensionPixels(14, "player.poweredCollider.width"),
  height: requireColliderDimensionPixels(32, "player.poweredCollider.height"),
} as const;

export function makeInitialPlayerSimulationState(): PlayerSimulationState {
  return {
    position: {
      x: initialPlayerSimulationStateConfig.spawnPositionX,
      y: initialPlayerSimulationStateConfig.spawnPositionY,
    },
    velocity: {
      x: initialPlayerSimulationStateConfig.velocityX,
      y: initialPlayerSimulationStateConfig.velocityY,
    },
    collider: {
      width: initialPlayerSimulationStateConfig.colliderWidth,
      height: initialPlayerSimulationStateConfig.colliderHeight,
    },
    movement: makeInitialMovementState(),
    coyoteFramesRemaining: 0 as CoyoteFrameCount,
    jumpBufferFramesRemaining: 0 as JumpBufferFrameCount,
    jumpCutApplied: false,
  };
}

export function resizePlayerForVitality(
  player: PlayerSimulationState,
  vitality: PlayerVitalityState,
): PlayerSimulationState {
  const nextCollider = isEnlargedPlayerVitalityKind(vitality.kind)
    ? poweredPlayerColliderDimensions
    : smallPlayerColliderDimensions;

  if (
    player.collider.width === nextCollider.width &&
    player.collider.height === nextCollider.height
  ) {
    return player;
  }

  const currentBottom = player.position.y + player.collider.height;

  return {
    ...player,
    position: {
      x: player.position.x,
      y: requirePixelPosition(
        currentBottom - nextCollider.height,
        "player.position.y",
      ),
    },
    collider: nextCollider,
  };
}
