import type { EntityId } from "../domain/identifiers";
import type { LevelSpec } from "../domain/level-spec";
import {
  ActorCollectionRole,
  assertValidActorCollectionState,
  resolveActorCollectionState,
  type ActorCollectionState,
} from "./actor-collection-state";
import type { SpawnedActor } from "./interactive-block-state";
import type { PlayerSimulationState } from "./player-state";

export type CollectibleInteractionState = {
  readonly collectedCoinEntityIds: readonly EntityId[];
  readonly collectedItemEntityIds: readonly EntityId[];
  readonly collectedExtraLifeEntityIds: readonly EntityId[];
};

export function makeEmptyCollectibleInteractionState(): CollectibleInteractionState {
  return {
    collectedCoinEntityIds: [],
    collectedItemEntityIds: [],
    collectedExtraLifeEntityIds: [],
  };
}

function toActorCollectionState(
  state: CollectibleInteractionState,
): ActorCollectionState {
  return {
    collectedEntityIds: state.collectedItemEntityIds,
  };
}

function toExtraLifeActorCollectionState(
  state: CollectibleInteractionState,
): ActorCollectionState {
  return {
    collectedEntityIds: state.collectedExtraLifeEntityIds,
  };
}

export function assertValidCollectibleInteractionState(
  collectibleState: unknown,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[] = [],
): asserts collectibleState is CollectibleInteractionState {
  assertValidActorCollectionState(
    {
      collectedEntityIds: (collectibleState as CollectibleInteractionState)
        .collectedCoinEntityIds,
    },
    levelSpec,
    spawnedActors,
    ActorCollectionRole.Coin,
    "Collected coin entity id",
    "collectibles.collectedCoinEntityIds",
  );
  assertValidActorCollectionState(
    toActorCollectionState(collectibleState as CollectibleInteractionState),
    levelSpec,
    spawnedActors,
    ActorCollectionRole.Item,
    "Collected item entity id",
    "collectibles.collectedItemEntityIds",
  );
  assertValidActorCollectionState(
    toExtraLifeActorCollectionState(
      collectibleState as CollectibleInteractionState,
    ),
    levelSpec,
    spawnedActors,
    ActorCollectionRole.ExtraLife,
    "Collected extra-life entity id",
    "collectibles.collectedExtraLifeEntityIds",
  );
}

export function resolveCollectibleInteractionState(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[],
  previousState: CollectibleInteractionState,
): CollectibleInteractionState {
  const coinState = resolveActorCollectionState(
    player,
    levelSpec,
    spawnedActors,
    { collectedEntityIds: previousState.collectedCoinEntityIds },
    ActorCollectionRole.Coin,
  );
  const itemState = resolveActorCollectionState(
    player,
    levelSpec,
    spawnedActors,
    toActorCollectionState(previousState),
    ActorCollectionRole.Item,
  );
  const extraLifeState = resolveActorCollectionState(
    player,
    levelSpec,
    spawnedActors,
    toExtraLifeActorCollectionState(previousState),
    ActorCollectionRole.ExtraLife,
  );

  return {
    collectedCoinEntityIds: coinState.state.collectedEntityIds,
    collectedItemEntityIds: itemState.state.collectedEntityIds,
    collectedExtraLifeEntityIds: extraLifeState.state.collectedEntityIds,
  };
}
