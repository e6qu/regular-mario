import { ActorRole, type LevelSpec } from "../domain/level-spec";
import type { SimulationInputCommand } from "./input-command";
import {
  makeActorRoleLookup,
  playerOverlapsLevelActor,
  requireActorRole,
} from "./actor-interaction";
import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";
import type { MovementConstants } from "./movement-model";
import { playerOverlapsActorPixel } from "./player-actor-overlap";
import type { PlayerSimulationState } from "./player-state";
import { requireSimulationVelocity } from "./simulation-units";
import type { SpawnedActor } from "./interactive-block-state";

export type ClimbableMovementResolution = {
  readonly player: PlayerSimulationState;
  readonly climbing: boolean;
};

export function applyClimbableMovement(
  player: PlayerSimulationState,
  inputCommand: SimulationInputCommand,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[],
  movementConstants: MovementConstants,
): ClimbableMovementResolution {
  if (!playerOverlapsClimbable(player, levelSpec, spawnedActors)) {
    return {
      player,
      climbing: false,
    };
  }

  if (
    !inputCommand.upHeld &&
    !inputCommand.downHeld &&
    player.movement.vertical !== VerticalMovementState.Climbing
  ) {
    return {
      player,
      climbing: false,
    };
  }

  return {
    player: {
      position: player.position,
      velocity: {
        x: requireSimulationVelocity(0, "player.velocity.x"),
        y: makeClimbVelocityY(inputCommand, movementConstants),
      },
      collider: player.collider,
      movement: {
        horizontal: HorizontalMovementState.Idle,
        vertical: VerticalMovementState.Climbing,
      },
      coyoteFramesRemaining:
        0 as PlayerSimulationState["coyoteFramesRemaining"],
      jumpBufferFramesRemaining:
        0 as PlayerSimulationState["jumpBufferFramesRemaining"],
      jumpCutApplied: false,
      jumpTierIndex: player.jumpTierIndex,
    },
    climbing: true,
  };
}

function playerOverlapsClimbable(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[],
): boolean {
  const actorRoleLookup = makeActorRoleLookup(levelSpec);

  for (const actor of levelSpec.actors) {
    if (
      requireActorRole(actorRoleLookup, actor.actorId) ===
        ActorRole.Climbable &&
      playerOverlapsLevelActor(player, levelSpec, actor)
    ) {
      return true;
    }
  }

  for (const spawnedActor of spawnedActors) {
    if (
      spawnedActor.active &&
      spawnedActor.role === ActorRole.Climbable &&
      playerOverlapsActorPixel(player, spawnedActor.position, {
        width: levelSpec.tileSizePixels,
        height: levelSpec.tileSizePixels,
      })
    ) {
      return true;
    }
  }

  return false;
}

function makeClimbVelocityY(
  inputCommand: SimulationInputCommand,
  movementConstants: MovementConstants,
): PlayerSimulationState["velocity"]["y"] {
  if (inputCommand.upHeld && !inputCommand.downHeld) {
    return requireSimulationVelocity(
      0 - movementConstants.climbSpeed,
      "player.velocity.y",
    );
  }

  if (inputCommand.downHeld && !inputCommand.upHeld) {
    return movementConstants.climbSpeed;
  }

  return requireSimulationVelocity(0, "player.velocity.y");
}
