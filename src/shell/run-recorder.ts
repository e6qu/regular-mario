import type { LevelSpec } from "../engine/domain/level-spec";
import type { SimulationInputCommand } from "../engine/simulation/input-command";
import type { MovementConstants } from "../engine/simulation/movement-model";
import type { SimulationState } from "../engine/simulation/simulation-state";
import { stepSimulation } from "../engine/simulation/step-simulation";

// The simulation is a pure function stepped once per frame, so a whole run is
// captured by its initial state plus the per-frame input log. Recording the
// inputs (cheap) lets us reconstruct any frame exactly by replaying, which
// powers both timeline scrubbing and the headless run export.

// Snapshot the full simulation state every N frames so that seeking to an
// arbitrary frame never has to replay more than N steps.
export const runRecorderKeyframeInterval = 300;

// A minimal, serialisable description of a run: enough to replay it exactly
// against the same level and movement constants.
export type RunReplayLog = {
  readonly frameCount: number;
  readonly inputs: readonly SimulationInputCommand[];
};

export class RunRecorder {
  private readonly recordedInputs: SimulationInputCommand[] = [];
  private readonly keyframeStates = new Map<number, SimulationState>();

  public constructor(
    private readonly initialState: SimulationState,
    private readonly movementConstants: MovementConstants,
    private readonly levelSpec: LevelSpec,
  ) {
    this.keyframeStates.set(0, initialState);
  }

  public get frameCount(): number {
    return this.recordedInputs.length;
  }

  // Record the input applied to advance one frame and the state it produced.
  public record(
    inputCommand: SimulationInputCommand,
    resultingState: SimulationState,
  ): void {
    this.recordedInputs.push(inputCommand);
    const frameIndex = this.recordedInputs.length;

    if (frameIndex % runRecorderKeyframeInterval === 0) {
      this.keyframeStates.set(frameIndex, resultingState);
    }
  }

  // The exact simulation state at `targetFrame` (clamped to 0..frameCount),
  // reconstructed by replaying recorded inputs from the nearest earlier
  // keyframe.
  public stateAt(targetFrame: number): SimulationState {
    const frame = Math.max(
      0,
      Math.min(Math.trunc(targetFrame), this.frameCount),
    );
    const baseFrame =
      Math.floor(frame / runRecorderKeyframeInterval) *
      runRecorderKeyframeInterval;
    let state = this.keyframeStates.get(baseFrame) ?? this.initialState;
    const startFrame = this.keyframeStates.has(baseFrame) ? baseFrame : 0;

    for (let cursor = startFrame; cursor < frame; cursor += 1) {
      const inputCommand = this.recordedInputs[cursor];

      if (inputCommand === undefined) {
        break;
      }

      state = stepSimulation(
        state,
        inputCommand,
        this.movementConstants,
        this.levelSpec,
      );
    }

    return state;
  }

  public toReplayLog(): RunReplayLog {
    return {
      frameCount: this.frameCount,
      inputs: [...this.recordedInputs],
    };
  }
}

// Replay a recorded input log against a level, returning the simulation state
// at every frame (index 0 is the initial state, index N is after N inputs).
// Used by the headless replay/export tooling to recover a run frame-by-frame.
export function replayRunLog(
  log: RunReplayLog,
  initialState: SimulationState,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
): readonly SimulationState[] {
  const states: SimulationState[] = [initialState];
  let state = initialState;

  for (const inputCommand of log.inputs) {
    state = stepSimulation(state, inputCommand, movementConstants, levelSpec);
    states.push(state);
  }

  return states;
}
