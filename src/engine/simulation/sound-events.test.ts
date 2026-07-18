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

function withPrimary(
  state: SimulationState,
  updates: Partial<SimulationState["players"][0]>,
): SimulationState {
  return {
    ...state,
    players: [{ ...state.players[0], ...updates }, ...state.players.slice(1)],
  };
}

function withVertical(
  state: SimulationState,
  vertical: SimulationState["players"][0]["player"]["movement"]["vertical"],
): SimulationState {
  return withPrimary(state, {
    player: {
      ...state.players[0].player,
      movement: {
        ...state.players[0].player.movement,
        vertical,
      },
    },
  });
}

function withVelocityY(
  state: SimulationState,
  velocityY: number,
): SimulationState {
  return withPrimary(state, {
    player: {
      ...state.players[0].player,
      velocity: {
        ...state.players[0].player.velocity,
        y: velocityY as SimulationState["players"][0]["player"]["velocity"]["y"],
      },
    },
  });
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

function withBrokenBlock(state: SimulationState): SimulationState {
  return {
    ...state,
    breakableBlocks: {
      ...state.breakableBlocks,
      brokenBlockTilePositions: [
        {
          x: 5,
          y: 7,
        } as unknown as SimulationState["breakableBlocks"]["brokenBlockTilePositions"][number],
      ],
    },
  };
}

function withOutcome(
  state: SimulationState,
  kind: SimulationState["players"][0]["outcome"]["kind"],
): SimulationState {
  if (kind === PlayerOutcomeKind.Active) {
    return withPrimary(state, { outcome: { kind: PlayerOutcomeKind.Active } });
  }
  if (kind === PlayerOutcomeKind.Defeated) {
    return withPrimary(state, {
      outcome: {
        kind: PlayerOutcomeKind.Defeated,
        reason: PlayerDefeatReason.EnemyContact,
      },
    });
  }
  return withPrimary(state, {
    outcome: {
      kind: PlayerOutcomeKind.Finished,
      reason: PlayerFinishReason.GoalContact,
    },
  });
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

  it("emits a spring-bounce event once when a fall snaps to the spring launch speed", () => {
    const falling = withVelocityY(baseState(), 600);
    const launched = withVelocityY(
      withVertical(baseState(), VerticalMovementState.Jumping),
      0 - initialMovementConstants.springLaunchSpeed,
    );

    const events = resolveSoundEvents(falling, launched);
    expect(
      events.filter((event) => event === SoundEvent.SpringBounce),
    ).toHaveLength(1);
  });

  it("emits a spring-bounce event for the boosted held-jump launch", () => {
    const falling = withVelocityY(baseState(), 600);
    const launched = withVelocityY(
      withVertical(baseState(), VerticalMovementState.Jumping),
      0 - initialMovementConstants.springBoostLaunchSpeed,
    );

    expect(resolveSoundEvents(falling, launched)).toContain(
      SoundEvent.SpringBounce,
    );
  });

  it("does not emit a spring-bounce event for a ground jump launch", () => {
    const launched = withVelocityY(
      withVertical(baseState(), VerticalMovementState.Jumping),
      0 - initialMovementConstants.springLaunchSpeed,
    );

    const events = resolveSoundEvents(baseState(), launched);
    expect(events).toContain(SoundEvent.Jump);
    expect(events).not.toContain(SoundEvent.SpringBounce);
  });

  it("does not re-emit a spring-bounce event while already rising", () => {
    const rising = withVelocityY(
      withVertical(baseState(), VerticalMovementState.Jumping),
      0 - initialMovementConstants.springLaunchSpeed,
    );

    expect(resolveSoundEvents(rising, rising)).not.toContain(
      SoundEvent.SpringBounce,
    );
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
    const bonkedState: SimulationState = withPrimary(baseState(), {
      reaction: {
        kind: PlayerReactionKind.HeadBonk,
        remainingFrames: headBonkReactionFrames,
      },
    });

    expect(resolveSoundEvents(baseState(), bonkedState)).toContain(
      SoundEvent.HeadBonk,
    );
  });

  it("emits a block-break event when a breakable tile is newly broken", () => {
    expect(
      resolveSoundEvents(baseState(), withBrokenBlock(baseState())),
    ).toContain(SoundEvent.BlockBreak);
  });

  it("does not emit a block-break event when nothing new breaks", () => {
    const state = withBrokenBlock(baseState());
    expect(resolveSoundEvents(state, state)).not.toContain(
      SoundEvent.BlockBreak,
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
