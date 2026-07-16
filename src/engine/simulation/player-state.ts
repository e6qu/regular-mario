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
  // The jump tier (index into MovementConstants.jumpTiers) latched from the
  // horizontal speed when the current/last jump launched — SMB keeps the
  // launch forces for the whole arc.
  readonly jumpTierIndex: number;
  // True while big Mario is ducking (Down held on the ground): he can't walk
  // and his hurtbox shrinks to the ROM's 12×12 crouch box, so he ducks
  // hammers/flames. Absent/false otherwise. Derived per frame in step-simulation
  // and stamped on the player used for collision — the movement helpers that
  // rebuild the player (stomp rebound, side-knockback) intentionally drop it
  // because those leave the ground.
  readonly crouching?: boolean;
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
    // Feet at y=80 (row 5 of the default fixtures), like the previous 24px
    // collider's y=56 spawn.
    spawnPositionY: requirePixelPosition(64, "player.position.y"),
    velocityX: requireVelocity(0, "player.velocity.x"),
    velocityY: requireVelocity(0, "player.velocity.y"),
    colliderWidth: requireColliderDimensionPixels(14, "player.collider.width"),
    // ROM small Mario occupies ONE tile for terrain collision — the canonical
    // 1-2/4-2 routes crawl through 1-tile gaps that a taller box can't enter.
    colliderHeight: requireColliderDimensionPixels(
      16,
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
    jumpTierIndex: 0,
  };
}

// A co-op player spawns one tile further right than the primary per index, so
// several players line up side by side near the level entrance.
const coopPlayerSpawnGapPixels = 16;
export function makeCoopPlayerSimulationState(
  index: number,
): PlayerSimulationState {
  const base = makeInitialPlayerSimulationState();
  return {
    ...base,
    position: {
      x: requirePixelPosition(
        Number(base.position.x) + (index + 1) * coopPlayerSpawnGapPixels,
        "player.position.x",
      ),
      y: base.position.y,
    },
  };
}

// Crouch transitions resize the terrain collider like the ROM's lowered duck
// probes: entering a crouch shrinks a big player to the small one-tile box
// (feet-anchored) — which is what lets a running duck slide through the
// 1-2/4-2 one-tile crawls — and leaving it restores the vitality's box. On
// non-transition frames the collider is left untouched.
export function applyCrouchResize(
  player: PlayerSimulationState,
  crouching: boolean,
  vitality: PlayerVitalityState,
): PlayerSimulationState {
  const wasCrouching = player.crouching === true;

  if (crouching === wasCrouching) {
    return player;
  }

  if (crouching) {
    return resizePlayerForVitality(player, vitality, true);
  }

  return resizePlayerForVitality(player, vitality);
}

export function resizePlayerForVitality(
  player: PlayerSimulationState,
  vitality: PlayerVitalityState,
  // ROM ducking lowers the terrain probes to small height: a crouched big
  // player uses the small (one-tile) collider, feet-anchored, which is what
  // lets a running duck slide through the 1-2/4-2 one-tile crawls.
  crouching = false,
): PlayerSimulationState {
  const nextCollider =
    isEnlargedPlayerVitalityKind(vitality.kind) && !crouching
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
