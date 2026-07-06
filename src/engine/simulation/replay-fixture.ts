import type { Brand } from "../domain/brand";
import type { LevelSpec } from "../domain/level-spec";
import type { DomainResult } from "../domain/result";
import { fail, succeed } from "../domain/result";
import type { ValidationError } from "../domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../domain/validation-error";
import type { SimulationInputCommand } from "./input-command";
import type { MovementConstants } from "./movement-model";
import type { SimulationState } from "./simulation-state";
import { stepSimulation } from "./step-simulation";

export type ReplayFrameCount = Brand<number, "ReplayFrameCount">;

type ReplayInputSegment = {
  readonly inputCommand: SimulationInputCommand;
  readonly frameCount: ReplayFrameCount;
};

export type ReplayFixture = {
  readonly segments: readonly ReplayInputSegment[];
};

export function makeReplayFrameCount(
  value: number,
  path: string,
): DomainResult<ReplayFrameCount, ValidationError> {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.ReplayFrameCountInvalid,
        `${path} must be a positive safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as ReplayFrameCount);
}

export function runReplayFixture(
  initialState: SimulationState,
  replayFixture: ReplayFixture,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
): SimulationState {
  let state = initialState;

  for (const segment of replayFixture.segments) {
    for (let frame = 0; frame < segment.frameCount; frame += 1) {
      state = stepSimulation(
        state,
        segment.inputCommand,
        movementConstants,
        levelSpec,
      );
    }
  }

  return state;
}
