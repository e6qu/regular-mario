import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { finishRouteLevelInput } from "../levels/finish-route-level";
import { powerUpRouteLevelInput } from "../levels/power-up-route-level";
import { firstAuthoredLevelSpec } from "./level-test-support";
import { PlayerOutcomeKind } from "./player-outcome";
import { HorizontalInput, type SimulationInputCommand } from "./input-command";
import { initialMovementConstants } from "./movement-model";
import {
  makeInitialPlayerVitalityState,
  PlayerVitalityKind,
} from "./player-vitality";
import {
  appendSimulationPlayerAt,
  makeInitialSimulationState,
  makeInitialSimulationStateWithPlayerVitality,
  maxSimulationPlayers,
  reviveSimulationPlayerAt,
  type SimulationState,
} from "./simulation-state";
import { stepSimulation } from "./step-simulation";
import {
  nominalSixtyHertzFrameDurationMilliseconds,
  requireSimulationPixelPosition,
} from "./simulation-units";

function initialState(): SimulationState {
  const result = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
  );
  if (!result.ok) {
    throw new Error("expected a valid initial simulation state");
  }
  return result.value;
}

function runRight(): SimulationInputCommand {
  return {
    horizontal: HorizontalInput.Right,
    jumpPressed: true,
    runHeld: false,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
}

function twoPlayerState(): SimulationState {
  const result = makeInitialSimulationStateWithPlayerVitality(
    nominalSixtyHertzFrameDurationMilliseconds,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
    makeInitialPlayerVitalityState(),
    2,
  );
  if (!result.ok) {
    throw new Error("expected a valid two-player state");
  }
  return result.value;
}

function neutral(): SimulationInputCommand {
  return {
    horizontal: HorizontalInput.Neutral,
    jumpPressed: false,
    runHeld: false,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
}

function expectCoopPlayerDefeatedAt(x: number, y: number): void {
  const base = afterSpawnInvincibility(twoPlayerState());
  const stepped = stepSimulation(
    withCoopPlayerAt(base, x, y),
    neutral(),
    initialMovementConstants,
    firstAuthoredLevelSpec(),
    [neutral()],
  );
  expect(stepped.players).toHaveLength(2);
  expect(stepped.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Defeated);
}

// The uniform players array is the sole player store: players[0] is player one,
// players[1..] the same-screen co-op players.
describe("simulation players array", () => {
  // Time ran out for slot 0 alone. The level clock was only read on the primary
  // player's path, so when it expired the creator died and every co-op member
  // played on for ever — which is how a party stuck in World 1-1's staircase
  // notch was still alive at frame 15,993, long past a 400-unit timer, unable
  // to finish the run and unable to end it.
  it("defeats every player when the level clock runs out, not only slot 0", () => {
    const result = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      3,
    );
    if (!result.ok) {
      throw new Error("expected a valid initial simulation state");
    }
    // One frame from expiry, so the next step is the one that runs it out.
    const state: SimulationState = {
      ...result.value,
      levelTimer: { ...result.value.levelTimer, remainingFrames: 1 },
    } as SimulationState;

    const stepped = stepSimulation(
      state,
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral(), neutral()],
    );

    expect(
      stepped.players.map((runtime) => runtime.outcome.kind),
      "the whole party is out of time, not just the creator",
    ).toEqual([
      PlayerOutcomeKind.Defeated,
      PlayerOutcomeKind.Defeated,
      PlayerOutcomeKind.Defeated,
    ]);
  });

  it("supports up to sixteen players", () => {
    expect(maxSimulationPlayers).toBe(16);
  });

  it("appends a joining player at an authoritative in-screen position", () => {
    const base = twoPlayerState();
    const spawnPosition = {
      x: requireSimulationPixelPosition(120, "spawn.x"),
      y: requireSimulationPixelPosition(64, "spawn.y"),
    };
    const joined = appendSimulationPlayerAt(base, spawnPosition);
    expect(joined.players).toHaveLength(3);
    expect(joined.players[2]!.player.position).toEqual(spawnPosition);
  });

  it("revives a retained slot at an authoritative checkpoint without resetting the world", () => {
    const base = twoPlayerState();
    const checkpoint = {
      x: requireSimulationPixelPosition(192, "checkpoint.x"),
      y: requireSimulationPixelPosition(64, "checkpoint.y"),
    };
    const defeated = {
      ...base,
      players: [
        base.players[0],
        {
          ...base.players[1]!,
          outcome: { kind: "defeated", reason: "pit-contact" },
        },
      ] as SimulationState["players"],
    };
    const revived = reviveSimulationPlayerAt(defeated, 1, checkpoint);
    expect(revived.players[0]).toBe(defeated.players[0]);
    expect(revived.players[1]!.player.position).toEqual(checkpoint);
    expect(revived.players[1]!.outcome).toEqual({ kind: "active" });
  });

  it("seeds additional co-op players beside the primary from the player count", () => {
    const result = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      3,
    );
    if (!result.ok) {
      throw new Error("expected a valid initial state");
    }
    const state = result.value;
    expect(state.players).toHaveLength(3);
    // Each additional player spawns further right than the one before it.
    expect(state.players[1]!.player.position.x).toBeGreaterThan(
      state.players[0].player.position.x,
    );
    expect(state.players[2]!.player.position.x).toBeGreaterThan(
      state.players[1]!.player.position.x,
    );
  });

  it("clamps the player count to sixteen", () => {
    const result = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      100,
    );
    if (!result.ok) {
      throw new Error("expected a valid initial state");
    }
    expect(result.value.players).toHaveLength(maxSimulationPlayers);
  });

  it("has a single full-runtime player at the initial state", () => {
    const state = initialState();
    expect(state.players).toHaveLength(1);
    const runtime = state.players[0];
    expect(runtime.player).toBeDefined();
    expect(runtime.vitality).toBeDefined();
    expect(runtime.invincibility).toBeDefined();
    expect(runtime.outcome).toBeDefined();
    expect(runtime.reaction).toBeDefined();
  });

  it("advances the primary player each step", () => {
    const before = initialState();
    const after = stepSimulation(
      before,
      runRight(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
    );
    expect(after.players).toHaveLength(1);
    expect(after.players[0].player).not.toBe(before.players[0].player);
  });

  it("steps a co-op player with its own input, leaving a non-overlapping primary untouched", () => {
    const base = initialState();
    // Seed a co-op player at its own (non-overlapping) spawn beside the primary.
    const withCoop = twoPlayerState();

    const solo = stepSimulation(
      base,
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
    );
    const coop = stepSimulation(
      withCoop,
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );

    // With the players apart, the primary is identical whether or not co-op
    // players are present.
    expect(coop.players[0].player).toEqual(solo.players[0].player);
    // The uniform array now holds both players.
    expect(coop.players).toHaveLength(2);
  });

  it("keeps a pit-defeated co-op player in a stable spectator slot", () => {
    const base = afterSpawnInvincibility(twoPlayerState());
    expectCoopPlayerDefeatedAt(
      Number(base.players[1]!.player.position.x),
      10000,
    );
  });

  it("keeps an enemy-defeated co-op player in a stable spectator slot", () => {
    // firstAuthored has an enemy (beetle-1) at pixel (96, 64). Level with it,
    // not above it: that is a side contact, which damages. Dropping onto it
    // from above is a stomp now that co-op players interact with enemies at
    // all, and is covered by its own test below.
    expectCoopPlayerDefeatedAt(96, 64);
  });

  // Co-op players used to pass straight through enemies: enemy interaction ran
  // for slot 0 only, so the identical player state stomping the identical enemy
  // defeated it from slot 0 and did nothing from any other slot. Everyone but
  // the host was unable to stomp anything.
  it("lets a co-op player stomp an enemy, and rebounds them off it", () => {
    const base = afterSpawnInvincibility(twoPlayerState());
    const stepped = stepSimulation(
      withCoopPlayerAt(base, 96, 56),
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );

    expect(stepped.enemies.defeatedEnemyEntityIds).toContain("beetle-1");
    // Stomping is not dying: the stomper stays in play...
    expect(stepped.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Active);
    // ...and bounces, exactly as slot 0 does.
    expect(Number(stepped.players[1]!.player.velocity.y)).toBeLessThan(0);
  });

  // Coins and power-ups reached the primary alone: a co-op player walked through
  // a mushroom without collecting it and stayed small for the whole level —
  // unable to break a brick, and killed by any contact.
  it("lets a co-op player collect a power-up and grow from it", () => {
    const levelResult = makeLevelSpec(powerUpRouteLevelInput);
    if (!levelResult.ok) {
      throw new Error("expected a valid power-up route level");
    }
    const level = levelResult.value;
    const stateResult = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      level,
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      2,
    );
    if (!stateResult.ok) {
      throw new Error("expected a valid two-player state");
    }
    // The power-up sits at tile (4, 4); stand the co-op player on it while the
    // primary stays at spawn, so only the co-op player can have collected it.
    const onThePowerUp = withCoopPlayerAt(stateResult.value, 4 * 16, 4 * 16);
    expect(onThePowerUp.players[1]!.vitality.kind).toBe(
      PlayerVitalityKind.Small,
    );

    const stepped = stepSimulation(
      onThePowerUp,
      neutral(),
      initialMovementConstants,
      level,
      [neutral()],
    );

    expect(stepped.players[1]!.vitality.kind).not.toBe(
      PlayerVitalityKind.Small,
    );
    // The primary did not silently grow from somebody else's mushroom.
    expect(stepped.players[0].vitality.kind).toBe(PlayerVitalityKind.Small);
  });

  it("keeps a co-op player alive during the spawn-invincibility window", () => {
    // The same on-the-enemy placement, but stepped on an early frame: the bot
    // is invincible for the first 10 seconds, so it survives.
    const base = twoPlayerState();
    const stepped = stepSimulation(
      withCoopPlayerAt(base, 96, 56),
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );
    expect(stepped.players).toHaveLength(2);
  });

  it("finishes the level when any player (a co-op player) reaches the goal", () => {
    const levelResult = makeLevelSpec(finishRouteLevelInput);
    if (!levelResult.ok) {
      throw new Error("expected a valid finish-route level");
    }
    const level = levelResult.value;
    const stateResult = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      level,
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      2,
    );
    if (!stateResult.ok) {
      throw new Error("expected a valid two-player state");
    }
    const base = stateResult.value;
    // Put the co-op player on the flagpole column (col 8).
    const stepped = stepSimulation(
      withCoopPlayerAt(
        base,
        8 * 16,
        Number(base.players[1]!.player.position.y),
      ),
      neutral(),
      initialMovementConstants,
      level,
      [neutral()],
    );
    expect(stepped.players[0].outcome.kind).toBe(PlayerOutcomeKind.Finished);
  });

  it("advances a co-op player's position across frames from its input", () => {
    let state = twoPlayerState();
    const startX = Number(state.players[1]!.player.position.x);
    for (let frame = 0; frame < 15; frame += 1) {
      state = stepSimulation(
        state,
        neutral(),
        initialMovementConstants,
        firstAuthoredLevelSpec(),
        [runRight()],
      );
    }
    expect(Number(state.players[1]!.player.position.x)).toBeGreaterThan(
      Number(startX),
    );
  });
});

// Advance `base`'s clock past the 10-second co-op spawn-invincibility window so
// the next step applies the normal death rules to the bots.
function afterSpawnInvincibility(base: SimulationState): SimulationState {
  return {
    ...base,
    clock: {
      ...base.clock,
      frameIndex: 700 as SimulationState["clock"]["frameIndex"],
    },
  };
}

// Return a copy of `base` with its single co-op player moved to (x, y).
function withCoopPlayerAt(
  base: SimulationState,
  x: number,
  y: number,
): SimulationState {
  const coop = base.players[1]!;
  return {
    ...base,
    players: [
      base.players[0],
      {
        ...coop,
        player: {
          ...coop.player,
          position: {
            x: requireSimulationPixelPosition(x, "player.position.x"),
            y: requireSimulationPixelPosition(y, "player.position.y"),
          },
        },
      },
    ],
  };
}
