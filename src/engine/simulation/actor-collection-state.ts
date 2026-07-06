import { ActorRole } from "../domain/level-spec";
import type { EntityId } from "../domain/identifiers";
import type { LevelSpec } from "../domain/level-spec";
import type { PlayerSimulationState } from "./player-state";
import {
  assertValidActorRoleEntityIdArray,
  makeActorRoleLookup,
  playerOverlapsLevelActor,
  requireActorRole,
} from "./actor-interaction";
import {
  SpawnedActorCollectionMode,
  type SpawnedActor,
} from "./interactive-block-state";
import { playerOverlapsActorPixel } from "./player-actor-overlap";

export enum ActorCollectionRole {
  Coin = "coin",
  Item = "item",
  PowerUp = "power-up",
  ExtraLife = "extra-life",
  InvincibilityPowerUp = "invincibility-power-up",
}

export type ActorCollectionState = {
  readonly collectedEntityIds: readonly EntityId[];
};

function toActorRole(role: ActorCollectionRole): ActorRole {
  switch (role) {
    case ActorCollectionRole.Coin:
      return ActorRole.Coin;
    case ActorCollectionRole.Item:
      return ActorRole.Item;
    case ActorCollectionRole.PowerUp:
      return ActorRole.PowerUp;
    case ActorCollectionRole.ExtraLife:
      return ActorRole.ExtraLife;
    case ActorCollectionRole.InvincibilityPowerUp:
      return ActorRole.InvincibilityPowerUp;
    default: {
      const invalidRole: never = role;
      throw new Error(`Invalid actor collection role: ${String(invalidRole)}`);
    }
  }
}

export function assertValidActorCollectionState(
  collectionState: unknown,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[],
  targetRole: ActorCollectionRole,
  entityLabel: string,
  entityIdsPath: string,
): asserts collectionState is ActorCollectionState {
  if (typeof collectionState !== "object" || collectionState === null) {
    throw new Error("Actor collection state must be an object.");
  }

  const candidate = collectionState as Readonly<Record<string, unknown>>;
  const targetActorRole = toActorRole(targetRole);
  const spawnedEntityIds = spawnedActors
    .filter((spawnedActor) => spawnedActor.role === targetActorRole)
    .map((spawnedActor) => spawnedActor.entityId);

  assertValidActorRoleEntityIdArray(
    candidate.collectedEntityIds,
    levelSpec,
    targetActorRole,
    entityLabel,
    entityIdsPath,
    spawnedEntityIds,
  );
}

function hasCollectedEntityId(
  collectedEntityIds: readonly EntityId[],
  entityId: EntityId,
): boolean {
  return collectedEntityIds.includes(entityId);
}

export type ResolvedActorCollectionState = {
  readonly state: ActorCollectionState;
  readonly newlyCollectedEntityIds: readonly EntityId[];
};

export function resolveActorCollectionState(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[],
  previousState: ActorCollectionState,
  targetRole: ActorCollectionRole,
): ResolvedActorCollectionState {
  assertValidActorCollectionState(
    previousState,
    levelSpec,
    spawnedActors,
    targetRole,
    "Collected entity id",
    "actorCollection.collectedEntityIds",
  );

  const actorRoleLookup = makeActorRoleLookup(levelSpec);
  const collectedEntityIds = [...previousState.collectedEntityIds];
  const newlyCollectedEntityIds: EntityId[] = [];
  const targetActorRole = toActorRole(targetRole);

  function recordCollection(entityId: EntityId): void {
    if (!hasCollectedEntityId(collectedEntityIds, entityId)) {
      collectedEntityIds.push(entityId);
      newlyCollectedEntityIds.push(entityId);
    }
  }

  for (const actor of levelSpec.actors) {
    const role = requireActorRole(actorRoleLookup, actor.actorId);

    if (
      role === targetActorRole &&
      playerOverlapsLevelActor(player, levelSpec, actor)
    ) {
      recordCollection(actor.entityId);
    }
  }

  for (const spawnedActor of spawnedActors) {
    if (
      spawnedActor.role === targetActorRole &&
      spawnedActor.active &&
      (spawnedActor.collectionMode === SpawnedActorCollectionMode.OnSpawn ||
        playerOverlapsActorPixel(player, spawnedActor.position, {
          width: levelSpec.tileSizePixels,
          height: levelSpec.tileSizePixels,
        }))
    ) {
      recordCollection(spawnedActor.entityId);
    }
  }

  return {
    state: {
      collectedEntityIds,
    },
    newlyCollectedEntityIds,
  };
}
