import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { makeInitialSimulationState } from "../simulation/simulation-state";
import { initialMovementConstants } from "../simulation/movement-model";
import { pipeRouteLevelInput } from "./pipe-route-level";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../simulation/simulation-units";

describe("pipe route level", () => {
  it("validates as a playable level", () => {
    const result = makeLevelSpec(pipeRouteLevelInput);

    expect(result.ok).toBe(true);
  });

  it("produces an initial simulation state", () => {
    const levelSpecResult = makeLevelSpec(pipeRouteLevelInput);

    if (!levelSpecResult.ok) {
      throw new Error("Expected pipe route level to validate.");
    }

    const stateResult = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpecResult.value,
      initialMovementConstants,
    );

    expect(stateResult.ok).toBe(true);
  });
});
