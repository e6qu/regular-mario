import { describe, expect, it } from "vitest";
import { HorizontalInput } from "../../simulation/input-command";
import { makeSimulationInputCommand } from "../../simulation/input-command";
import { initialMovementConstants } from "../../simulation/movement-model";
import { makeInitialSimulationStateWithPlayerVitality } from "../../simulation/simulation-state";
import { PlayerVitalityKind } from "../../simulation/player-vitality";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../../simulation/simulation-units";
import { stepSimulation } from "../../simulation/step-simulation";
import { PipeEntryPhase } from "../../simulation/pipe-state";
import { loadOfficialSmbPack } from "./official-smb-pack.test-support";

// Regression: a down pipe's mouth is solid, so a player standing on it has
// their centre one row above the mouth tile — pressing down there must
// still enter (the seventh fidelity bug this campaign caught).
describe("down pipe standing entry", () => {
  it("walks onto 1-1's bonus pipe and enters by pressing down", () => {
    const pack = loadOfficialSmbPack();
    const spec = pack.get("smb-1-1")?.levelSpec;
    if (!spec) throw new Error("no spec");
    const init = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      spec,
      initialMovementConstants,
      { kind: PlayerVitalityKind.Small },
    );
    if (!init.ok) throw new Error("bad init");
    let state = init.value;
    // Start standing just left of the pipe at (57,9); place on ground honestly.
    state = {
      ...state,
      player: {
        ...state.player,
        position: { x: 860 as never, y: (9 * 16 - 24) as never },
      },
    };
    const right = makeSimulationInputCommand(
      HorizontalInput.Right,
      false,
      true,
      false,
      false,
      false,
    );
    const jumpRight = makeSimulationInputCommand(
      HorizontalInput.Right,
      true,
      true,
      false,
      false,
      false,
    );
    const down = makeSimulationInputCommand(
      HorizontalInput.Neutral,
      false,
      false,
      false,
      false,
      true,
    );
    if (!right.ok || !down.ok || !jumpRight.ok) throw new Error("bad input");
    // Walk flush against the pipe, hop up while nudging right, settle on top.
    while (state.player.position.x < 880) {
      state = stepSimulation(
        state,
        right.value,
        initialMovementConstants,
        spec,
      );
    }
    for (let i = 0; i < 26; i += 1)
      state = stepSimulation(
        state,
        jumpRight.value,
        initialMovementConstants,
        spec,
      );
    for (let i = 0; i < 14; i += 1)
      state = stepSimulation(
        state,
        right.value,
        initialMovementConstants,
        spec,
      );
    const neutral = makeSimulationInputCommand(
      HorizontalInput.Neutral,
      false,
      false,
      false,
      false,
      false,
    );
    if (!neutral.ok) throw new Error("bad input");
    for (let i = 0; i < 60; i += 1)
      state = stepSimulation(
        state,
        neutral.value,
        initialMovementConstants,
        spec,
      );
    for (let i = 0; i < 120; i += 1) {
      state = stepSimulation(state, down.value, initialMovementConstants, spec);
      if (state.pipeEntry.phase !== PipeEntryPhase.None) break;
    }
    expect(state.pipeEntry.phase).toBe(PipeEntryPhase.Entering);
  });
});
