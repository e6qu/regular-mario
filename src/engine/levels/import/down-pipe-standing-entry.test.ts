import { describe, expect, it } from "vitest";
import { HorizontalInput } from "../../simulation/input-command";
import { PlayerVitalityKind } from "../../simulation/player-vitality";
import { PipeEntryPhase } from "../../simulation/pipe-state";
import {
  loadOfficialLevelSpec,
  makeScenarioInput,
  startStateAtPixel,
  stepScenario,
} from "./sim-scenario.test-support";

// Regression: a down pipe's mouth is solid, so a player standing on it has
// their centre one row above the mouth tile — pressing down there must
// still enter (the seventh fidelity bug this campaign caught).
describe("down pipe standing entry", () => {
  it("walks onto 1-1's bonus pipe and enters by pressing down", () => {
    const spec = loadOfficialLevelSpec("smb-1-1");
    // Start standing just left of the pipe at (57,9); place on ground honestly.
    let state = startStateAtPixel(
      spec,
      { kind: PlayerVitalityKind.Small },
      860,
      9 * 16 - 24,
    );
    const right = makeScenarioInput({
      horizontal: HorizontalInput.Right,
      run: true,
    });
    const jumpRight = makeScenarioInput({
      horizontal: HorizontalInput.Right,
      jump: true,
      run: true,
    });
    const down = makeScenarioInput({ crouch: true });
    const neutral = makeScenarioInput({});

    // Walk flush against the pipe, hop up while nudging right, settle on top.
    while (state.players[0].player.position.x < 880) {
      state = stepScenario(state, right, spec, 1);
    }
    state = stepScenario(state, jumpRight, spec, 26);
    state = stepScenario(state, right, spec, 14);
    state = stepScenario(state, neutral, spec, 60);

    for (let i = 0; i < 120; i += 1) {
      state = stepScenario(state, down, spec, 1);
      if (state.pipeEntry.phase !== PipeEntryPhase.None) break;
    }
    expect(state.pipeEntry.phase).toBe(PipeEntryPhase.Entering);
  });
});
