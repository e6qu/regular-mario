import { describe, expect, it } from "vitest";

import { firstAuthoredLevelSpec } from "./level-test-support";
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

// The N-player co-op migration exposes a uniform `players` array derived from the
// (still authoritative) singular player slices. For a single player it must
// always be length 1 and stay perfectly in sync with those slices.
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
    expect(state.coopPlayers).toHaveLength(2);
    // Each additional player spawns further right than the primary.
    expect(state.coopPlayers![0]!.position.x).toBeGreaterThan(
      state.player.position.x,
    );
    expect(state.coopPlayers![1]!.position.x).toBeGreaterThan(
      state.coopPlayers![0]!.position.x,
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

  it("mirrors the singular player slices at the initial state", () => {
    const state = initialState();
    expect(state.players).toHaveLength(1);
    const runtime = state.players[0]!;
    expect(runtime.player).toBe(state.player);
    expect(runtime.vitality).toBe(state.playerVitality);
    expect(runtime.invincibility).toBe(state.playerInvincibility);
    expect(runtime.outcome).toBe(state.playerOutcome);
    expect(runtime.reaction).toBe(state.playerReaction);
  });

  it("re-derives players after a step so the array tracks movement", () => {
    const before = initialState();
    const after = stepSimulation(
      before,
      runRight(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
    );
    expect(after.players).toHaveLength(1);
    // The array reflects the new frame's player, not the previous one.
    expect(after.players[0]!.player).toBe(after.player);
    expect(after.players[0]!.player).not.toBe(before.player);
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
    expect(coop.player).toEqual(solo.player);
    // The uniform array now holds both players.
    expect(coop.players).toHaveLength(2);
    expect(coop.coopPlayers).toHaveLength(1);
  });

  it("removes a co-op player that has fallen into a pit (dead until level ends)", () => {
    const base = twoPlayerState();
    const fallen: SimulationState["coopPlayers"] = [
      {
        ...base.coopPlayers![0]!,
        position: {
          x: base.coopPlayers![0]!.position.x,
          y: requireSimulationPixelPosition(10000, "player.position.y"),
        },
      },
    ];
    const stepped = stepSimulation(
      { ...base, coopPlayers: fallen },
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );
    expect(stepped.coopPlayers).toHaveLength(0);
    expect(stepped.players).toHaveLength(1);
  });

  it("advances a co-op player's position across frames from its input", () => {
    let state = twoPlayerState();
    const startX = state.coopPlayers![0]!.position.x;
    for (let frame = 0; frame < 15; frame += 1) {
      state = stepSimulation(
        state,
        neutral(),
        initialMovementConstants,
        firstAuthoredLevelSpec(),
        [runRight()],
      );
    }
    expect(state.coopPlayers![0]!.position.x).toBeGreaterThan(startX);
  });
});
