import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { finishRouteLevelInput } from "../levels/finish-route-level";
import { firstAuthoredLevelSpec } from "./level-test-support";
import { PlayerOutcomeKind } from "./player-outcome";
import { HorizontalInput, type SimulationInputCommand } from "./input-command";
import { initialMovementConstants } from "./movement-model";
import { makeInitialPlayerVitalityState } from "./player-vitality";
import {
  makeInitialSimulationState,
  makeInitialSimulationStateWithPlayerVitality,
  maxSimulationPlayers,
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

// The uniform players array is the sole player store: players[0] is player one,
// players[1..] the same-screen co-op players.
describe("simulation players array", () => {
  it("supports up to sixteen players", () => {
    expect(maxSimulationPlayers).toBe(16);
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

  it("removes a co-op player that has fallen into a pit (dead until level ends)", () => {
    const base = twoPlayerState();
    const stepped = stepSimulation(
      withCoopPlayerAt(base, Number(base.players[1]!.player.position.x), 10000),
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );
    expect(stepped.players).toHaveLength(1);
  });

  it("removes a co-op player that touches an enemy", () => {
    // firstAuthored has an enemy (beetle-1) at pixel (96, 64); put a co-op
    // player right on it.
    const base = twoPlayerState();
    const stepped = stepSimulation(
      withCoopPlayerAt(base, 96, 56),
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );
    expect(stepped.players).toHaveLength(1);
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
      withCoopPlayerAt(base, 8 * 16, Number(base.players[1]!.player.position.y)),
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
