import { describe, expect, it } from "vitest";
import { HorizontalInput } from "../../simulation/input-command";
import { makeSimulationInputCommand } from "../../simulation/input-command";
import { initialMovementConstants } from "../../simulation/movement-model";
import { makeInitialSimulationStateWithPlayerVitality } from "../../simulation/simulation-state";
import { PlayerVitalityKind } from "../../simulation/player-vitality";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../../simulation/simulation-units";
import { stepSimulation } from "../../simulation/step-simulation";
import { loadOfficialSmbPack } from "./official-smb-pack.test-support";

// Regression for the maze-castle loop gates: the runtime accepts a grounded
// bottom-corridor crossing of 4-4's second checkpoint (the ROM's standing
// check at the correct height), and the firebar guarding it remains lethal
// to a small player — both sides of the real 4-4 experience.
describe("4-4 second loop gate", () => {
  for (const [label, vitality, startY] of [
    ["fire", PlayerVitalityKind.Fire, 13 * 16 - 32],
  ] as const) {
    it(`accepts a ${label} player walking the bottom corridor through col 128`, () => {
      const pack = loadOfficialSmbPack();
      const spec = pack.get("smb-4-5")?.levelSpec;
      if (!spec) throw new Error("no spec");
      const init = makeInitialSimulationStateWithPlayerVitality(
        nominalSixtyHertzFrameDurationMilliseconds,
        spec,
        initialMovementConstants,
        { kind: vitality },
      );
      if (!init.ok) throw new Error("bad init");
      let state = init.value;
      state = {
        ...state,
        player: {
          ...state.player,
          position: { x: (120 * 16) as never, y: startY as never },
        },
      };
      const right = makeSimulationInputCommand(
        HorizontalInput.Right,
        false,
        false,
        false,
        false,
        false,
      );
      if (!right.ok) throw new Error("bad input");
      for (let i = 0; i < 300; i += 1) {
        state = stepSimulation(
          state,
          right.value,
          initialMovementConstants,
          spec,
        );
      }
      expect(state.player.position.x).toBeGreaterThan(130 * 16);
    });
  }
});
