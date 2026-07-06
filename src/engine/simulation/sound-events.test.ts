import { PlayerDefeatReason, PlayerFinishReason } from "./player-outcome";
import { describe, expect, it } from "vitest";

import { makeEntityId } from "../domain/identifiers";
import {
  initialMovementConstants,
  VerticalMovementState,
} from "./movement-model";
import { PlayerOutcomeKind } from "./player-outcome";
import {
  makeInitialSimulationState,
  type SimulationState,
} from "./simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "./simulation-units";
import { makeLevelSpec } from "../domain/level-spec";
import { firstAuthoredLevelInput } from "../levels/first-authored-level";
import { SoundEvent, resolveSoundEvents } from "./sound-events";
import { headBonkReactionFrames, PlayerReactionKind } from "./player-reaction";

function entityId(value: string) {
  const result = makeEntityId(value, "test.entityId");
  if (!result.ok) {
    throw new Error("Expected valid test entity id.");
  }
  return result.value;
}

function baseState(): SimulationState {
  const result = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    makeRequiredLevelSpec(),
    initialMovementConstants,
  );

  if (!result.ok) {
    throw new Error("Expected valid base simulation state.");
  }

  return result.value;
}

function makeRequiredLevelSpec() {
  const result = makeLevelSpec(firstAuthoredLevelInput);
  if (!result.ok) {
    throw new Error("Expected first authored level to validate.");
  }
  return result.value;
}

function withVertical(
  state: SimulationState,
  vertical: SimulationState["player"]["movement"]["vertical"],
): SimulationState {
  return {
    ...state,
    player: {
      ...state.player,
      movement: {
        ...state.player.movement,
        vertical,
      },
    },
  };
}

function withCollectedItem(state: SimulationState): SimulationState {
  return {
    ...state,
    collectibles: {
      collectedCoinEntityIds: [],
      collectedItemEntityIds: [entityId("shard-1")],
      collectedExtraLifeEntityIds: [],
    },
  };
}

function withCollectedPowerUp(state: SimulationState): SimulationState {
  return {
    ...state,
    powerUps: {
      collectedPowerUpEntityIds: [entityId("spark-1")],
    },
  };
}

function withDefeatedEnemy(state: SimulationState): SimulationState {
  return {
    ...state,
    enemies: {
      ...state.enemies,
      defeatedEnemyEntityIds: [entityId("beetle-1")],
    },
  };
}

function withOutcome(
  state: SimulationState,
  kind: SimulationState["playerOutcome"]["kind"],
): SimulationState {
  if (kind === PlayerOutcomeKind.Active) {
    return { ...state, playerOutcome: { kind: PlayerOutcomeKind.Active } };
  }
  if (kind === PlayerOutcomeKind.Defeated) {
    return {
      ...state,
      playerOutcome: {
        kind: PlayerOutcomeKind.Defeated,
        reason: PlayerDefeatReason.EnemyContact,
      },
    };
  }
  return {
    ...state,
    playerOutcome: {
      kind: PlayerOutcomeKind.Finished,
      reason: PlayerFinishReason.GoalContact,
    },
  };
}

function withNewProjectile(state: SimulationState): SimulationState {
  return {
    ...state,
    projectiles: {
      projectiles: [
        {
          id: "projectile-1-0" as string,
          position: { x: 0 as number, y: 0 as number },
          velocity: { x: 0 as number, y: 0 as number },
          width: 6,
          height: 6,
          active: true,
          remainingLifetimeFrames: 120 as number,
        },
      ],
      cooldownRemainingFrames: 20 as number,
    } as unknown as SimulationState["projectiles"],
  };
}

describe("resolveSoundEvents", () => {
  it("emits a projectile-fire event when a new projectile appears", () => {
    expect(
      resolveSoundEvents(baseState(), withNewProjectile(baseState())),
    ).toContain(SoundEvent.ProjectileFire);
  });

  it("emits no events when nothing changes", () => {
    const state = baseState();
    expect(resolveSoundEvents(state, state)).toEqual([]);
  });

  it("emits a jump event when the player launches", () => {
    expect(
      resolveSoundEvents(
        baseState(),
        withVertical(baseState(), VerticalMovementState.Jumping),
      ),
    ).toContain(SoundEvent.Jump);
  });

  it("emits a land event when the player becomes grounded from airborne", () => {
    const airborne = withVertical(baseState(), VerticalMovementState.Falling);
    expect(resolveSoundEvents(airborne, baseState())).toContain(
      SoundEvent.Land,
    );
  });

  it("does not emit a land event when already grounded", () => {
    expect(resolveSoundEvents(baseState(), baseState())).not.toContain(
      SoundEvent.Land,
    );
  });

  it("emits a collect event when an item is newly collected", () => {
    expect(
      resolveSoundEvents(baseState(), withCollectedItem(baseState())),
    ).toContain(SoundEvent.Collect);
  });

  it("emits a power-up event when a power-up is newly collected", () => {
    expect(
      resolveSoundEvents(baseState(), withCollectedPowerUp(baseState())),
    ).toContain(SoundEvent.PowerUp);
  });

  it("emits a stomp event when an enemy is newly defeated", () => {
    expect(
      resolveSoundEvents(baseState(), withDefeatedEnemy(baseState())),
    ).toContain(SoundEvent.Stomp);
  });

  it("emits an enemy-shot event and not a stomp for a projectile kill", () => {
    const shotState: SimulationState = {
      ...baseState(),
      enemies: {
        ...baseState().enemies,
        defeatedEnemyEntityIds: [entityId("beetle-1")],
        cumulativeProjectileKillScore:
          200 as SimulationState["enemies"]["cumulativeProjectileKillScore"],
      },
    };

    const events = resolveSoundEvents(baseState(), shotState);
    expect(events).toContain(SoundEvent.EnemyShot);
    expect(events).not.toContain(SoundEvent.Stomp);
  });

  it("emits a head-bonk event when the player starts a head-bonk reaction", () => {
    const bonkedState: SimulationState = {
      ...baseState(),
      playerReaction: {
        kind: PlayerReactionKind.HeadBonk,
        remainingFrames: headBonkReactionFrames,
      },
    };

    expect(resolveSoundEvents(baseState(), bonkedState)).toContain(
      SoundEvent.HeadBonk,
    );
  });

  it("emits a defeat event when the outcome becomes defeated", () => {
    expect(
      resolveSoundEvents(
        baseState(),
        withOutcome(baseState(), PlayerOutcomeKind.Defeated),
      ),
    ).toContain(SoundEvent.Defeat);
  });

  it("emits a finish event when the outcome becomes finished", () => {
    expect(
      resolveSoundEvents(
        baseState(),
        withOutcome(baseState(), PlayerOutcomeKind.Finished),
      ),
    ).toContain(SoundEvent.Finish);
  });
});
