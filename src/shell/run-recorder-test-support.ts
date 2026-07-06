import type { LevelSpec } from "../engine/domain/level-spec";
import type { SimulationInputCommand } from "../engine/simulation/input-command";
import { firstAuthoredLevelSpec } from "../engine/simulation/level-test-support";
import {
  initialMovementConstants,
  type MovementConstants,
} from "../engine/simulation/movement-model";
import {
  makeInitialSimulationState,
  type SimulationState,
} from "../engine/simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../engine/simulation/simulation-units";
import { stepSimulation } from "../engine/simulation/step-simulation";
import { RunRecorder } from "./run-recorder";

export type RecorderTestFixture = {
  readonly levelSpec: LevelSpec;
  readonly initialState: SimulationState;
  readonly movementConstants: MovementConstants;
  readonly recorder: RunRecorder;
};

export function makeRecorderTestFixture(): RecorderTestFixture {
  const levelSpec = firstAuthoredLevelSpec();
  const result = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    levelSpec,
    initialMovementConstants,
  );

  if (!result.ok) {
    throw new Error("Expected initial simulation state to validate.");
  }

  return {
    levelSpec,
    initialState: result.value,
    movementConstants: initialMovementConstants,
    recorder: new RunRecorder(
      result.value,
      initialMovementConstants,
      levelSpec,
    ),
  };
}

// Step the fixture forward `frames` times, recording each frame, and return the
// ground-truth states (index 0 is the initial state, index N is after N steps).
export function recordFixtureRun(
  fixture: RecorderTestFixture,
  makeInput: (frame: number) => SimulationInputCommand,
  frames: number,
): readonly SimulationState[] {
  const groundTruth: SimulationState[] = [fixture.initialState];
  let state = fixture.initialState;

  for (let frame = 0; frame < frames; frame += 1) {
    const input = makeInput(frame);
    state = stepSimulation(
      state,
      input,
      initialMovementConstants,
      fixture.levelSpec,
    );
    fixture.recorder.record(input, state);
    groundTruth.push(state);
  }

  return groundTruth;
}
