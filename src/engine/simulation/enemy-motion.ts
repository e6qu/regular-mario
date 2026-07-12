import type { EntityId } from "../domain/identifiers";
import { ActorRole } from "../domain/level-spec";
import type { LevelSpec } from "../domain/level-spec";
import type {
  FrameDurationMilliseconds,
  FrameIndex,
  PixelPosition,
  VelocityPixelsPerSecond,
} from "../domain/units";
import { makePixelPosition } from "../domain/units";
import {
  assertValidActorRoleEntityIdArray,
  isEnemyRole,
} from "./actor-interaction";
import type { EnemyInteractionState } from "./enemy-interaction";
import type { MovementConstants } from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import {
  makeFrameDurationSeconds,
  requireSimulationVelocity,
} from "./simulation-units";
import { makeSolidTileIds, tileIsSolid } from "./tile-collision-support";

export enum EnemyPatrolDirection {
  Left = "left",
  Right = "right",
}

export enum ChasingEnemyBehavior {
  Patrol = "patrol",
  Chase = "chase",
}

export enum ArmoredEnemyBehavior {
  // Airborne with wings (Paratroopa): a stomp drops the wings, demoting the
  // enemy to a regular walking koopa (Active).
  Winged = "winged",
  Active = "active",
  Shell = "shell",
}

export type EnemyPatrolActorState = {
  readonly entityId: EntityId;
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
    // Vertical velocity so ground walkers (Goombas) fall off ledges like the
    // original instead of turning around at edges.
    readonly y: VelocityPixelsPerSecond;
  };
  readonly direction: EnemyPatrolDirection;
};

export type FlyingEnemyActorState = {
  readonly entityId: EntityId;
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
  };
  readonly baseY: PixelPosition;
  readonly phase: number;
};

export type ChasingEnemyActorState = {
  readonly entityId: EntityId;
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
  };
  readonly direction: EnemyPatrolDirection;
  readonly behavior: ChasingEnemyBehavior;
};

export type ArmoredEnemyActorState = {
  readonly entityId: EntityId;
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
    // Vertical velocity so a walking koopa and its sliding shell fall off
    // ledges like the original.
    readonly y: VelocityPixelsPerSecond;
  };
  readonly hitPoints: number;
  readonly behavior: ArmoredEnemyBehavior;
  // Frames the shell has sat still. A resting shell wakes back into a walking
  // koopa once this reaches `shellReviveFrames` (0 while walking or sliding).
  readonly restingFrames: number;
  // The spawn altitude a winged (Paratroopa) actor oscillates around; unused
  // once the wings are dropped.
  readonly flightBaseY: PixelPosition;
};

export type ThrowingEnemyActorState = {
  readonly entityId: EntityId;
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
  };
  // The spawn column the Hammer Bro shimmies around (it paces a short window
  // left/right of here while throwing). `originX` is absent on legacy states,
  // in which case the shimmy anchors to the current x on the first step.
  readonly originX?: PixelPosition;
};

export type AerialThrowingEnemyActorState = {
  readonly entityId: EntityId;
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
  };
};

// A stationary carnivorous plant that rises out of a pipe and retreats on a
// timer. `baseY` is its retracted rest position (at the pipe mouth); `phase`
// counts frames through the emerge/pause/retreat/pause cycle.
type PiranhaPlantActorState = {
  readonly entityId: EntityId;
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
  };
  readonly baseY: PixelPosition;
  readonly phase: number;
};

export type EnemyMotionState = {
  readonly activeEnemyEntityIds: readonly EntityId[];
  readonly patrolActors: readonly EnemyPatrolActorState[];
  readonly flyingActors: readonly FlyingEnemyActorState[];
  readonly chasingActors: readonly ChasingEnemyActorState[];
  readonly armoredActors: readonly ArmoredEnemyActorState[];
  readonly throwingActors: readonly ThrowingEnemyActorState[];
  readonly aerialThrowingActors: readonly AerialThrowingEnemyActorState[];
  readonly piranhaPlantActors: readonly PiranhaPlantActorState[];
};

export type EnemyActorRuntimeState = {
  readonly entityId: EntityId;
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
  };
};

type EnemyMotionObstacleCheck = {
  readonly blocked: boolean;
  readonly nextDirection: EnemyPatrolDirection;
};

export function makeInitialEnemyMotionState(
  levelSpec: LevelSpec,
  movementConstants: MovementConstants,
): EnemyMotionState {
  const patrolActors: EnemyPatrolActorState[] = [];
  const flyingActors: FlyingEnemyActorState[] = [];
  const chasingActors: ChasingEnemyActorState[] = [];
  const armoredActors: ArmoredEnemyActorState[] = [];
  const throwingActors: ThrowingEnemyActorState[] = [];
  const aerialThrowingActors: AerialThrowingEnemyActorState[] = [];
  const piranhaPlantActors: PiranhaPlantActorState[] = [];

  for (const actor of levelSpec.actors) {
    const role = findActorRole(levelSpec, actor.actorId);
    const direction = makeInitialEnemyPatrolDirection();
    const baseX = requireEnemyPixelPosition(
      actor.position.x * levelSpec.tileSizePixels,
      "enemyMotion.position.x",
    );
    const baseY = requireEnemyPixelPosition(
      actor.position.y * levelSpec.tileSizePixels,
      "enemyMotion.position.y",
    );
    const position = {
      x: baseX,
      y: baseY,
    };

    switch (role) {
      case ActorRole.Enemy: {
        const patrolSpeed = resolveEnemyPatrolSpeed(
          levelSpec,
          actor.entityId,
          movementConstants.enemyPatrolSpeed,
        );

        patrolActors.push({
          entityId: actor.entityId,
          position,
          velocity: {
            x: makeEnemyPatrolVelocity(patrolSpeed, direction),
            y: zeroEnemyVerticalVelocity,
          },
          direction,
        });
        break;
      }
      case ActorRole.FlyingEnemy: {
        flyingActors.push({
          entityId: actor.entityId,
          position,
          velocity: {
            x: makeEnemyPatrolVelocity(
              movementConstants.flyingEnemyPatrolSpeed,
              direction,
            ),
          },
          baseY,
          phase: 0,
        });
        break;
      }
      case ActorRole.ChasingEnemy: {
        chasingActors.push({
          entityId: actor.entityId,
          position,
          velocity: {
            x: makeEnemyPatrolVelocity(
              movementConstants.enemyPatrolSpeed,
              direction,
            ),
          },
          direction,
          behavior: ChasingEnemyBehavior.Patrol,
        });
        break;
      }
      case ActorRole.ArmoredEnemy: {
        const wingedFlight = findWingedFlightPattern(levelSpec, actor.actorId);
        armoredActors.push({
          entityId: actor.entityId,
          position,
          velocity: {
            x: makeEnemyPatrolVelocity(
              wingedFlight === "vertical"
                ? requireEnemyVelocity(0, "enemyMotion.wingedVelocity.x")
                : movementConstants.enemyPatrolSpeed,
              direction,
            ),
            y: zeroEnemyVerticalVelocity,
          },
          hitPoints: 2,
          behavior:
            wingedFlight === undefined
              ? ArmoredEnemyBehavior.Active
              : ArmoredEnemyBehavior.Winged,
          restingFrames: 0,
          flightBaseY: baseY,
        });
        break;
      }
      case ActorRole.ThrowingEnemy: {
        throwingActors.push({
          entityId: actor.entityId,
          position,
          velocity: {
            x: requireEnemyVelocity(
              0,
              "enemyMotion.throwingActors[].velocity.x",
            ),
          },
          originX: position.x,
        });
        break;
      }
      case ActorRole.AerialThrowingEnemy: {
        aerialThrowingActors.push({
          entityId: actor.entityId,
          position,
          velocity: {
            x: requireEnemyVelocity(
              0,
              "enemyMotion.aerialThrowingActors[].velocity.x",
            ),
          },
        });
        break;
      }
      case ActorRole.PiranhaPlant: {
        piranhaPlantActors.push({
          entityId: actor.entityId,
          position,
          velocity: {
            x: requireEnemyVelocity(
              0,
              "enemyMotion.piranhaPlantActors[].velocity.x",
            ),
          },
          baseY,
          phase: 0,
        });
        break;
      }
      default:
        break;
    }
  }

  return {
    activeEnemyEntityIds: [],
    patrolActors,
    flyingActors,
    chasingActors,
    armoredActors,
    throwingActors,
    aerialThrowingActors,
    piranhaPlantActors,
  };
}

export function assertValidEnemyMotionState(
  enemyMotion: unknown,
  levelSpec: LevelSpec,
): asserts enemyMotion is EnemyMotionState {
  if (typeof enemyMotion !== "object" || enemyMotion === null) {
    throw new Error("Enemy motion state must be an object.");
  }

  const candidate = enemyMotion as Readonly<Record<string, unknown>>;

  if (!Array.isArray(candidate.activeEnemyEntityIds)) {
    throw new Error("Active enemy entity ids must be an array.");
  }

  if (!Array.isArray(candidate.patrolActors)) {
    throw new Error("Enemy patrol actors must be an array.");
  }

  if (!Array.isArray(candidate.flyingActors)) {
    throw new Error("Enemy flying actors must be an array.");
  }

  if (!Array.isArray(candidate.chasingActors)) {
    throw new Error("Enemy chasing actors must be an array.");
  }

  if (!Array.isArray(candidate.armoredActors)) {
    throw new Error("Enemy armored actors must be an array.");
  }

  if (!Array.isArray(candidate.throwingActors)) {
    throw new Error("Enemy throwing actors must be an array.");
  }

  if (!Array.isArray(candidate.aerialThrowingActors)) {
    throw new Error("Enemy aerial throwing actors must be an array.");
  }

  if (!Array.isArray(candidate.piranhaPlantActors)) {
    throw new Error("Enemy piranha plant actors must be an array.");
  }

  const activeEnemyEntityIds = candidate.activeEnemyEntityIds;
  const patrolActors = candidate.patrolActors as readonly unknown[];
  const flyingActors = candidate.flyingActors as readonly unknown[];
  const chasingActors = candidate.chasingActors as readonly unknown[];
  const armoredActors = candidate.armoredActors as readonly unknown[];
  const throwingActors = candidate.throwingActors as readonly unknown[];
  const aerialThrowingActors =
    candidate.aerialThrowingActors as readonly unknown[];
  const piranhaPlantActors = candidate.piranhaPlantActors as readonly unknown[];
  const allEnemyEntityIds = collectEnemyEntityIds(levelSpec);

  assertValidActiveEnemyEntityIds(activeEnemyEntityIds, allEnemyEntityIds);

  assertValidActorRoleEntityIdArray(
    patrolActors.map((actor) => extractEntityId(actor)),
    levelSpec,
    ActorRole.Enemy,
    "Enemy patrol actor entity id",
    "enemyMotion.patrolActors",
  );
  assertValidActorRoleEntityIdArray(
    flyingActors.map((actor) => extractEntityId(actor)),
    levelSpec,
    ActorRole.FlyingEnemy,
    "Enemy flying actor entity id",
    "enemyMotion.flyingActors",
  );
  assertValidActorRoleEntityIdArray(
    chasingActors.map((actor) => extractEntityId(actor)),
    levelSpec,
    ActorRole.ChasingEnemy,
    "Enemy chasing actor entity id",
    "enemyMotion.chasingActors",
  );
  assertValidActorRoleEntityIdArray(
    armoredActors.map((actor) => extractEntityId(actor)),
    levelSpec,
    ActorRole.ArmoredEnemy,
    "Enemy armored actor entity id",
    "enemyMotion.armoredActors",
  );
  assertValidActorRoleEntityIdArray(
    throwingActors.map((actor) => extractEntityId(actor)),
    levelSpec,
    ActorRole.ThrowingEnemy,
    "Enemy throwing actor entity id",
    "enemyMotion.throwingActors",
  );
  assertValidActorRoleEntityIdArray(
    aerialThrowingActors.map((actor) => extractEntityId(actor)),
    levelSpec,
    ActorRole.AerialThrowingEnemy,
    "Enemy aerial throwing actor entity id",
    "enemyMotion.aerialThrowingActors",
  );
  assertValidActorRoleEntityIdArray(
    piranhaPlantActors.map((actor) => extractEntityId(actor)),
    levelSpec,
    ActorRole.PiranhaPlant,
    "Enemy piranha plant actor entity id",
    "enemyMotion.piranhaPlantActors",
  );
  assertEnemyActorCoverage(
    [
      ...patrolActors,
      ...flyingActors,
      ...chasingActors,
      ...armoredActors,
      ...throwingActors,
      ...aerialThrowingActors,
      ...piranhaPlantActors,
    ],
    allEnemyEntityIds,
  );
  assertNoDuplicateEnemyEntityIdsAcrossArrays([
    ...patrolActors,
    ...flyingActors,
    ...chasingActors,
    ...armoredActors,
    ...throwingActors,
    ...aerialThrowingActors,
    ...piranhaPlantActors,
  ]);

  for (const [index, patrolActor] of patrolActors.entries()) {
    assertValidEnemyPatrolActorState(patrolActor, index);
  }

  for (const [index, flyingActor] of flyingActors.entries()) {
    assertValidFlyingEnemyActorState(flyingActor, index);
  }

  for (const [index, chasingActor] of chasingActors.entries()) {
    assertValidChasingEnemyActorState(chasingActor, index);
  }

  for (const [index, armoredActor] of armoredActors.entries()) {
    assertValidArmoredEnemyActorState(armoredActor, index);
  }

  for (const [index, throwingActor] of throwingActors.entries()) {
    assertValidThrowingEnemyActorState(throwingActor, index);
  }

  for (const [index, aerialThrowingActor] of aerialThrowingActors.entries()) {
    assertValidAerialThrowingEnemyActorState(aerialThrowingActor, index);
  }

  for (const [index, piranhaPlantActor] of piranhaPlantActors.entries()) {
    assertValidPiranhaPlantActorState(piranhaPlantActor, index);
  }
}

function assertValidPiranhaPlantActorState(
  piranhaPlantActor: unknown,
  index: number,
): asserts piranhaPlantActor is PiranhaPlantActorState {
  if (typeof piranhaPlantActor !== "object" || piranhaPlantActor === null) {
    throw new Error(
      `Enemy piranha plant actor at index ${index} must be an object.`,
    );
  }

  const candidate = piranhaPlantActor as Readonly<Record<string, unknown>>;

  if (typeof candidate.position !== "object" || candidate.position === null) {
    throw new Error(
      `Enemy piranha plant actor at index ${index} must have a position object.`,
    );
  }

  if (typeof candidate.velocity !== "object" || candidate.velocity === null) {
    throw new Error(
      `Enemy piranha plant actor at index ${index} must have a velocity object.`,
    );
  }

  const position = candidate.position as Readonly<Record<string, unknown>>;
  const velocity = candidate.velocity as Readonly<Record<string, unknown>>;

  requireEnemyPixelPosition(
    position.x,
    `enemyMotion.piranhaPlantActors[${index}].position.x`,
  );
  requireEnemyPixelPosition(
    position.y,
    `enemyMotion.piranhaPlantActors[${index}].position.y`,
  );
  requireEnemyVelocity(
    velocity.x,
    `enemyMotion.piranhaPlantActors[${index}].velocity.x`,
  );
  requireEnemyPixelPosition(
    candidate.baseY,
    `enemyMotion.piranhaPlantActors[${index}].baseY`,
  );

  if (typeof candidate.phase !== "number") {
    throw new Error(
      `Enemy piranha plant actor at index ${index} must have a numeric phase.`,
    );
  }
}

export function stepEnemyMotionState(
  previousState: EnemyMotionState,
  levelSpec: LevelSpec,
  enemyInteractions: EnemyInteractionState,
  frameDurationMilliseconds: FrameDurationMilliseconds,
  movementConstants: MovementConstants,
  player: PlayerSimulationState,
  frameIndex: FrameIndex,
): EnemyMotionState {
  assertValidEnemyMotionState(previousState, levelSpec);

  const defeatedEnemyEntityIds = new Set(
    enemyInteractions.defeatedEnemyEntityIds,
  );
  const activeEnemyEntityIds = activateEnemiesNearPlayer(
    previousState,
    movementConstants,
    player,
  );
  const frameDurationSeconds = makeFrameDurationSeconds(
    frameDurationMilliseconds,
  );

  return {
    activeEnemyEntityIds: Array.from(activeEnemyEntityIds),
    patrolActors: previousState.patrolActors.map((patrolActor) => {
      if (defeatedEnemyEntityIds.has(patrolActor.entityId)) {
        return stopEnemyPatrolActor(patrolActor);
      }

      if (!activeEnemyEntityIds.has(patrolActor.entityId)) {
        return patrolActor;
      }

      return stepEnemyPatrolActor(
        patrolActor,
        levelSpec,
        frameDurationSeconds,
        resolveEnemyPatrolSpeed(
          levelSpec,
          patrolActor.entityId,
          movementConstants.enemyPatrolSpeed,
        ),
      );
    }),
    flyingActors: previousState.flyingActors.map((flyingActor) => {
      if (defeatedEnemyEntityIds.has(flyingActor.entityId)) {
        return stopFlyingEnemyActor(flyingActor);
      }

      if (!activeEnemyEntityIds.has(flyingActor.entityId)) {
        return flyingActor;
      }

      return stepFlyingEnemyActor(
        flyingActor,
        levelSpec,
        frameDurationSeconds,
        movementConstants,
        frameIndex,
      );
    }),
    chasingActors: previousState.chasingActors.map((chasingActor) => {
      if (defeatedEnemyEntityIds.has(chasingActor.entityId)) {
        return stopChasingEnemyActor(chasingActor);
      }

      if (!activeEnemyEntityIds.has(chasingActor.entityId)) {
        return chasingActor;
      }

      return stepChasingEnemyActor(
        chasingActor,
        levelSpec,
        frameDurationSeconds,
        movementConstants,
        player,
      );
    }),
    armoredActors: previousState.armoredActors.map((armoredActor) => {
      if (defeatedEnemyEntityIds.has(armoredActor.entityId)) {
        return stopArmoredEnemyActor(armoredActor);
      }

      if (!activeEnemyEntityIds.has(armoredActor.entityId)) {
        return armoredActor;
      }

      return stepArmoredEnemyActor(
        armoredActor,
        levelSpec,
        frameDurationSeconds,
        resolveEnemyPatrolSpeed(
          levelSpec,
          armoredActor.entityId,
          movementConstants.enemyPatrolSpeed,
        ),
        movementConstants,
        frameIndex,
      );
    }),
    throwingActors: previousState.throwingActors.map((throwingActor) => {
      if (defeatedEnemyEntityIds.has(throwingActor.entityId)) {
        return stopThrowingEnemyActor(throwingActor);
      }

      if (!activeEnemyEntityIds.has(throwingActor.entityId)) {
        return throwingActor;
      }

      return stepThrowingEnemyActor(
        throwingActor,
        levelSpec,
        frameDurationSeconds,
      );
    }),
    aerialThrowingActors: previousState.aerialThrowingActors.map(
      (aerialThrowingActor) => {
        if (defeatedEnemyEntityIds.has(aerialThrowingActor.entityId)) {
          return stopAerialThrowingEnemyActor(aerialThrowingActor);
        }

        if (!activeEnemyEntityIds.has(aerialThrowingActor.entityId)) {
          return aerialThrowingActor;
        }

        return stepAerialThrowingEnemyActor(
          aerialThrowingActor,
          levelSpec,
          frameDurationSeconds,
          movementConstants,
          player,
        );
      },
    ),
    piranhaPlantActors: previousState.piranhaPlantActors.map(
      (piranhaPlantActor) => {
        if (defeatedEnemyEntityIds.has(piranhaPlantActor.entityId)) {
          return stopPiranhaPlantActor(piranhaPlantActor);
        }

        if (!activeEnemyEntityIds.has(piranhaPlantActor.entityId)) {
          return piranhaPlantActor;
        }

        return stepPiranhaPlantActor(piranhaPlantActor, levelSpec, player);
      },
    ),
  };
}

export function stopDefeatedEnemyMotionState(
  previousState: EnemyMotionState,
  levelSpec: LevelSpec,
  enemyInteractions: EnemyInteractionState,
  movementConstants: MovementConstants,
): EnemyMotionState {
  assertValidEnemyMotionState(previousState, levelSpec);

  const defeatedEnemyEntityIds = new Set(
    enemyInteractions.defeatedEnemyEntityIds,
  );
  const shelledEnemyEntityIds = new Set(
    enemyInteractions.shelledEnemyEntityIds,
  );
  const nudgedShellDirectionByEntityId = new Map(
    enemyInteractions.nudgedShellDirectionByEntityId,
  );

  return {
    activeEnemyEntityIds: previousState.activeEnemyEntityIds,
    patrolActors: previousState.patrolActors.map((patrolActor) => {
      if (defeatedEnemyEntityIds.has(patrolActor.entityId)) {
        return stopEnemyPatrolActor(patrolActor);
      }

      return patrolActor;
    }),
    flyingActors: previousState.flyingActors.map((flyingActor) => {
      if (defeatedEnemyEntityIds.has(flyingActor.entityId)) {
        return stopFlyingEnemyActor(flyingActor);
      }

      return flyingActor;
    }),
    chasingActors: previousState.chasingActors.map((chasingActor) => {
      if (defeatedEnemyEntityIds.has(chasingActor.entityId)) {
        return stopChasingEnemyActor(chasingActor);
      }

      return chasingActor;
    }),
    armoredActors: previousState.armoredActors.map((armoredActor) => {
      if (defeatedEnemyEntityIds.has(armoredActor.entityId)) {
        return stopArmoredEnemyActor(armoredActor);
      }

      if (shelledEnemyEntityIds.has(armoredActor.entityId)) {
        return shellArmoredEnemyActor(armoredActor, movementConstants);
      }

      const nudgeDirection = nudgedShellDirectionByEntityId.get(
        armoredActor.entityId,
      );

      if (nudgeDirection !== undefined) {
        return nudgeShellArmoredEnemyActor(
          armoredActor,
          nudgeDirection,
          movementConstants,
        );
      }

      return armoredActor;
    }),
    throwingActors: stopDefeatedThrowingEnemyActors(
      previousState.throwingActors,
      defeatedEnemyEntityIds,
    ),
    aerialThrowingActors: stopDefeatedAerialThrowingEnemyActors(
      previousState.aerialThrowingActors,
      defeatedEnemyEntityIds,
    ),
    piranhaPlantActors: previousState.piranhaPlantActors.map(
      (piranhaPlantActor) =>
        defeatedEnemyEntityIds.has(piranhaPlantActor.entityId)
          ? stopPiranhaPlantActor(piranhaPlantActor)
          : piranhaPlantActor,
    ),
  };
}

function stopDefeatedThrowingEnemyActors(
  throwingActors: readonly ThrowingEnemyActorState[],
  defeatedEnemyEntityIds: ReadonlySet<EntityId>,
): readonly ThrowingEnemyActorState[] {
  return throwingActors.map((throwingActor) => {
    if (defeatedEnemyEntityIds.has(throwingActor.entityId)) {
      return stopThrowingEnemyActor(throwingActor);
    }

    return throwingActor;
  });
}

function stopDefeatedAerialThrowingEnemyActors(
  aerialThrowingActors: readonly AerialThrowingEnemyActorState[],
  defeatedEnemyEntityIds: ReadonlySet<EntityId>,
): readonly AerialThrowingEnemyActorState[] {
  return aerialThrowingActors.map((aerialThrowingActor) => {
    if (defeatedEnemyEntityIds.has(aerialThrowingActor.entityId)) {
      return stopAerialThrowingEnemyActor(aerialThrowingActor);
    }

    return aerialThrowingActor;
  });
}

export function requireEnemyPatrolActorState(
  enemyMotion: EnemyMotionState,
  entityId: string,
): EnemyPatrolActorState {
  const patrolActor = enemyMotion.patrolActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (patrolActor === undefined) {
    throw new Error(`Enemy patrol actor ${entityId} is missing.`);
  }

  return patrolActor;
}

export function requireFlyingEnemyActorState(
  enemyMotion: EnemyMotionState,
  entityId: string,
): FlyingEnemyActorState {
  const flyingActor = enemyMotion.flyingActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (flyingActor === undefined) {
    throw new Error(`Enemy flying actor ${entityId} is missing.`);
  }

  return flyingActor;
}

export function requireChasingEnemyActorState(
  enemyMotion: EnemyMotionState,
  entityId: string,
): ChasingEnemyActorState {
  const chasingActor = enemyMotion.chasingActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (chasingActor === undefined) {
    throw new Error(`Enemy chasing actor ${entityId} is missing.`);
  }

  return chasingActor;
}

export function requireArmoredEnemyActorState(
  enemyMotion: EnemyMotionState,
  entityId: string,
): ArmoredEnemyActorState {
  const armoredActor = enemyMotion.armoredActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (armoredActor === undefined) {
    throw new Error(`Enemy armored actor ${entityId} is missing.`);
  }

  return armoredActor;
}

export function requireEnemyActorState(
  enemyMotion: EnemyMotionState,
  entityId: string,
): EnemyActorRuntimeState {
  const patrolActor = enemyMotion.patrolActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (patrolActor !== undefined) {
    return patrolActor;
  }

  const flyingActor = enemyMotion.flyingActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (flyingActor !== undefined) {
    return flyingActor;
  }

  const chasingActor = enemyMotion.chasingActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (chasingActor !== undefined) {
    return chasingActor;
  }

  const armoredActor = enemyMotion.armoredActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (armoredActor !== undefined) {
    return armoredActor;
  }

  const throwingActor = enemyMotion.throwingActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (throwingActor !== undefined) {
    return throwingActor;
  }

  const aerialThrowingActor = enemyMotion.aerialThrowingActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (aerialThrowingActor !== undefined) {
    return aerialThrowingActor;
  }

  const piranhaPlantActor = enemyMotion.piranhaPlantActors.find(
    (candidate) => candidate.entityId === entityId,
  );

  if (piranhaPlantActor !== undefined) {
    return piranhaPlantActor;
  }

  throw new Error(`Enemy actor ${entityId} is missing.`);
}

function extractEntityId(actor: unknown): unknown {
  if (typeof actor !== "object" || actor === null) {
    return actor;
  }

  return (actor as Readonly<Record<string, unknown>>).entityId;
}

function assertValidActiveEnemyEntityIds(
  activeEnemyEntityIds: readonly unknown[],
  allEnemyEntityIds: ReadonlySet<string>,
): asserts activeEnemyEntityIds is readonly EntityId[] {
  const seenEntityIds = new Set<string>();

  for (const [index, entityId] of activeEnemyEntityIds.entries()) {
    if (typeof entityId !== "string") {
      throw new Error(
        `Active enemy entity id at index ${index} must be a string.`,
      );
    }

    if (!allEnemyEntityIds.has(entityId)) {
      throw new Error(`Active enemy entity id ${entityId} is not an enemy.`);
    }

    if (seenEntityIds.has(entityId)) {
      throw new Error(`Active enemy entity id ${entityId} is duplicated.`);
    }

    seenEntityIds.add(entityId);
  }
}

function assertValidEnemyPatrolActorState(
  patrolActor: unknown,
  index: number,
): asserts patrolActor is EnemyPatrolActorState {
  if (typeof patrolActor !== "object" || patrolActor === null) {
    throw new Error(`Enemy patrol actor at index ${index} must be an object.`);
  }

  const candidate = patrolActor as Readonly<Record<string, unknown>>;

  if (typeof candidate.position !== "object" || candidate.position === null) {
    throw new Error(
      `Enemy patrol actor at index ${index} must have a position object.`,
    );
  }

  if (typeof candidate.velocity !== "object" || candidate.velocity === null) {
    throw new Error(
      `Enemy patrol actor at index ${index} must have a velocity object.`,
    );
  }

  const position = candidate.position as Readonly<Record<string, unknown>>;
  const velocity = candidate.velocity as Readonly<Record<string, unknown>>;

  requireEnemyPixelPosition(
    position.x,
    `enemyMotion.patrolActors[${index}].position.x`,
  );
  requireEnemyPixelPosition(
    position.y,
    `enemyMotion.patrolActors[${index}].position.y`,
  );
  requireEnemyVelocity(
    velocity.x,
    `enemyMotion.patrolActors[${index}].velocity.x`,
  );
  requireEnemyVelocity(
    velocity.y,
    `enemyMotion.patrolActors[${index}].velocity.y`,
  );
  makeEnemyPatrolDirection(
    candidate.direction,
    `enemyMotion.patrolActors[${index}].direction`,
  );
}

function assertValidFlyingEnemyActorState(
  flyingActor: unknown,
  index: number,
): asserts flyingActor is FlyingEnemyActorState {
  if (typeof flyingActor !== "object" || flyingActor === null) {
    throw new Error(`Enemy flying actor at index ${index} must be an object.`);
  }

  const candidate = flyingActor as Readonly<Record<string, unknown>>;

  if (typeof candidate.position !== "object" || candidate.position === null) {
    throw new Error(
      `Enemy flying actor at index ${index} must have a position object.`,
    );
  }

  if (typeof candidate.velocity !== "object" || candidate.velocity === null) {
    throw new Error(
      `Enemy flying actor at index ${index} must have a velocity object.`,
    );
  }

  const position = candidate.position as Readonly<Record<string, unknown>>;
  const velocity = candidate.velocity as Readonly<Record<string, unknown>>;

  requireEnemyPixelPosition(
    position.x,
    `enemyMotion.flyingActors[${index}].position.x`,
  );
  requireEnemyPixelPosition(
    position.y,
    `enemyMotion.flyingActors[${index}].position.y`,
  );
  requireEnemyVelocity(
    velocity.x,
    `enemyMotion.flyingActors[${index}].velocity.x`,
  );
  requireEnemyPixelPosition(
    candidate.baseY,
    `enemyMotion.flyingActors[${index}].baseY`,
  );

  if (typeof candidate.phase !== "number") {
    throw new Error(
      `Enemy flying actor at index ${index} must have a numeric phase.`,
    );
  }
}

function assertValidChasingEnemyActorState(
  chasingActor: unknown,
  index: number,
): asserts chasingActor is ChasingEnemyActorState {
  if (typeof chasingActor !== "object" || chasingActor === null) {
    throw new Error(`Enemy chasing actor at index ${index} must be an object.`);
  }

  const candidate = chasingActor as Readonly<Record<string, unknown>>;

  if (typeof candidate.position !== "object" || candidate.position === null) {
    throw new Error(
      `Enemy chasing actor at index ${index} must have a position object.`,
    );
  }

  if (typeof candidate.velocity !== "object" || candidate.velocity === null) {
    throw new Error(
      `Enemy chasing actor at index ${index} must have a velocity object.`,
    );
  }

  const position = candidate.position as Readonly<Record<string, unknown>>;
  const velocity = candidate.velocity as Readonly<Record<string, unknown>>;

  requireEnemyPixelPosition(
    position.x,
    `enemyMotion.chasingActors[${index}].position.x`,
  );
  requireEnemyPixelPosition(
    position.y,
    `enemyMotion.chasingActors[${index}].position.y`,
  );
  requireEnemyVelocity(
    velocity.x,
    `enemyMotion.chasingActors[${index}].velocity.x`,
  );
  makeEnemyPatrolDirection(
    candidate.direction,
    `enemyMotion.chasingActors[${index}].direction`,
  );
  makeChasingEnemyBehavior(
    candidate.behavior,
    `enemyMotion.chasingActors[${index}].behavior`,
  );
}

function assertValidArmoredEnemyActorState(
  armoredActor: unknown,
  index: number,
): asserts armoredActor is ArmoredEnemyActorState {
  if (typeof armoredActor !== "object" || armoredActor === null) {
    throw new Error(`Enemy armored actor at index ${index} must be an object.`);
  }

  const candidate = armoredActor as Readonly<Record<string, unknown>>;

  if (typeof candidate.position !== "object" || candidate.position === null) {
    throw new Error(
      `Enemy armored actor at index ${index} must have a position object.`,
    );
  }

  if (typeof candidate.velocity !== "object" || candidate.velocity === null) {
    throw new Error(
      `Enemy armored actor at index ${index} must have a velocity object.`,
    );
  }

  const position = candidate.position as Readonly<Record<string, unknown>>;
  const velocity = candidate.velocity as Readonly<Record<string, unknown>>;

  requireEnemyPixelPosition(
    position.x,
    `enemyMotion.armoredActors[${index}].position.x`,
  );
  requireEnemyPixelPosition(
    position.y,
    `enemyMotion.armoredActors[${index}].position.y`,
  );
  requireEnemyVelocity(
    velocity.x,
    `enemyMotion.armoredActors[${index}].velocity.x`,
  );
  requireEnemyVelocity(
    velocity.y,
    `enemyMotion.armoredActors[${index}].velocity.y`,
  );

  if (
    typeof candidate.hitPoints !== "number" ||
    !Number.isInteger(candidate.hitPoints)
  ) {
    throw new Error(
      `Enemy armored actor at index ${index} must have an integer hitPoints.`,
    );
  }

  if (
    typeof candidate.restingFrames !== "number" ||
    !Number.isInteger(candidate.restingFrames) ||
    candidate.restingFrames < 0
  ) {
    throw new Error(
      `Enemy armored actor at index ${index} must have a non-negative integer restingFrames.`,
    );
  }

  makeArmoredEnemyBehavior(
    candidate.behavior,
    `enemyMotion.armoredActors[${index}].behavior`,
  );

  requireEnemyPixelPosition(
    candidate.flightBaseY,
    `enemyMotion.armoredActors[${index}].flightBaseY`,
  );
}

function assertValidThrowingEnemyActorState(
  throwingActor: unknown,
  index: number,
): asserts throwingActor is ThrowingEnemyActorState {
  if (typeof throwingActor !== "object" || throwingActor === null) {
    throw new Error(
      `Enemy throwing actor at index ${index} must be an object.`,
    );
  }

  const candidate = throwingActor as Readonly<Record<string, unknown>>;

  if (typeof candidate.position !== "object" || candidate.position === null) {
    throw new Error(
      `Enemy throwing actor at index ${index} must have a position object.`,
    );
  }

  if (typeof candidate.velocity !== "object" || candidate.velocity === null) {
    throw new Error(
      `Enemy throwing actor at index ${index} must have a velocity object.`,
    );
  }

  const position = candidate.position as Readonly<Record<string, unknown>>;
  const velocity = candidate.velocity as Readonly<Record<string, unknown>>;

  requireEnemyPixelPosition(
    position.x,
    `enemyMotion.throwingActors[${index}].position.x`,
  );
  requireEnemyPixelPosition(
    position.y,
    `enemyMotion.throwingActors[${index}].position.y`,
  );
  requireEnemyVelocity(
    velocity.x,
    `enemyMotion.throwingActors[${index}].velocity.x`,
  );
}

function assertValidAerialThrowingEnemyActorState(
  aerialThrowingActor: unknown,
  index: number,
): asserts aerialThrowingActor is AerialThrowingEnemyActorState {
  if (typeof aerialThrowingActor !== "object" || aerialThrowingActor === null) {
    throw new Error(
      `Enemy aerial throwing actor at index ${index} must be an object.`,
    );
  }

  const candidate = aerialThrowingActor as Readonly<Record<string, unknown>>;

  if (typeof candidate.position !== "object" || candidate.position === null) {
    throw new Error(
      `Enemy aerial throwing actor at index ${index} must have a position object.`,
    );
  }

  if (typeof candidate.velocity !== "object" || candidate.velocity === null) {
    throw new Error(
      `Enemy aerial throwing actor at index ${index} must have a velocity object.`,
    );
  }

  const position = candidate.position as Readonly<Record<string, unknown>>;
  const velocity = candidate.velocity as Readonly<Record<string, unknown>>;

  requireEnemyPixelPosition(
    position.x,
    `enemyMotion.aerialThrowingActors[${index}].position.x`,
  );
  requireEnemyPixelPosition(
    position.y,
    `enemyMotion.aerialThrowingActors[${index}].position.y`,
  );
  requireEnemyVelocity(
    velocity.x,
    `enemyMotion.aerialThrowingActors[${index}].velocity.x`,
  );
}

function assertEnemyActorCoverage(
  allActors: readonly unknown[],
  allEnemyEntityIds: ReadonlySet<string>,
): void {
  const expectedEnemyEntityIds = new Set(allEnemyEntityIds);

  if (allActors.length !== expectedEnemyEntityIds.size) {
    throw new Error("Enemy actor count must match total enemy actor count.");
  }

  for (const actor of allActors) {
    const entityId = extractEntityId(actor);

    if (typeof entityId === "string") {
      expectedEnemyEntityIds.delete(entityId);
    }
  }

  if (expectedEnemyEntityIds.size > 0) {
    throw new Error("Enemy motion actors must include every enemy actor.");
  }
}

function assertNoDuplicateEnemyEntityIdsAcrossArrays(
  allActors: readonly unknown[],
): void {
  const seenEntityIds = new Set<string>();

  for (const actor of allActors) {
    const entityId = extractEntityId(actor);

    if (typeof entityId !== "string") {
      continue;
    }

    if (seenEntityIds.has(entityId)) {
      throw new Error(`Enemy actor ${entityId} is duplicated across arrays.`);
    }

    seenEntityIds.add(entityId);
  }
}

function collectEnemyEntityIds(levelSpec: LevelSpec): Set<string> {
  const enemyEntityIds = new Set<string>();

  for (const actor of levelSpec.actors) {
    if (isEnemyRole(findActorRole(levelSpec, actor.actorId))) {
      enemyEntityIds.add(actor.entityId);
    }
  }

  return enemyEntityIds;
}

function activateEnemiesNearPlayer(
  previousState: EnemyMotionState,
  movementConstants: MovementConstants,
  player: PlayerSimulationState,
): Set<EntityId> {
  const activeEnemyEntityIds = new Set(previousState.activeEnemyEntityIds);
  const activationBoundaryX =
    player.position.x +
    player.collider.width +
    movementConstants.enemyActivationLeadPixels;

  for (const enemyActor of collectEnemyActorRuntimeStates(previousState)) {
    if (enemyActor.position.x <= activationBoundaryX) {
      activeEnemyEntityIds.add(enemyActor.entityId);
    }
  }

  return activeEnemyEntityIds;
}

function collectEnemyActorRuntimeStates(
  enemyMotion: EnemyMotionState,
): readonly EnemyActorRuntimeState[] {
  return [
    ...enemyMotion.patrolActors,
    ...enemyMotion.flyingActors,
    ...enemyMotion.chasingActors,
    ...enemyMotion.armoredActors,
    ...enemyMotion.throwingActors,
    ...enemyMotion.aerialThrowingActors,
    ...enemyMotion.piranhaPlantActors,
  ];
}

function findActorRole(
  levelSpec: LevelSpec,
  actorId: string,
): LevelSpec["actorDefinitions"][number]["role"] {
  return requireActorDefinitionByActorId(levelSpec, actorId).role;
}

function requireActorDefinitionByActorId(
  levelSpec: LevelSpec,
  actorId: string,
): LevelSpec["actorDefinitions"][number] {
  const actorDefinition = levelSpec.actorDefinitions.find(
    (candidate) => candidate.actorId === actorId,
  );

  if (actorDefinition === undefined) {
    throw new Error("Validated level actor is missing an actor definition.");
  }

  return actorDefinition;
}

function findWingedFlightPattern(
  levelSpec: LevelSpec,
  actorId: string,
): LevelSpec["actorDefinitions"][number]["wingedFlight"] {
  return requireActorDefinitionByActorId(levelSpec, actorId).wingedFlight;
}

// Definition lookup by placed entity id (behavior flags live on the actor
// definition, shared by every placement of that actor id).
function findActorDefinitionByEntityId(
  levelSpec: LevelSpec,
  entityId: EntityId,
): LevelSpec["actorDefinitions"][number] | undefined {
  const placement = levelSpec.actors.find(
    (candidate) => candidate.entityId === entityId,
  );
  if (placement === undefined) {
    return undefined;
  }
  return requireActorDefinitionByActorId(levelSpec, placement.actorId);
}

function makeInitialEnemyPatrolDirection(): EnemyPatrolDirection {
  return EnemyPatrolDirection.Left;
}

function resolveEnemyPatrolSpeed(
  levelSpec: LevelSpec,
  entityId: EntityId,
  defaultSpeed: VelocityPixelsPerSecond,
): VelocityPixelsPerSecond {
  return levelSpec.enemyPatrolSpeedByEntityId.get(entityId) ?? defaultSpeed;
}

// Ground walkers fall off ledges in the original; these govern that fall.
const enemyGravityPixelsPerSecondSquared = 600;
const enemyMaxFallSpeedPixelsPerSecond = 240;

// Non-falling enemies (and the temporary patrol wrappers used only for
// horizontal obstacle checks) carry a resting vertical velocity.
const zeroEnemyVerticalVelocity = requireEnemyVelocity(
  0,
  "enemyMotion.zeroVerticalVelocity",
);

// True when a solid tile sits directly under the enemy's centre column, i.e. it
// is standing on ground rather than hanging over a ledge/pit.
function enemyHasFloorBelow(
  positionX: number,
  positionY: number,
  levelSpec: LevelSpec,
): boolean {
  const tileSizePixels = levelSpec.tileSizePixels;
  const centreColumn = Math.floor(
    (positionX + tileSizePixels / 2) / tileSizePixels,
  );
  const floorRow = Math.floor((positionY + tileSizePixels) / tileSizePixels);
  return tileIsSolid(
    levelSpec,
    makeSolidTileIds(levelSpec),
    floorRow,
    centreColumn,
  );
}

// When a falling enemy would cross onto a solid tile, returns the y that rests
// its feet on that tile's top; otherwise null (keep falling).
function enemyLandingY(
  positionX: number,
  fromY: number,
  toY: number,
  levelSpec: LevelSpec,
): number | null {
  const tileSizePixels = levelSpec.tileSizePixels;
  const centreColumn = Math.floor(
    (positionX + tileSizePixels / 2) / tileSizePixels,
  );
  const solidTileIds = makeSolidTileIds(levelSpec);
  const startRow = Math.floor((fromY + tileSizePixels) / tileSizePixels);
  const endRow = Math.floor((toY + tileSizePixels) / tileSizePixels);
  for (let row = startRow; row <= endRow; row += 1) {
    if (tileIsSolid(levelSpec, solidTileIds, row, centreColumn)) {
      return row * tileSizePixels - tileSizePixels;
    }
  }
  return null;
}

function resolveEnemyVerticalMotion(
  positionY: number,
  velocityY: number,
  nextX: number,
  frameDurationSeconds: number,
  levelSpec: LevelSpec,
): { readonly positionY: number; readonly velocityY: number } {
  const restingOnGround =
    enemyHasFloorBelow(nextX, positionY, levelSpec) && velocityY >= 0;
  if (restingOnGround) {
    return { positionY, velocityY: 0 };
  }

  const fallVelocity = Math.min(
    velocityY + enemyGravityPixelsPerSecondSquared * frameDurationSeconds,
    enemyMaxFallSpeedPixelsPerSecond,
  );
  const candidateY = positionY + fallVelocity * frameDurationSeconds;
  if (fallVelocity > 0) {
    const landingY = enemyLandingY(nextX, positionY, candidateY, levelSpec);
    if (landingY !== null) {
      return { positionY: landingY, velocityY: 0 };
    }
  }
  return { positionY: candidateY, velocityY: fallVelocity };
}

// Builds the position/velocity fields shared by every ground-walker step
// (Goomba, Koopa, and sliding shell): the resolved horizontal x/velocity plus
// the gravity-resolved vertical y/velocity.
function resolveEnemyMotionFields(
  positionYBefore: number,
  velocityYBefore: number,
  nextX: number,
  velocityX: number,
  frameDurationSeconds: number,
  levelSpec: LevelSpec,
): {
  readonly position: { readonly x: PixelPosition; readonly y: PixelPosition };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
    readonly y: VelocityPixelsPerSecond;
  };
} {
  const vertical = resolveEnemyVerticalMotion(
    positionYBefore,
    velocityYBefore,
    nextX,
    frameDurationSeconds,
    levelSpec,
  );
  return {
    position: {
      x: requireEnemyPixelPosition(nextX, "enemyMotion.position.x"),
      y: requireEnemyPixelPosition(
        vertical.positionY,
        "enemyMotion.position.y",
      ),
    },
    velocity: {
      x: requireEnemyVelocity(velocityX, "enemyMotion.velocity.x"),
      y: requireEnemyVelocity(vertical.velocityY, "enemyMotion.velocity.y"),
    },
  };
}

function stepEnemyPatrolActor(
  patrolActor: EnemyPatrolActorState,
  levelSpec: LevelSpec,
  frameDurationSeconds: number,
  enemyPatrolSpeed: VelocityPixelsPerSecond,
): EnemyPatrolActorState {
  const attemptedPositionX =
    patrolActor.position.x +
    makeEnemyPatrolDirectionSign(patrolActor.direction) *
      enemyPatrolSpeed *
      frameDurationSeconds;

  // Horizontal: reverse only at solid walls (checkFloorSupport = false) so the
  // enemy walks off ledges like the original instead of turning around.
  let direction = patrolActor.direction;
  let nextX: number = patrolActor.position.x;
  let velocityX = 0;
  if (!enemyWouldLeaveWorld(attemptedPositionX, levelSpec)) {
    const obstacleCheck = checkEnemyMotionObstacle(
      patrolActor,
      attemptedPositionX,
      levelSpec,
      false,
    );
    if (obstacleCheck.blocked) {
      direction = obstacleCheck.nextDirection;
    } else {
      nextX = attemptedPositionX;
    }
    velocityX = makeEnemyPatrolVelocity(enemyPatrolSpeed, direction);
  }

  return {
    ...patrolActor,
    ...resolveEnemyMotionFields(
      patrolActor.position.y,
      patrolActor.velocity.y,
      nextX,
      velocityX,
      frameDurationSeconds,
      levelSpec,
    ),
    direction,
  };
}

function stopEnemyPatrolActor(
  patrolActor: EnemyPatrolActorState,
): EnemyPatrolActorState {
  return {
    ...patrolActor,
    velocity: {
      x: requireEnemyVelocity(0, "enemyMotion.patrolActors[].velocity.x"),
      y: zeroEnemyVerticalVelocity,
    },
  };
}

function stepFlyingEnemyActor(
  flyingActor: FlyingEnemyActorState,
  levelSpec: LevelSpec,
  frameDurationSeconds: number,
  movementConstants: MovementConstants,
  frameIndex: FrameIndex,
): FlyingEnemyActorState {
  const attemptedPositionX =
    flyingActor.position.x +
    makeEnemyPatrolDirectionSign(
      makeEnemyPatrolDirectionFromVelocity(flyingActor.velocity.x),
    ) *
      movementConstants.flyingEnemyPatrolSpeed *
      frameDurationSeconds;

  if (enemyWouldLeaveWorld(attemptedPositionX, levelSpec)) {
    return {
      ...flyingActor,
      velocity: {
        x: requireEnemyVelocity(
          0 - flyingActor.velocity.x,
          "enemyMotion.flyingActors[].velocity.x",
        ),
      },
    };
  }

  const flyingActorAsPatrol: EnemyPatrolActorState = {
    entityId: flyingActor.entityId,
    position: flyingActor.position,
    velocity: { x: flyingActor.velocity.x, y: zeroEnemyVerticalVelocity },
    direction: makeEnemyPatrolDirectionFromVelocity(flyingActor.velocity.x),
  };
  const obstacleCheck = checkEnemyMotionObstacle(
    flyingActorAsPatrol,
    attemptedPositionX,
    levelSpec,
    false,
  );

  const nextVelocityX = obstacleCheck.blocked
    ? makeEnemyPatrolVelocity(
        movementConstants.flyingEnemyPatrolSpeed,
        obstacleCheck.nextDirection,
      )
    : flyingActor.velocity.x;
  const nextPositionX = obstacleCheck.blocked
    ? flyingActor.position.x
    : requireEnemyPixelPosition(
        attemptedPositionX,
        "enemyMotion.flyingActors[].position.x",
      );
  const nextPositionY = requireEnemyPixelPosition(
    computeFlyingEnemyVerticalPosition(
      flyingActor,
      movementConstants,
      frameIndex,
    ),
    "enemyMotion.flyingActors[].position.y",
  );

  return {
    ...flyingActor,
    position: {
      x: nextPositionX,
      y: nextPositionY,
    },
    velocity: {
      x: nextVelocityX,
    },
  };
}

function stopFlyingEnemyActor(
  flyingActor: FlyingEnemyActorState,
): FlyingEnemyActorState {
  return {
    ...flyingActor,
    velocity: {
      x: requireEnemyVelocity(0, "enemyMotion.flyingActors[].velocity.x"),
    },
  };
}

function computeFlyingEnemyVerticalPosition(
  flyingActor: FlyingEnemyActorState,
  movementConstants: MovementConstants,
  frameIndex: FrameIndex,
): number {
  const phaseIncrement =
    (2 * Math.PI) / movementConstants.flyingEnemyVerticalPeriodFrames;

  return (
    flyingActor.baseY +
    movementConstants.flyingEnemyVerticalAmplitudePixels *
      Math.sin(flyingActor.phase + frameIndex * phaseIncrement)
  );
}

// Piranha Plant emerge/pause/retreat/pause cycle (frames), and how far it rises
// above its retracted (in-pipe) base position.
const piranhaEmergeFrames = 28;
const piranhaTopPauseFrames = 44;
const piranhaRetreatFrames = 28;
const piranhaBottomPauseFrames = 44;
const piranhaCycleFrames =
  piranhaEmergeFrames +
  piranhaTopPauseFrames +
  piranhaRetreatFrames +
  piranhaBottomPauseFrames;
const piranhaEmergeHeightTiles = 1.4;

// 0 = fully retracted (in the pipe), 1 = fully emerged.
function computePiranhaEmergeFraction(phase: number): number {
  const p =
    ((phase % piranhaCycleFrames) + piranhaCycleFrames) % piranhaCycleFrames;
  if (p < piranhaEmergeFrames) {
    return p / piranhaEmergeFrames;
  }
  if (p < piranhaEmergeFrames + piranhaTopPauseFrames) {
    return 1;
  }
  if (p < piranhaEmergeFrames + piranhaTopPauseFrames + piranhaRetreatFrames) {
    return (
      1 -
      (p - piranhaEmergeFrames - piranhaTopPauseFrames) / piranhaRetreatFrames
    );
  }
  return 0;
}

// A plant will not emerge while the player stands this close to its pipe
// (as in the original, which suppresses the emerge when the player is near).
const piranhaEmergeHoldDistancePixels = 40;

function stepPiranhaPlantActor(
  piranhaPlantActor: PiranhaPlantActorState,
  levelSpec: LevelSpec,
  player: PlayerSimulationState,
): PiranhaPlantActorState {
  const nextPhaseCandidate = piranhaPlantActor.phase + 1;
  const playerIsNear =
    Math.abs(player.position.x - piranhaPlantActor.position.x) <=
    piranhaEmergeHoldDistancePixels;
  // Fully retracted with the player nearby: hold the phase so the plant stays
  // hidden instead of emerging into the player standing on its pipe.
  if (
    playerIsNear &&
    computePiranhaEmergeFraction(piranhaPlantActor.phase) === 0 &&
    computePiranhaEmergeFraction(nextPhaseCandidate) > 0
  ) {
    return {
      ...piranhaPlantActor,
      position: { x: piranhaPlantActor.position.x, y: piranhaPlantActor.baseY },
    };
  }

  const nextPhase = nextPhaseCandidate;
  const emergePixels = piranhaEmergeHeightTiles * levelSpec.tileSizePixels;
  const nextPositionY = requireEnemyPixelPosition(
    piranhaPlantActor.baseY -
      computePiranhaEmergeFraction(nextPhase) * emergePixels,
    "enemyMotion.piranhaPlantActors[].position.y",
  );

  return {
    ...piranhaPlantActor,
    position: { x: piranhaPlantActor.position.x, y: nextPositionY },
    phase: nextPhase,
  };
}

// A defeated Piranha Plant simply stops cycling.
function stopPiranhaPlantActor(
  piranhaPlantActor: PiranhaPlantActorState,
): PiranhaPlantActorState {
  return piranhaPlantActor;
}

// Move an enemy's vertical position toward the player's depth by up to `step`,
// clamped to stay within the playfield (so a swimming chaser never drifts off
// the top or bottom of the water).
function approachEnemyDepth(
  currentY: number,
  targetY: number,
  step: number,
  levelSpec: LevelSpec,
): number {
  const worldHeight = levelSpec.heightTiles * levelSpec.tileSizePixels;
  const delta = targetY - currentY;
  const next =
    Math.abs(delta) <= step ? targetY : currentY + Math.sign(delta) * step;
  return Math.max(8, Math.min(worldHeight - 20, next));
}

function stepChasingEnemyActor(
  chasingActor: ChasingEnemyActorState,
  levelSpec: LevelSpec,
  frameDurationSeconds: number,
  movementConstants: MovementConstants,
  player: PlayerSimulationState,
): ChasingEnemyActorState {
  const playerDetected = isPlayerInChaseDetectionWindow(
    chasingActor,
    player,
    movementConstants,
  );

  if (playerDetected) {
    const direction =
      player.position.x < chasingActor.position.x
        ? EnemyPatrolDirection.Left
        : EnemyPatrolDirection.Right;
    const attemptedPositionX =
      chasingActor.position.x +
      makeEnemyPatrolDirectionSign(direction) *
        movementConstants.chasingEnemySpeed *
        frameDurationSeconds;

    if (enemyWouldLeaveWorld(attemptedPositionX, levelSpec)) {
      return {
        ...chasingActor,
        behavior: ChasingEnemyBehavior.Chase,
        direction,
        velocity: {
          x: requireEnemyVelocity(
            makeEnemyPatrolDirectionSign(direction) *
              movementConstants.chasingEnemySpeed,
            "enemyMotion.chasingActors[].velocity.x",
          ),
        },
      };
    }

    const chasingActorAsPatrol: EnemyPatrolActorState = {
      entityId: chasingActor.entityId,
      position: chasingActor.position,
      velocity: { x: chasingActor.velocity.x, y: zeroEnemyVerticalVelocity },
      direction,
    };
    const obstacleCheck = checkEnemyMotionObstacle(
      chasingActorAsPatrol,
      attemptedPositionX,
      levelSpec,
      false,
    );

    if (obstacleCheck.blocked) {
      return {
        ...chasingActor,
        behavior: ChasingEnemyBehavior.Chase,
        direction: obstacleCheck.nextDirection,
        velocity: {
          x: makeEnemyPatrolVelocity(
            movementConstants.chasingEnemySpeed,
            obstacleCheck.nextDirection,
          ),
        },
      };
    }

    // A swimming chaser (Blooper) also drifts toward the player's depth, so it
    // pursues in 2D instead of sliding past at a fixed height — but gently (a
    // fraction of its horizontal speed) so it stays avoidable. On land the
    // chaser stays on its row.
    const attemptedPositionY = movementConstants.swimming
      ? approachEnemyDepth(
          chasingActor.position.y,
          player.position.y,
          movementConstants.chasingEnemySpeed * frameDurationSeconds * 0.35,
          levelSpec,
        )
      : chasingActor.position.y;

    return {
      ...chasingActor,
      behavior: ChasingEnemyBehavior.Chase,
      direction,
      position: {
        x: requireEnemyPixelPosition(
          attemptedPositionX,
          "enemyMotion.chasingActors[].position.x",
        ),
        y: requireEnemyPixelPosition(
          attemptedPositionY,
          "enemyMotion.chasingActors[].position.y",
        ),
      },
      velocity: {
        x: makeEnemyPatrolVelocity(
          movementConstants.chasingEnemySpeed,
          direction,
        ),
      },
    };
  }

  const patrolSpeed = resolveEnemyPatrolSpeed(
    levelSpec,
    chasingActor.entityId,
    movementConstants.enemyPatrolSpeed,
  );
  const attemptedPositionX =
    chasingActor.position.x +
    makeEnemyPatrolDirectionSign(chasingActor.direction) *
      patrolSpeed *
      frameDurationSeconds;

  if (enemyWouldLeaveWorld(attemptedPositionX, levelSpec)) {
    return {
      ...chasingActor,
      behavior: ChasingEnemyBehavior.Patrol,
      velocity: {
        x: requireEnemyVelocity(0, "enemyMotion.chasingActors[].velocity.x"),
      },
    };
  }

  const chasingActorAsPatrol: EnemyPatrolActorState = {
    entityId: chasingActor.entityId,
    position: chasingActor.position,
    velocity: { x: chasingActor.velocity.x, y: zeroEnemyVerticalVelocity },
    direction: chasingActor.direction,
  };
  const obstacleCheck = checkEnemyMotionObstacle(
    chasingActorAsPatrol,
    attemptedPositionX,
    levelSpec,
    true,
  );

  if (obstacleCheck.blocked) {
    return {
      ...chasingActor,
      behavior: ChasingEnemyBehavior.Patrol,
      velocity: {
        x: makeEnemyPatrolVelocity(patrolSpeed, obstacleCheck.nextDirection),
      },
      direction: obstacleCheck.nextDirection,
    };
  }

  return {
    ...chasingActor,
    behavior: ChasingEnemyBehavior.Patrol,
    position: {
      x: requireEnemyPixelPosition(
        attemptedPositionX,
        "enemyMotion.chasingActors[].position.x",
      ),
      y: chasingActor.position.y,
    },
    velocity: {
      x: makeEnemyPatrolVelocity(patrolSpeed, chasingActor.direction),
    },
  };
}

function stopChasingEnemyActor(
  chasingActor: ChasingEnemyActorState,
): ChasingEnemyActorState {
  return {
    ...chasingActor,
    velocity: {
      x: requireEnemyVelocity(0, "enemyMotion.chasingActors[].velocity.x"),
    },
  };
}

function stepArmoredEnemyActor(
  armoredActor: ArmoredEnemyActorState,
  levelSpec: LevelSpec,
  frameDurationSeconds: number,
  enemyPatrolSpeed: VelocityPixelsPerSecond,
  movementConstants: MovementConstants,
  frameIndex: FrameIndex,
): ArmoredEnemyActorState {
  if (armoredActor.behavior === ArmoredEnemyBehavior.Shell) {
    return stepShellArmoredEnemyActor(
      armoredActor,
      levelSpec,
      frameDurationSeconds,
      enemyPatrolSpeed,
      movementConstants.shellSlideSpeed,
    );
  }

  const definition = findActorDefinitionByEntityId(
    levelSpec,
    armoredActor.entityId,
  );

  if (armoredActor.behavior === ArmoredEnemyBehavior.Winged) {
    return stepWingedArmoredEnemyActor(
      armoredActor,
      levelSpec,
      frameDurationSeconds,
      movementConstants,
      frameIndex,
      definition?.wingedFlight ?? "horizontal",
    );
  }

  const direction = makeEnemyPatrolDirectionFromVelocity(
    armoredActor.velocity.x,
  );
  const attemptedPositionX =
    armoredActor.position.x +
    makeEnemyPatrolDirectionSign(direction) *
      enemyPatrolSpeed *
      frameDurationSeconds;

  // Horizontal: reverse at solid walls; ledge-staying walkers (red Koopa)
  // also turn at ledges, everyone else walks off them.
  const turnsAtLedges = definition?.turnsAtLedges === true;
  let nextDirection = direction;
  let nextX: number = armoredActor.position.x;
  let velocityX = 0;
  if (!enemyWouldLeaveWorld(attemptedPositionX, levelSpec)) {
    const armoredActorAsPatrol: EnemyPatrolActorState = {
      entityId: armoredActor.entityId,
      position: armoredActor.position,
      velocity: { x: armoredActor.velocity.x, y: armoredActor.velocity.y },
      direction,
    };
    const obstacleCheck = checkEnemyMotionObstacle(
      armoredActorAsPatrol,
      attemptedPositionX,
      levelSpec,
      turnsAtLedges && armoredActor.velocity.y === 0,
    );
    if (obstacleCheck.blocked) {
      nextDirection = obstacleCheck.nextDirection;
    } else {
      nextX = attemptedPositionX;
    }
    velocityX = makeEnemyPatrolVelocity(enemyPatrolSpeed, nextDirection);
  }

  return {
    ...armoredActor,
    ...resolveEnemyMotionFields(
      armoredActor.position.y,
      armoredActor.velocity.y,
      nextX,
      velocityX,
      frameDurationSeconds,
      levelSpec,
    ),
  };
}

// Shared horizontal motion for winged (airborne) armored enemies: advance at
// the given speed, reversing at walls and world edges, never falling.
function stepWingedHorizontal(
  armoredActor: ArmoredEnemyActorState,
  speed: VelocityPixelsPerSecond,
  levelSpec: LevelSpec,
  frameDurationSeconds: number,
): { readonly nextX: number; readonly nextDirection: EnemyPatrolDirection } {
  const direction = makeEnemyPatrolDirectionFromVelocity(
    armoredActor.velocity.x,
  );
  const attemptedPositionX =
    armoredActor.position.x +
    makeEnemyPatrolDirectionSign(direction) * speed * frameDurationSeconds;
  let nextDirection = direction;
  let nextX: number = armoredActor.position.x;
  if (!enemyWouldLeaveWorld(attemptedPositionX, levelSpec)) {
    const asPatrol: EnemyPatrolActorState = {
      entityId: armoredActor.entityId,
      position: armoredActor.position,
      velocity: { x: armoredActor.velocity.x, y: zeroEnemyVerticalVelocity },
      direction,
    };
    const obstacleCheck = checkEnemyMotionObstacle(
      asPatrol,
      attemptedPositionX,
      levelSpec,
      false,
    );
    if (obstacleCheck.blocked) {
      nextDirection = obstacleCheck.nextDirection;
    } else {
      nextX = attemptedPositionX;
    }
  }
  return { nextX, nextDirection };
}

// Airborne Paratroopa movement, by flight pattern: "horizontal" glides side to
// side with a gentle bob, "vertical" oscillates in place over a tall range,
// "hop" bounds along the ground taking off again on every landing.
function stepWingedArmoredEnemyActor(
  armoredActor: ArmoredEnemyActorState,
  levelSpec: LevelSpec,
  frameDurationSeconds: number,
  movementConstants: MovementConstants,
  frameIndex: FrameIndex,
  pattern: NonNullable<LevelSpec["actorDefinitions"][number]["wingedFlight"]>,
): ArmoredEnemyActorState {
  if (pattern === "vertical") {
    const phaseIncrement =
      (2 * Math.PI) / movementConstants.wingedVerticalFlyerPeriodFrames;
    const nextY = requireEnemyPixelPosition(
      armoredActor.flightBaseY +
        movementConstants.wingedVerticalFlyerAmplitudePixels *
          Math.sin(frameIndex * phaseIncrement),
      "enemyMotion.armoredActors[].position.y",
    );
    return {
      ...armoredActor,
      position: { x: armoredActor.position.x, y: nextY },
      velocity: {
        x: requireEnemyVelocity(0, "enemyMotion.armoredActors[].velocity.x"),
        y: zeroEnemyVerticalVelocity,
      },
    };
  }

  if (pattern === "hop") {
    const { nextX, nextDirection } = stepWingedHorizontal(
      armoredActor,
      movementConstants.enemyPatrolSpeed,
      levelSpec,
      frameDurationSeconds,
    );
    const moved = resolveEnemyMotionFields(
      armoredActor.position.y,
      armoredActor.velocity.y,
      nextX,
      makeEnemyPatrolVelocity(
        movementConstants.enemyPatrolSpeed,
        nextDirection,
      ),
      frameDurationSeconds,
      levelSpec,
    );
    // Grounded after the move? Take off again.
    const grounded =
      moved.velocity.y === 0 &&
      enemyHasFloorBelow(moved.position.x, moved.position.y, levelSpec);
    return {
      ...armoredActor,
      position: moved.position,
      velocity: {
        x: moved.velocity.x,
        y: grounded
          ? requireEnemyVelocity(
              0 - movementConstants.wingedHopTakeoffSpeed,
              "enemyMotion.armoredActors[].velocity.y",
            )
          : moved.velocity.y,
      },
    };
  }

  // "horizontal": glide like a flying enemy, bobbing around the spawn height.
  const { nextX, nextDirection } = stepWingedHorizontal(
    armoredActor,
    movementConstants.flyingEnemyPatrolSpeed,
    levelSpec,
    frameDurationSeconds,
  );
  const phaseIncrement =
    (2 * Math.PI) / movementConstants.flyingEnemyVerticalPeriodFrames;
  const nextY = requireEnemyPixelPosition(
    armoredActor.flightBaseY +
      movementConstants.flyingEnemyVerticalAmplitudePixels *
        Math.sin(frameIndex * phaseIncrement),
    "enemyMotion.armoredActors[].position.y",
  );
  return {
    ...armoredActor,
    position: {
      x: requireEnemyPixelPosition(
        nextX,
        "enemyMotion.armoredActors[].position.x",
      ),
      y: nextY,
    },
    velocity: {
      x: makeEnemyPatrolVelocity(
        movementConstants.flyingEnemyPatrolSpeed,
        nextDirection,
      ),
      y: zeroEnemyVerticalVelocity,
    },
  };
}

// A resting koopa shell wakes back into a walking koopa after sitting still for
// this many frames (~5s at 60fps), as in the original. A sliding/kicked shell
// never revives — its rest timer is held at zero while it moves.
const shellReviveFrames = 300;

// The final stretch before waking, during which the shell wobbles side to side
// as a warning (as in the original).
const shellReviveShakeFrames = 48;

// True while a resting shell is in its pre-wake wobble window.
function isShellReviving(armoredActor: ArmoredEnemyActorState): boolean {
  return (
    armoredActor.behavior === ArmoredEnemyBehavior.Shell &&
    armoredActor.velocity.x === 0 &&
    armoredActor.restingFrames >= shellReviveFrames - shellReviveShakeFrames
  );
}

// A ±1px side-to-side wobble (flipping every couple of frames) for a shell about
// to wake, zero otherwise. Purely visual — the simulation position is unchanged.
export function shellReviveShakeOffsetPixels(
  armoredActor: ArmoredEnemyActorState,
): number {
  if (!isShellReviving(armoredActor)) {
    return 0;
  }
  return Math.floor(armoredActor.restingFrames / 2) % 2 === 0 ? 1 : -1;
}

function shellArmoredEnemyActor(
  armoredActor: ArmoredEnemyActorState,
  movementConstants: MovementConstants,
): ArmoredEnemyActorState {
  if (armoredActor.behavior === ArmoredEnemyBehavior.Winged) {
    // A stomped Paratroopa loses its wings and drops to the ground as a
    // regular walking koopa (as in the original).
    return {
      ...armoredActor,
      hitPoints: 2,
      behavior: ArmoredEnemyBehavior.Active,
      velocity: {
        x: makeEnemyPatrolVelocity(
          movementConstants.enemyPatrolSpeed,
          EnemyPatrolDirection.Left,
        ),
        y: zeroEnemyVerticalVelocity,
      },
      restingFrames: 0,
    };
  }
  return {
    ...armoredActor,
    hitPoints: 1,
    behavior: ArmoredEnemyBehavior.Shell,
    velocity: {
      x: requireEnemyVelocity(0, "enemyMotion.armoredActors[].velocity.x"),
      y: armoredActor.velocity.y,
    },
    restingFrames: 0,
  };
}

function nudgeShellArmoredEnemyActor(
  armoredActor: ArmoredEnemyActorState,
  direction: EnemyPatrolDirection,
  movementConstants: MovementConstants,
): ArmoredEnemyActorState {
  return {
    ...armoredActor,
    behavior: ArmoredEnemyBehavior.Shell,
    velocity: {
      x: makeEnemyPatrolVelocity(movementConstants.shellSlideSpeed, direction),
      y: armoredActor.velocity.y,
    },
    restingFrames: 0,
  };
}

function stepShellArmoredEnemyActor(
  armoredActor: ArmoredEnemyActorState,
  levelSpec: LevelSpec,
  frameDurationSeconds: number,
  enemyPatrolSpeed: VelocityPixelsPerSecond,
  shellSlideSpeed: VelocityPixelsPerSecond,
): ArmoredEnemyActorState {
  const isSliding = armoredActor.velocity.x !== 0;

  // A resting shell counts up toward waking. Once it has sat still long enough
  // the koopa walks back out (as in the original); until then it stays put.
  if (!isSliding) {
    const nextRestingFrames = armoredActor.restingFrames + 1;
    const revived = nextRestingFrames >= shellReviveFrames;
    return {
      ...armoredActor,
      ...resolveEnemyMotionFields(
        armoredActor.position.y,
        armoredActor.velocity.y,
        armoredActor.position.x,
        revived
          ? makeEnemyPatrolVelocity(enemyPatrolSpeed, EnemyPatrolDirection.Left)
          : 0,
        frameDurationSeconds,
        levelSpec,
      ),
      behavior: revived
        ? ArmoredEnemyBehavior.Active
        : ArmoredEnemyBehavior.Shell,
      hitPoints: revived ? 2 : armoredActor.hitPoints,
      restingFrames: revived ? 0 : nextRestingFrames,
    };
  }

  const direction = makeEnemyPatrolDirectionFromVelocity(
    armoredActor.velocity.x,
  );
  const attemptedPositionX =
    armoredActor.position.x +
    makeEnemyPatrolDirectionSign(direction) *
      shellSlideSpeed *
      frameDurationSeconds;

  // Horizontal: a sliding shell bounces off walls but keeps going over ledges.
  let velocityX = armoredActor.velocity.x;
  let nextX: number = armoredActor.position.x;
  const shellActorAsPatrol: EnemyPatrolActorState = {
    entityId: armoredActor.entityId,
    position: armoredActor.position,
    velocity: { x: armoredActor.velocity.x, y: armoredActor.velocity.y },
    direction,
  };
  if (
    enemyWouldLeaveWorld(attemptedPositionX, levelSpec) ||
    enemyWouldOverlapSolidTile(
      shellActorAsPatrol,
      attemptedPositionX,
      levelSpec,
    )
  ) {
    velocityX = makeEnemyPatrolVelocity(
      shellSlideSpeed,
      reverseEnemyPatrolDirection(direction),
    );
  } else {
    nextX = attemptedPositionX;
  }

  return {
    ...armoredActor,
    ...resolveEnemyMotionFields(
      armoredActor.position.y,
      armoredActor.velocity.y,
      nextX,
      velocityX,
      frameDurationSeconds,
      levelSpec,
    ),
    // A sliding shell never wakes; hold its rest timer at zero.
    restingFrames: 0,
  };
}

function stopArmoredEnemyActor(
  armoredActor: ArmoredEnemyActorState,
): ArmoredEnemyActorState {
  return {
    ...armoredActor,
    velocity: {
      x: requireEnemyVelocity(0, "enemyMotion.armoredActors[].velocity.x"),
      y: armoredActor.velocity.y,
    },
  };
}

function stopThrowingEnemyActor(
  throwingActor: ThrowingEnemyActorState,
): ThrowingEnemyActorState {
  return {
    ...throwingActor,
    velocity: {
      x: requireEnemyVelocity(0, "enemyMotion.throwingActors[].velocity.x"),
    },
  };
}

// Hammer Bros pace a short window left/right of their spawn column while
// throwing (the "shimmy"). Vertical row-hops (the original's RNG platform
// jumps) are not yet modeled — the pacing stays on the spawn row.
const hammerBroShimmySpeedPixelsPerSecond = 24;
const hammerBroShimmyAmplitudePixels = 12;

function stepThrowingEnemyActor(
  throwingActor: ThrowingEnemyActorState,
  levelSpec: LevelSpec,
  frameDurationSeconds: number,
): ThrowingEnemyActorState {
  const originX = throwingActor.originX ?? throwingActor.position.x;
  // Head away from centre when at/over a bound, otherwise keep the current
  // heading (defaulting right from a standstill).
  const currentHeadingSign = throwingActor.velocity.x < 0 ? -1 : 1;
  const headingSign =
    throwingActor.position.x >= originX + hammerBroShimmyAmplitudePixels
      ? -1
      : throwingActor.position.x <= originX - hammerBroShimmyAmplitudePixels
        ? 1
        : currentHeadingSign;

  const attemptedPositionX =
    throwingActor.position.x +
    headingSign * hammerBroShimmySpeedPixelsPerSecond * frameDurationSeconds;
  // Never let the shimmy carry it out of the world or past its pacing window.
  const clampedPositionX = Math.min(
    originX + hammerBroShimmyAmplitudePixels,
    Math.max(originX - hammerBroShimmyAmplitudePixels, attemptedPositionX),
  );
  if (enemyWouldLeaveWorld(clampedPositionX, levelSpec)) {
    return stopThrowingEnemyActor(throwingActor);
  }

  return {
    ...throwingActor,
    position: {
      x: requireEnemyPixelPosition(
        clampedPositionX,
        "enemyMotion.throwingActors[].position.x",
      ),
      y: throwingActor.position.y,
    },
    velocity: {
      x: requireEnemyVelocity(
        headingSign * hammerBroShimmySpeedPixelsPerSecond,
        "enemyMotion.throwingActors[].velocity.x",
      ),
    },
    originX,
  };
}

// Lakitu hovers this far ahead of the player (in the player's travel
// direction) rather than homing straight onto him; while the player is roughly
// still it just tracks the player's column. The deadzone stops micro-jitter
// once it has reached its target.
const lakituLeadPixels = 60;
const lakituLeadActivateSpeedPixelsPerSecond = 8;
const lakituHoverDeadzonePixels = 3;

function stepAerialThrowingEnemyActor(
  aerialThrowingActor: AerialThrowingEnemyActorState,
  levelSpec: LevelSpec,
  frameDurationSeconds: number,
  movementConstants: MovementConstants,
  player: PlayerSimulationState,
): AerialThrowingEnemyActorState {
  // Lead ahead in the player's direction of travel; when the player is nearly
  // still, hold over the player's column (lead 0).
  const leadSign =
    player.velocity.x > lakituLeadActivateSpeedPixelsPerSecond
      ? 1
      : player.velocity.x < -lakituLeadActivateSpeedPixelsPerSecond
        ? -1
        : 0;
  const targetPositionX = player.position.x + leadSign * lakituLeadPixels;
  const offsetToTarget = targetPositionX - aerialThrowingActor.position.x;

  // Within the deadzone Lakitu has reached its lead and hovers in place.
  if (Math.abs(offsetToTarget) <= lakituHoverDeadzonePixels) {
    return stopAerialThrowingEnemyActor(aerialThrowingActor);
  }

  const directionSign = offsetToTarget > 0 ? 1 : -1;
  const maxStep =
    movementConstants.aerialThrowingEnemySpeed * frameDurationSeconds;
  const step =
    Math.abs(offsetToTarget) <= maxStep
      ? offsetToTarget
      : directionSign * maxStep;
  const attemptedPositionX = aerialThrowingActor.position.x + step;

  if (enemyWouldLeaveWorld(attemptedPositionX, levelSpec)) {
    return stopAerialThrowingEnemyActor(aerialThrowingActor);
  }

  const nextVelocityX = requireEnemyVelocity(
    directionSign * movementConstants.aerialThrowingEnemySpeed,
    "enemyMotion.aerialThrowingActors[].velocity.x",
  );

  return {
    ...aerialThrowingActor,
    position: {
      x: requireEnemyPixelPosition(
        attemptedPositionX,
        "enemyMotion.aerialThrowingActors[].position.x",
      ),
      y: aerialThrowingActor.position.y,
    },
    velocity: {
      x: nextVelocityX,
    },
  };
}

function stopAerialThrowingEnemyActor(
  aerialThrowingActor: AerialThrowingEnemyActorState,
): AerialThrowingEnemyActorState {
  return {
    ...aerialThrowingActor,
    velocity: {
      x: requireEnemyVelocity(
        0,
        "enemyMotion.aerialThrowingActors[].velocity.x",
      ),
    },
  };
}

function isPlayerInChaseDetectionWindow(
  chasingActor: ChasingEnemyActorState,
  player: PlayerSimulationState,
  movementConstants: MovementConstants,
): boolean {
  const horizontalDistance = Math.abs(
    player.position.x - chasingActor.position.x,
  );
  const verticalDistance = Math.abs(
    player.position.y - chasingActor.position.y,
  );

  return (
    horizontalDistance <= movementConstants.chasingEnemyDetectionWidthPixels &&
    verticalDistance <= movementConstants.chasingEnemyDetectionHeightPixels
  );
}

function checkEnemyMotionObstacle(
  patrolActor: EnemyPatrolActorState,
  attemptedPositionX: number,
  levelSpec: LevelSpec,
  checkFloorSupport: boolean,
): EnemyMotionObstacleCheck {
  const currentDirection = patrolActor.direction;
  const nextDirection = reverseEnemyPatrolDirection(currentDirection);

  if (
    enemyWouldOverlapSolidTile(patrolActor, attemptedPositionX, levelSpec) ||
    (checkFloorSupport &&
      !enemyWouldHaveFloorAhead(patrolActor, attemptedPositionX, levelSpec))
  ) {
    return {
      blocked: true,
      nextDirection,
    };
  }

  return {
    blocked: false,
    nextDirection: currentDirection,
  };
}

function enemyWouldLeaveWorld(
  attemptedPositionX: number,
  levelSpec: LevelSpec,
): boolean {
  return (
    attemptedPositionX < 0 ||
    attemptedPositionX + levelSpec.tileSizePixels >
      levelSpec.widthTiles * levelSpec.tileSizePixels
  );
}

function enemyWouldOverlapSolidTile(
  patrolActor: EnemyPatrolActorState,
  attemptedPositionX: number,
  levelSpec: LevelSpec,
): boolean {
  const solidTileIds = makeSolidTileIds(levelSpec);
  const tileSizePixels = levelSpec.tileSizePixels;
  const startRowIndex = Math.floor(patrolActor.position.y / tileSizePixels);
  const endRowIndex = Math.floor(
    (patrolActor.position.y + tileSizePixels - 1) / tileSizePixels,
  );

  for (const columnIndex of makeSweptEnemyLeadingColumns(
    patrolActor,
    attemptedPositionX,
    levelSpec,
  )) {
    for (let rowIndex = startRowIndex; rowIndex <= endRowIndex; rowIndex += 1) {
      if (tileIsSolid(levelSpec, solidTileIds, rowIndex, columnIndex)) {
        return true;
      }
    }
  }

  return false;
}

function enemyWouldHaveFloorAhead(
  patrolActor: EnemyPatrolActorState,
  attemptedPositionX: number,
  levelSpec: LevelSpec,
): boolean {
  const tileSizePixels = levelSpec.tileSizePixels;
  const solidTileIds = makeSolidTileIds(levelSpec);
  const floorRowIndex = Math.floor(
    (patrolActor.position.y + tileSizePixels) / tileSizePixels,
  );

  for (const columnIndex of makeSweptEnemyLeadingColumns(
    patrolActor,
    attemptedPositionX,
    levelSpec,
  )) {
    if (!tileIsSolid(levelSpec, solidTileIds, floorRowIndex, columnIndex)) {
      return false;
    }
  }

  return true;
}

function makeSweptEnemyLeadingColumns(
  patrolActor: EnemyPatrolActorState,
  attemptedPositionX: number,
  levelSpec: LevelSpec,
): readonly number[] {
  const tileSizePixels = levelSpec.tileSizePixels;

  if (patrolActor.direction === EnemyPatrolDirection.Right) {
    const previousColumnIndex = Math.floor(
      (patrolActor.position.x + tileSizePixels - 1) / tileSizePixels,
    );
    const attemptedColumnIndex = Math.floor(
      (attemptedPositionX + tileSizePixels - 1) / tileSizePixels,
    );
    const columnIndexes: number[] = [];

    for (
      let columnIndex = previousColumnIndex;
      columnIndex <= attemptedColumnIndex;
      columnIndex += 1
    ) {
      columnIndexes.push(columnIndex);
    }

    return columnIndexes;
  }

  const previousColumnIndex = Math.floor(
    patrolActor.position.x / tileSizePixels,
  );
  const attemptedColumnIndex = Math.floor(attemptedPositionX / tileSizePixels);
  const columnIndexes: number[] = [];

  for (
    let columnIndex = previousColumnIndex;
    columnIndex >= attemptedColumnIndex;
    columnIndex -= 1
  ) {
    columnIndexes.push(columnIndex);
  }

  return columnIndexes;
}

function makeEnemyPatrolDirectionSign(direction: EnemyPatrolDirection): -1 | 1 {
  switch (direction) {
    case EnemyPatrolDirection.Left:
      return -1;
    case EnemyPatrolDirection.Right:
      return 1;
    default: {
      const invalidDirection: never = direction;
      throw new Error(
        `Invalid enemy patrol direction: ${String(invalidDirection)}`,
      );
    }
  }
}

function reverseEnemyPatrolDirection(
  direction: EnemyPatrolDirection,
): EnemyPatrolDirection {
  switch (direction) {
    case EnemyPatrolDirection.Left:
      return EnemyPatrolDirection.Right;
    case EnemyPatrolDirection.Right:
      return EnemyPatrolDirection.Left;
    default: {
      const invalidDirection: never = direction;
      throw new Error(
        `Invalid enemy patrol direction: ${String(invalidDirection)}`,
      );
    }
  }
}

function makeEnemyPatrolDirectionFromVelocity(
  velocityX: VelocityPixelsPerSecond,
): EnemyPatrolDirection {
  return velocityX >= 0
    ? EnemyPatrolDirection.Right
    : EnemyPatrolDirection.Left;
}

function makeEnemyPatrolDirection(
  value: unknown,
  path: string,
): EnemyPatrolDirection {
  switch (value) {
    case "left":
      return EnemyPatrolDirection.Left;
    case "right":
      return EnemyPatrolDirection.Right;
    default:
      throw new Error(`${path} must be left or right.`);
  }
}

function makeChasingEnemyBehavior(
  value: unknown,
  path: string,
): ChasingEnemyBehavior {
  switch (value) {
    case "patrol":
      return ChasingEnemyBehavior.Patrol;
    case "chase":
      return ChasingEnemyBehavior.Chase;
    default:
      throw new Error(`${path} must be patrol or chase.`);
  }
}

function makeArmoredEnemyBehavior(
  value: unknown,
  path: string,
): ArmoredEnemyBehavior {
  switch (value) {
    case "winged":
      return ArmoredEnemyBehavior.Winged;
    case "active":
      return ArmoredEnemyBehavior.Active;
    case "shell":
      return ArmoredEnemyBehavior.Shell;
    default:
      throw new Error(`${path} must be winged, active, or shell.`);
  }
}

function makeEnemyPatrolVelocity(
  enemyPatrolSpeed: VelocityPixelsPerSecond,
  direction: EnemyPatrolDirection,
): VelocityPixelsPerSecond {
  return requireEnemyVelocity(
    makeEnemyPatrolDirectionSign(direction) * enemyPatrolSpeed,
    "enemyMotion.patrolActors[].velocity.x",
  );
}

function requireEnemyPixelPosition(
  value: unknown,
  path: string,
): PixelPosition {
  if (typeof value !== "number") {
    throw new Error(`${path} must be a number.`);
  }

  const result = makePixelPosition(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid pixel position.`);
  }

  return result.value;
}

function requireEnemyVelocity(
  value: unknown,
  path: string,
): VelocityPixelsPerSecond {
  if (typeof value !== "number") {
    throw new Error(`${path} must be a number.`);
  }

  return requireSimulationVelocity(value, path);
}
