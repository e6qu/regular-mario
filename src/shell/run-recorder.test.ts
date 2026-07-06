import { describe, expect, it } from "vitest";

import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import {
  makeRecorderTestFixture,
  recordFixtureRun,
} from "./run-recorder-test-support";
import { replayRunLog, runRecorderKeyframeInterval } from "./run-recorder";

function makeDeterministicInput(frameIndex: number): SimulationInputCommand {
  return {
    horizontal:
      frameIndex % 3 === 0 ? HorizontalInput.Left : HorizontalInput.Right,
    jumpPressed: frameIndex % 7 === 0,
    runHeld: frameIndex % 2 === 0,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
}

describe("RunRecorder", () => {
  // Cross a keyframe boundary so seeking exercises the replay-from-keyframe path.
  const totalFrames = runRecorderKeyframeInterval + 60;

  function recordRun() {
    const fixture = makeRecorderTestFixture();
    const groundTruth = recordFixtureRun(
      fixture,
      makeDeterministicInput,
      totalFrames,
    );
    return { fixture, groundTruth };
  }

  it("reconstructs any recorded frame exactly, across a keyframe boundary", () => {
    const { fixture, groundTruth } = recordRun();

    expect(fixture.recorder.frameCount).toBe(totalFrames);

    for (const frame of [
      0,
      1,
      50,
      runRecorderKeyframeInterval - 1,
      runRecorderKeyframeInterval,
      runRecorderKeyframeInterval + 5,
      totalFrames,
    ]) {
      expect(fixture.recorder.stateAt(frame)).toEqual(groundTruth[frame]);
    }
  });

  it("clamps out-of-range seeks to the run bounds", () => {
    const { fixture, groundTruth } = recordRun();

    expect(fixture.recorder.stateAt(-10)).toEqual(fixture.initialState);
    expect(fixture.recorder.stateAt(totalFrames + 1000)).toEqual(
      groundTruth[totalFrames],
    );
  });

  it("round-trips through a replay log to identical states", () => {
    const { fixture, groundTruth } = recordRun();
    const log = fixture.recorder.toReplayLog();

    expect(log.frameCount).toBe(totalFrames);

    const replayed = replayRunLog(
      log,
      fixture.initialState,
      fixture.movementConstants,
      fixture.levelSpec,
    );

    expect(replayed).toEqual(groundTruth);
  });
});
