import { describe, expect, it } from "vitest";

import { firstAuthoredLevelSpec } from "./level-test-support";
import { HorizontalInput, type SimulationInputCommand } from "./input-command";
import { initialMovementConstants } from "./movement-model";
import {
  makeInitialSimulationState,
  maxSimulationPlayers,
  type SimulationState,
} from "./simulation-state";
import { stepSimulation } from "./step-simulation";
import { nominalSixtyHertzFrameDurationMilliseconds } from "./simulation-units";

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

  it("steps a co-op player with its own input, leaving the primary untouched", () => {
    const base = initialState();
    const withCoop: SimulationState = { ...base, coopPlayers: [base.player] };

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
      [runRight()],
    );

    // The primary player is identical whether or not co-op players are present.
    expect(coop.player).toEqual(solo.player);
    // The uniform array now holds both players.
    expect(coop.players).toHaveLength(2);
    expect(coop.coopPlayers).toHaveLength(1);
  });

  it("advances a co-op player's position across frames from its input", () => {
    const base = initialState();
    let state: SimulationState = { ...base, coopPlayers: [base.player] };
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
