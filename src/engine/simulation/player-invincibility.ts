import type { Brand } from "../domain/brand";
import type { EntityId } from "../domain/identifiers";
import type { LevelSpec } from "../domain/level-spec";
import type { DomainResult } from "../domain/result";
import { fail, succeed } from "../domain/result";
import type { ValidationError } from "../domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../domain/validation-error";
import {
  ActorCollectionRole,
  assertValidActorCollectionState,
  resolveActorCollectionState,
  type ActorCollectionState,
} from "./actor-collection-state";
import {
  countNewlyDefeated,
  type EnemyInteractionState,
} from "./enemy-interaction";
import type { SpawnedActor } from "./interactive-block-state";
import type { Score } from "./game-score";
import { scorePerInvincibilityKill } from "./game-score";
import type { PlayerSimulationState } from "./player-state";

export type InvincibilityFrameCount = Brand<number, "InvincibilityFrameCount">;

export type PlayerInvincibilityState = {
  readonly collectedInvincibilityEntityIds: readonly EntityId[];
  readonly remainingFrames: InvincibilityFrameCount;
};

export const authoredInvincibilityFrameCount = requireInvincibilityFrameCount(
  600,
  "playerInvincibility.authoredFrameCount",
);

export function makeEmptyPlayerInvincibilityState(): PlayerInvincibilityState {
  return {
    collectedInvincibilityEntityIds: [],
    remainingFrames: 0 as InvincibilityFrameCount,
  };
}

export function makeInvincibilityFrameCount(
  value: number,
  path: string,
): DomainResult<InvincibilityFrameCount, ValidationError> {
  if (!Number.isSafeInteger(value) || value < 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.InvincibilityFrameCountInvalid,
        `${path} must be a non-negative safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as InvincibilityFrameCount);
}

export function assertValidPlayerInvincibilityState(
  playerInvincibility: unknown,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[] = [],
): asserts playerInvincibility is PlayerInvincibilityState {
  if (typeof playerInvincibility !== "object" || playerInvincibility === null) {
    throw new Error("Player invincibility state must be an object.");
  }

  const candidate = playerInvincibility as Readonly<Record<string, unknown>>;

  assertValidActorCollectionState(
    toActorCollectionState(candidate),
    levelSpec,
    spawnedActors,
    ActorCollectionRole.InvincibilityPowerUp,
    "Collected invincibility entity id",
    "playerInvincibility.collectedInvincibilityEntityIds",
  );
  requireInvincibilityFrameCount(
    candidate.remainingFrames,
    "playerInvincibility.remainingFrames",
  );
}

export function resolvePlayerInvincibilityState(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[],
  previousState: PlayerInvincibilityState,
): PlayerInvincibilityState {
  assertValidPlayerInvincibilityState(previousState, levelSpec, spawnedActors);

  const collection = resolveActorCollectionState(
    player,
    levelSpec,
    spawnedActors,
    toActorCollectionState(previousState),
    ActorCollectionRole.InvincibilityPowerUp,
  );

  return {
    collectedInvincibilityEntityIds: collection.state.collectedEntityIds,
    remainingFrames:
      collection.newlyCollectedEntityIds.length > 0
        ? authoredInvincibilityFrameCount
        : decrementInvincibilityFrameCount(previousState.remainingFrames),
  };
}

function isPlayerInvincible(
  playerInvincibility: PlayerInvincibilityState,
): boolean {
  return playerInvincibility.remainingFrames > 0;
}

export function applyInvincibilityEnemyDefeats(
  enemies: EnemyInteractionState,
  playerInvincibility: PlayerInvincibilityState,
): EnemyInteractionState {
  if (!isPlayerInvincible(playerInvincibility)) {
    return enemies;
  }

  const defeatedSet = new Set(enemies.defeatedEnemyEntityIds);
  const newlyDefeatedCount = countNewlyDefeated(
    defeatedSet,
    enemies.contactedEnemyEntityIds,
  );

  const survivingShelledEnemyEntityIds = enemies.shelledEnemyEntityIds.filter(
    (entityId) => !defeatedSet.has(entityId),
  );
  const survivingNudgedShellEnemyEntityIds =
    enemies.nudgedShellEnemyEntityIds.filter(
      (entityId) => !defeatedSet.has(entityId),
    );
  const survivingNudgedShellDirections = new Map(
    [...enemies.nudgedShellDirectionByEntityId].filter(
      ([entityId]) => !defeatedSet.has(entityId),
    ),
  );

  return {
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: [...defeatedSet],
    shelledEnemyEntityIds: survivingShelledEnemyEntityIds,
    nudgedShellEnemyEntityIds: survivingNudgedShellEnemyEntityIds,
    nudgedShellDirectionByEntityId: survivingNudgedShellDirections,
    currentStompChainCount: enemies.currentStompChainCount,
    cumulativeStompScore: enemies.cumulativeStompScore,
    cumulativeStompChainExtraLives: enemies.cumulativeStompChainExtraLives,
    cumulativeInvincibilityScore: (enemies.cumulativeInvincibilityScore +
      newlyDefeatedCount * scorePerInvincibilityKill) as Score,
    cumulativeShellKillScore: enemies.cumulativeShellKillScore,
    currentShellKillChainCount: enemies.currentShellKillChainCount,
    cumulativeShellKillExtraLives: enemies.cumulativeShellKillExtraLives,
    cumulativeProjectileKillScore: enemies.cumulativeProjectileKillScore,
    aerialThrowerDefeatFrameByEntityId: {},
  };
}

function decrementInvincibilityFrameCount(
  value: InvincibilityFrameCount,
): InvincibilityFrameCount {
  if (value === 0) {
    return value;
  }

  return (value - 1) as InvincibilityFrameCount;
}

function toActorCollectionState(
  state: Readonly<Record<string, unknown>> | PlayerInvincibilityState,
): ActorCollectionState {
  return {
    collectedEntityIds: state.collectedInvincibilityEntityIds as EntityId[],
  };
}

function requireInvincibilityFrameCount(
  value: unknown,
  path: string,
): InvincibilityFrameCount {
  if (typeof value !== "number") {
    throw new Error(`${path} must be a number.`);
  }

  const result = makeInvincibilityFrameCount(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid invincibility frame count.`);
  }

  return result.value;
}
