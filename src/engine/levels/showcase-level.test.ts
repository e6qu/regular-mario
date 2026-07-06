import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { makeInitialSimulationState } from "../simulation/simulation-state";
import { initialMovementConstants } from "../simulation/movement-model";
import {
  showcaseOverworldLevelInput,
  showcaseSequence,
} from "./showcase-level";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../simulation/simulation-units";

describe("showcase levels", () => {
  it("validates all levels in the sequence", () => {
    expect(showcaseSequence.length).toBeGreaterThanOrEqual(2);

    for (const levelInput of showcaseSequence) {
      const result = makeLevelSpec(levelInput);
      expect(result.ok).toBe(true);
    }
  });

  it("produces initial simulation states for all levels", () => {
    for (const levelInput of showcaseSequence) {
      const levelSpecResult = makeLevelSpec(levelInput);

      if (!levelSpecResult.ok) {
        throw new Error("Expected showcase level to validate.");
      }

      const stateResult = makeInitialSimulationState(
        nominalSixtyHertzFrameDurationMilliseconds,
        levelSpecResult.value,
        initialMovementConstants,
      );

      expect(stateResult.ok).toBe(true);
    }
  });

  it("exposes the overworld level as a standalone input", () => {
    expect(showcaseOverworldLevelInput).toBe(showcaseSequence[0]);
  });
});
