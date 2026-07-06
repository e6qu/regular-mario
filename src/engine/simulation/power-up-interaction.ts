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

export type PowerUpInteractionState = {
  readonly collectedPowerUpEntityIds: readonly EntityId[];
};

export function makeEmptyPowerUpInteractionState(): PowerUpInteractionState {
  return {
    collectedPowerUpEntityIds: [],
  };
}

function toActorCollectionState(
  state: PowerUpInteractionState,
): ActorCollectionState {
  return {
    collectedEntityIds: state.collectedPowerUpEntityIds,
  };
}

function toPowerUpInteractionState(
  state: ActorCollectionState,
): PowerUpInteractionState {
  return {
    collectedPowerUpEntityIds: state.collectedEntityIds,
  };
}

export function assertValidPowerUpInteractionState(
  powerUpState: unknown,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[] = [],
): asserts powerUpState is PowerUpInteractionState {
  assertValidActorCollectionState(
    toActorCollectionState(powerUpState as PowerUpInteractionState),
    levelSpec,
    spawnedActors,
    ActorCollectionRole.PowerUp,
    "Collected power-up entity id",
    "powerUps.collectedPowerUpEntityIds",
  );
}

export type ResolvedPowerUpInteractionState = {
  readonly state: PowerUpInteractionState;
  readonly newlyCollectedPowerUpEntityIds: readonly EntityId[];
};

export function resolvePowerUpInteractionState(
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  spawnedActors: readonly SpawnedActor[],
  previousState: PowerUpInteractionState,
): ResolvedPowerUpInteractionState {
  const result = resolveActorCollectionState(
    player,
    levelSpec,
    spawnedActors,
    toActorCollectionState(previousState),
    ActorCollectionRole.PowerUp,
  );

  return {
    state: toPowerUpInteractionState(result.state),
    newlyCollectedPowerUpEntityIds: result.newlyCollectedEntityIds,
  };
}
