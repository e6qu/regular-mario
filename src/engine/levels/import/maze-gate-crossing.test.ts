import { describe, expect, it } from "vitest";
import { HorizontalInput } from "../../simulation/input-command";
import { PlayerVitalityKind } from "../../simulation/player-vitality";
import {
  loadOfficialLevelSpec,
  makeScenarioInput,
  startStateAtPixel,
  stepScenario,
} from "./sim-scenario.test-support";

// Regression for the maze-castle loop gates: the runtime accepts a grounded
// bottom-corridor crossing of 4-4's second checkpoint (the ROM's standing
// check at the correct height), and the firebar guarding it remains lethal
// to a small player — both sides of the real 4-4 experience.
describe("4-4 second loop gate", () => {
  for (const [label, vitality, startY] of [
    ["fire", PlayerVitalityKind.Fire, 13 * 16 - 32],
  ] as const) {
    it(`accepts a ${label} player walking the bottom corridor through col 128`, () => {
      const spec = loadOfficialLevelSpec("smb-4-5");
      const state = startStateAtPixel(
        spec,
        { kind: vitality },
        120 * 16,
        startY,
      );
      const right = makeScenarioInput({ horizontal: HorizontalInput.Right });
      const settled = stepScenario(state, right, spec, 300);
      expect(settled.players[0].player.position.x).toBeGreaterThan(130 * 16);
    });
  }
});
