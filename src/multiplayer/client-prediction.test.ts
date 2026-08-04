import { describe, expect, it } from "vitest";

import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import { firstAuthoredLevelSpec } from "../engine/simulation/level-test-support";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeInitialSimulationState } from "../engine/simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../engine/simulation/simulation-units";
import { makeClientPrediction } from "./client-prediction";

const right: SimulationInputCommand = {
  horizontal: HorizontalInput.Right,
  jumpPressed: false,
  runHeld: false,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

function initialState() {
  const result = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
  );
  if (!result.ok) {
    throw new Error("Expected valid prediction state.");
  }
  return result.value;
}

describe("client prediction", () => {
  it("applies local commands immediately and retains unacknowledged history", () => {
    const prediction = makeClientPrediction(
      initialState(),
      firstAuthoredLevelSpec(),
      initialMovementConstants,
    );
    const before = Number(
      prediction.snapshot().state.players[0].player.position.x,
    );
    const after = prediction.submit(1, right);
    expect(Number(after.state.players[0].player.position.x)).toBeGreaterThan(
      before,
    );
    expect(after.pendingInputs).toHaveLength(1);
  });

  it("reconciles acknowledged input and replays newer pending input", () => {
    const prediction = makeClientPrediction(
      initialState(),
      firstAuthoredLevelSpec(),
      initialMovementConstants,
    );
    prediction.submit(1, right);
    prediction.submit(2, right);
    const reconciled = prediction.reconcile(1, { x: 80, y: 64 });
    expect(reconciled.pendingInputs.map((input) => input.sequence)).toEqual([
      2,
    ]);
    expect(
      Number(reconciled.state.players[0].player.position.x),
    ).toBeGreaterThan(80);
    expect(() => prediction.submit(2, right)).toThrow("increase");
  });
});
