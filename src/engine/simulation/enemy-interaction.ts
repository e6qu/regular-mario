import { ActorRole } from "../domain/level-spec";
import type { EntityId } from "../domain/identifiers";
import type { LevelSpec } from "../domain/level-spec";
import {
  assertValidActorRoleEntityIdArray,
  assertValidAnyEnemyRoleEntityIdArray,
  isEnemyRole,
  makeEnemyHurtbox,
  makeActorRoleLookup,
  requireActorRole,
} from "./actor-interaction";
import type { EnemyMotionState } from "./enemy-motion";
import {
  ArmoredEnemyBehavior,
  EnemyPatrolDirection,
  requireArmoredEnemyActorState,
  requireEnemyActorState,
} from "./enemy-motion";
import type { MovementConstants } from "./movement-model";
import { VerticalMovementState } from "./movement-model";
import { playerOverlapsActorPixel } from "./player-actor-overlap";
import type { PlayerSimulationState } from "./player-state";
import type { Score } from "./game-score";

// The authentic SMB consecutive-defeat sequence: 100, 200, 400, 500, 800, 1000,
// 2000, 4000, 5000, 8000, then a 1-UP for every further defeat in the chain.
// Shared by stomp chains and kicked-shell kill chains.
const consecutiveDefeatScoreTable: readonly number[] = [
  100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000,
];

export function scoreForConsecutiveDefeat(chainCount: number): Score {
  // Beyond the table, the game awards a 1-UP instead of points (tracked
  // separately as the chain's extra-life count).
  if (chainCount > consecutiveDefeatScoreTable.length) {
    return 0 as Score;
  }
  return (consecutiveDefeatScoreTable[chainCount - 1] ?? 0) as Score;
}

// True once the chain is long enough to award a 1-UP rather than points.
export function consecutiveDefeatAwardsExtraLife(chainCount: number): boolean {
  return chainCount > consecutiveDefeatScoreTable.length;
}

export type EnemyInteractionState = {
  readonly contactedEnemyEntityIds: readonly EntityId[];
  readonly defeatedEnemyEntityIds: readonly EntityId[];
  readonly shelledEnemyEntityIds: readonly EntityId[];
  readonly nudgedShellEnemyEntityIds: readonly EntityId[];
  readonly nudgedShellDirectionByEntityId: ReadonlyMap<
    EntityId,
    EnemyPatrolDirection
  >;
  readonly currentStompChainCount: number;
  readonly cumulativeStompScore: Score;
  // Running count of 1-UPs earned from stomp chains that ran past 8000 points.
  readonly cumulativeStompChainExtraLives: number;
  readonly cumulativeInvincibilityScore: Score;
  readonly cumulativeShellKillScore: Score;
  // Length of the current kicked-shell kill chain (resets when no shell is
  // sliding) and the running count of 1-UPs it has earned past 8000 points.
  readonly currentShellKillChainCount: number;
  readonly cumulativeShellKillExtraLives: number;
  readonly cumulativeProjectileKillScore: Score;
};

export function makeEmptyEnemyInteractionState(): EnemyInteractionState {
  return {
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: [],
    shelledEnemyEntityIds: [],
    nudgedShellEnemyEntityIds: [],
    nudgedShellDirectionByEntityId: new Map(),
    currentStompChainCount: 0,
    cumulativeStompScore: 0 as Score,
    cumulativeStompChainExtraLives: 0,
    cumulativeInvincibilityScore: 0 as Score,
    cumulativeShellKillScore: 0 as Score,
    currentShellKillChainCount: 0,
    cumulativeShellKillExtraLives: 0,
    cumulativeProjectileKillScore: 0 as Score,
  };
}

export function countNewlyDefeated(
  defeatedSet: Set<EntityId>,
  candidates: readonly EntityId[],
): number {
  let count = 0;
  for (const entityId of candidates) {
    if (!defeatedSet.has(entityId)) {
      count += 1;
      defeatedSet.add(entityId);
    }
  }
  return count;
}

function hasEnemyEntityId(
  enemyEntityIds: readonly EntityId[],
  entityId: EntityId,
): boolean {
  return enemyEntityIds.includes(entityId);
}

// Spiky enemies (Spiny) cannot be stomped safely — landing on one hurts.
function isSpikyActor(levelSpec: LevelSpec, actorId: string): boolean {
  return (
    levelSpec.actorDefinitions.find(
      (definition) => definition.actorId === actorId,
    )?.spiky === true
  );
}

export function assertValidEnemyInteractionState(
  enemyState: unknown,
  levelSpec: LevelSpec,
): asserts enemyState is EnemyInteractionState {
  if (typeof enemyState !== "object" || enemyState === null) {
    throw new Error("Enemy interaction state must be an object.");
  }

  const candidate = enemyState as Readonly<Record<string, unknown>>;

  assertValidAnyEnemyRoleEntityIdArray(
    candidate.contactedEnemyEntityIds,
    levelSpec,
    "Contacted enemy entity id",
    "enemies.contactedEnemyEntityIds",
  );
  assertValidAnyEnemyRoleEntityIdArray(
    candidate.defeatedEnemyEntityIds,
    levelSpec,
    "Defeated enemy entity id",
    "enemies.defeatedEnemyEntityIds",
  );
  assertValidActorRoleEntityIdArray(
    candidate.shelledEnemyEntityIds,
    levelSpec,
    ActorRole.ArmoredEnemy,
    "Shelled enemy entity id",
    "enemies.shelledEnemyEntityIds",
  );
  assertValidActorRoleEntityIdArray(
    candidate.nudgedShellEnemyEntityIds,
    levelSpec,
    ActorRole.ArmoredEnemy,
    "Nudged shell enemy entity id",
    "enemies.nudgedShellEnemyEntityIds",
  );
  assertNoEnemyEntityIdOverlap(
    candidate.contactedEnemyEntityIds,
    candidate.defeatedEnemyEntityIds,
  );
  assertNoEnemyEntityIdOverlap(
    candidate.shelledEnemyEntityIds,
    candidate.defeatedEnemyEntityIds,
  );
  assertNoEnemyEntityIdOverlap(
    candidate.nudgedShellEnemyEntityIds,
    candidate.defeatedEnemyEntityIds,
  );
  assertNoEnemyEntityIdOverlap(
    candidate.nudgedShellEnemyEntityIds,
    candidate.shelledEnemyEntityIds,
  );

  if (
    typeof candidate.currentStompChainCount !== "number" ||
    candidate.currentStompChainCount < 0 ||
    !Number.isInteger(candidate.currentStompChainCount)
  ) {
    throw new Error(
      "enemies.currentStompChainCount must be a non-negative integer.",
    );
  }

  if (
    typeof candidate.cumulativeStompScore !== "number" ||
    candidate.cumulativeStompScore < 0
  ) {
    throw new Error(
      "enemies.cumulativeStompScore must be a non-negative number.",
    );
  }

  if (
    typeof candidate.cumulativeStompChainExtraLives !== "number" ||
    candidate.cumulativeStompChainExtraLives < 0 ||
    !Number.isInteger(candidate.cumulativeStompChainExtraLives)
  ) {
    throw new Error(
      "enemies.cumulativeStompChainExtraLives must be a non-negative integer.",
    );
  }

  if (
    typeof candidate.cumulativeInvincibilityScore !== "number" ||
    candidate.cumulativeInvincibilityScore < 0
  ) {
    throw new Error(
      "enemies.cumulativeInvincibilityScore must be a non-negative number.",
    );
  }

  if (
    typeof candidate.cumulativeShellKillScore !== "number" ||
    candidate.cumulativeShellKillScore < 0
  ) {
    throw new Error(
      "enemies.cumulativeShellKillScore must be a non-negative number.",
    );
  }

  if (
    typeof candidate.currentShellKillChainCount !== "number" ||
    candidate.currentShellKillChainCount < 0 ||
    !Number.isInteger(candidate.currentShellKillChainCount) ||
    typeof candidate.cumulativeShellKillExtraLives !== "number" ||
    candidate.cumulativeShellKillExtraLives < 0 ||
    !Number.isInteger(candidate.cumulativeShellKillExtraLives)
  ) {
    throw new Error(
      "enemies shell-kill chain counters must be non-negative integers.",
    );
  }

  if (
    typeof candidate.cumulativeProjectileKillScore !== "number" ||
    candidate.cumulativeProjectileKillScore < 0
  ) {
    throw new Error(
      "enemies.cumulativeProjectileKillScore must be a non-negative number.",
    );
  }
}

// Whether a player's hurtbox overlaps any live (not-yet-defeated) enemy. Used
// to give co-op players simple "touch an enemy and you're out" stakes without
// the full stomp/shell pipeline. Reuses the same hurtboxes and overlap test as
// the primary interaction.
export function playerContactsLiveEnemy(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  enemyMotion: EnemyMotionState,
  defeatedEnemyEntityIds: readonly EntityId[],
): boolean {
  const actorRoleLookup = makeActorRoleLookup(levelSpec);
  const defeated = new Set(defeatedEnemyEntityIds);
  for (const actor of levelSpec.actors) {
    const role = requireActorRole(actorRoleLookup, actor.actorId);
    if (!isEnemyRole(role) || defeated.has(actor.entityId)) {
      continue;
    }
    const enemyHurtbox = makeEnemyHurtbox(
      levelSpec,
      actor.actorId,
      role,
      requireEnemyActorState(enemyMotion, actor.entityId).position,
    );
    if (
      playerOverlapsActorPixel(
        player,
        { x: enemyHurtbox.x, y: enemyHurtbox.y },
        { width: enemyHurtbox.width, height: enemyHurtbox.height },
      )
    ) {
      return true;
    }
  }
  return false;
}

export function resolveEnemyInteractionState(
  previousPlayer: PlayerSimulationState,
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  enemyMotion: EnemyMotionState,
  movementConstants: MovementConstants,
  previousState: EnemyInteractionState,
): EnemyInteractionState {
  assertValidEnemyInteractionState(previousState, levelSpec);

  const actorRoleLookup = makeActorRoleLookup(levelSpec);
  const contactedEnemyEntityIds = [...previousState.contactedEnemyEntityIds];
  const defeatedEnemyEntityIds = [...previousState.defeatedEnemyEntityIds];
  const shelledEnemyEntityIds: EntityId[] = [];
  const nudgedShellDirectionByEntityId = new Map(
    previousState.nudgedShellDirectionByEntityId,
  );

  const playerJustLanded =
    previousPlayer.movement.vertical !== VerticalMovementState.Grounded &&
    player.movement.vertical === VerticalMovementState.Grounded;

  let currentStompChainCount = playerJustLanded
    ? 0
    : previousState.currentStompChainCount;
  let cumulativeStompScore = previousState.cumulativeStompScore;
  let cumulativeStompChainExtraLives =
    previousState.cumulativeStompChainExtraLives;

  for (const actor of levelSpec.actors) {
    const role = requireActorRole(actorRoleLookup, actor.actorId);

    if (!isEnemyRole(role)) {
      nudgedShellDirectionByEntityId.delete(actor.entityId);
      continue;
    }
    const enemyHurtbox = makeEnemyHurtbox(
      levelSpec,
      actor.actorId,
      role,
      requireEnemyActorState(enemyMotion, actor.entityId).position,
    );
    if (
      !playerOverlapsActorPixel(
        player,
        { x: enemyHurtbox.x, y: enemyHurtbox.y },
        { width: enemyHurtbox.width, height: enemyHurtbox.height },
      )
    ) {
      nudgedShellDirectionByEntityId.delete(actor.entityId);
      continue;
    }

    if (
      // Underwater you swim rather than stomp, so nothing is stompable — a
      // Blooper or Cheep-cheep harms you on contact (kill them with fireballs).
      !movementConstants.swimming &&
      // Piranha Plants can't be stomped — landing on one hurts the player, so
      // it falls through to the harmful-contact branch below.
      role !== ActorRole.PiranhaPlant &&
      // Spiky enemies (Spiny) hurt the player on stomp instead, so they also
      // fall through to the harmful-contact branch.
      !isSpikyActor(levelSpec, actor.actorId) &&
      isEnemyStomp(
        previousPlayer,
        player,
        requireEnemyActorState(enemyMotion, actor.entityId),
      )
    ) {
      if (role === ActorRole.ArmoredEnemy) {
        const armoredActor = requireArmoredEnemyActorState(
          enemyMotion,
          actor.entityId,
        );

        if (
          armoredActor.behavior === ArmoredEnemyBehavior.Active ||
          // A winged Paratroopa's first stomp drops its wings; the motion
          // layer demotes it to a walking koopa via the same channel.
          armoredActor.behavior === ArmoredEnemyBehavior.Winged
        ) {
          // A walking koopa retreats into a resting shell on the first stomp.
          if (!hasEnemyEntityId(shelledEnemyEntityIds, actor.entityId)) {
            shelledEnemyEntityIds.push(actor.entityId);
            // Stomping a walking koopa/paratroopa into its shell scores like any
            // stomp — 100 and up the airborne chain — as in the ROM (it isn't
            // "defeated", but it counts).
            currentStompChainCount += 1;
            cumulativeStompScore = (cumulativeStompScore +
              scoreForConsecutiveDefeat(currentStompChainCount)) as Score;
            if (consecutiveDefeatAwardsExtraLife(currentStompChainCount)) {
              cumulativeStompChainExtraLives += 1;
            }
          }

          nudgedShellDirectionByEntityId.delete(actor.entityId);
          removeEnemyEntityId(contactedEnemyEntityIds, actor.entityId);
          continue;
        }

        // As in the original, stomping a shell never destroys it: a resting
        // shell is kicked into a fast slide (which then flattens other enemies),
        // and a sliding shell is stopped dead back into a resting shell.
        if (armoredActor.velocity.x === 0) {
          nudgedShellDirectionByEntityId.set(
            actor.entityId,
            makeNudgeDirection(
              player,
              requireEnemyActorState(enemyMotion, actor.entityId),
            ),
          );
        } else if (!hasEnemyEntityId(shelledEnemyEntityIds, actor.entityId)) {
          shelledEnemyEntityIds.push(actor.entityId);
          nudgedShellDirectionByEntityId.delete(actor.entityId);
        }
        removeEnemyEntityId(contactedEnemyEntityIds, actor.entityId);
        continue;
      }

      if (!hasEnemyEntityId(defeatedEnemyEntityIds, actor.entityId)) {
        defeatedEnemyEntityIds.push(actor.entityId);
        currentStompChainCount += 1;
        cumulativeStompScore = (cumulativeStompScore +
          scoreForConsecutiveDefeat(currentStompChainCount)) as Score;
        if (consecutiveDefeatAwardsExtraLife(currentStompChainCount)) {
          cumulativeStompChainExtraLives += 1;
        }
      }
      removeEnemyEntityId(contactedEnemyEntityIds, actor.entityId);
      removeEnemyEntityId(shelledEnemyEntityIds, actor.entityId);
      nudgedShellDirectionByEntityId.delete(actor.entityId);

      continue;
    }

    if (
      role === ActorRole.ArmoredEnemy &&
      isStationaryArmoredShell(enemyMotion, actor.entityId)
    ) {
      const nudgeDirection = makeNudgeDirection(
        player,
        requireEnemyActorState(enemyMotion, actor.entityId),
      );

      if (!nudgedShellDirectionByEntityId.has(actor.entityId)) {
        nudgedShellDirectionByEntityId.set(actor.entityId, nudgeDirection);
      }

      removeEnemyEntityId(contactedEnemyEntityIds, actor.entityId);
      continue;
    }

    if (
      !hasEnemyEntityId(defeatedEnemyEntityIds, actor.entityId) &&
      !hasEnemyEntityId(contactedEnemyEntityIds, actor.entityId)
    ) {
      contactedEnemyEntityIds.push(actor.entityId);
    }
  }

  return {
    contactedEnemyEntityIds,
    defeatedEnemyEntityIds,
    shelledEnemyEntityIds,
    nudgedShellEnemyEntityIds: [...nudgedShellDirectionByEntityId.keys()],
    nudgedShellDirectionByEntityId,
    currentStompChainCount,
    cumulativeStompScore,
    cumulativeStompChainExtraLives,
    cumulativeInvincibilityScore: previousState.cumulativeInvincibilityScore,
    cumulativeShellKillScore: previousState.cumulativeShellKillScore,
    currentShellKillChainCount: previousState.currentShellKillChainCount,
    cumulativeShellKillExtraLives: previousState.cumulativeShellKillExtraLives,
    cumulativeProjectileKillScore: previousState.cumulativeProjectileKillScore,
  };
}

function isStationaryArmoredShell(
  enemyMotion: EnemyMotionState,
  entityId: EntityId,
): boolean {
  const armoredActor = requireArmoredEnemyActorState(enemyMotion, entityId);

  return (
    armoredActor.behavior === ArmoredEnemyBehavior.Shell &&
    armoredActor.velocity.x === 0
  );
}

function assertNoEnemyEntityIdOverlap(
  firstEnemyEntityIds: unknown,
  secondEnemyEntityIds: unknown,
): void {
  if (!Array.isArray(firstEnemyEntityIds)) {
    throw new Error("First enemy entity ids must be an array.");
  }

  if (!Array.isArray(secondEnemyEntityIds)) {
    throw new Error("Second enemy entity ids must be an array.");
  }

  const secondEnemyEntityIdSet = new Set(secondEnemyEntityIds);

  for (const entityId of firstEnemyEntityIds) {
    if (secondEnemyEntityIdSet.has(entityId)) {
      throw new Error(
        `Enemy entity id ${String(entityId)} cannot be in both arrays.`,
      );
    }
  }
}

function makeNudgeDirection(
  player: PlayerSimulationState,
  enemyActor: ReturnType<typeof requireEnemyActorState>,
): EnemyPatrolDirection {
  const playerCenterX = player.position.x + player.collider.width / 2;
  const enemyCenterX = enemyActor.position.x + enemyActor.velocity.x / 2;

  return playerCenterX < enemyCenterX
    ? EnemyPatrolDirection.Left
    : EnemyPatrolDirection.Right;
}

function removeEnemyEntityId(
  enemyEntityIds: EntityId[],
  entityId: EntityId,
): void {
  const entityIdIndex = enemyEntityIds.indexOf(entityId);

  if (entityIdIndex !== -1) {
    enemyEntityIds.splice(entityIdIndex, 1);
  }
}

function isEnemyStomp(
  previousPlayer: PlayerSimulationState,
  player: PlayerSimulationState,
  enemyActor: ReturnType<typeof requireEnemyActorState>,
): boolean {
  const actorTop = enemyActor.position.y;
  const previousPlayerBottom =
    previousPlayer.position.y + previousPlayer.collider.height;
  const playerBottom = player.position.y + player.collider.height;

  // The ROM keys a stomp purely on downward motion: once the boxes overlap
  // (already established before this check), any descending player defeats the
  // enemy, at any overlap depth. Detect the descent by the feet moving down
  // (playerBottom > previousPlayerBottom) rather than the post-collision
  // velocity — a fast drop onto a grounded enemy lands on the floor the same
  // frame, zeroing velocity.y. A grounded walk-in has no descent, and rising
  // into an enemy from below moves the feet up, so both stay harmful; only a
  // genuine descent onto the enemy reads as a stomp.
  return playerBottom > previousPlayerBottom && playerBottom >= actorTop;
}
