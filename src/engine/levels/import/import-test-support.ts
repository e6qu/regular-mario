import { makeLevelSpec } from "../../domain/level-spec";
import type { LevelSpecInput } from "../../domain/level-spec";
import type { DomainResult } from "../../domain/result";
import type { ValidationError } from "../../domain/validation-error";
import {
  HorizontalInput,
  makeSimulationInputCommand,
} from "../../simulation/input-command";
import { initialMovementConstants } from "../../simulation/movement-model";
import type { SimulationState } from "../../simulation/simulation-state";
import { makeInitialSimulationState } from "../../simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../../simulation/simulation-units";
import { stepSimulation } from "../../simulation/step-simulation";

export function requireParseSuccess(
  result: DomainResult<LevelSpecInput, ValidationError>,
): LevelSpecInput {
  if (!result.ok) {
    throw new Error("Expected successful parse.");
  }

  return result.value;
}

export function requireParseFailure(
  result: DomainResult<LevelSpecInput, ValidationError>,
): readonly ValidationError[] {
  if (result.ok) {
    throw new Error("Expected parse failure, but parse succeeded.");
  }

  return result.errors;
}

export function stepImportedLevelOnce(
  levelSpecInput: LevelSpecInput,
): SimulationState {
  const levelSpecResult = makeLevelSpec(levelSpecInput);
  if (!levelSpecResult.ok) {
    throw new Error("Imported level failed LevelSpec validation.");
  }

  const initialStateResult = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    levelSpecResult.value,
    initialMovementConstants,
  );
  if (!initialStateResult.ok) {
    throw new Error("Imported level produced an invalid initial state.");
  }

  const inputResult = makeSimulationInputCommand(
    HorizontalInput.Neutral,
    false,
    false,
    false,
    false,
    false,
  );
  if (!inputResult.ok) {
    throw new Error("Expected valid neutral input command.");
  }

  return stepSimulation(
    initialStateResult.value,
    inputResult.value,
    initialMovementConstants,
    levelSpecResult.value,
  );
}
