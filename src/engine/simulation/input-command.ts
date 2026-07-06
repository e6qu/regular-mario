import type { DomainResult } from "../domain/result";
import { fail, succeed } from "../domain/result";
import type { ValidationError } from "../domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../domain/validation-error";

export enum HorizontalInput {
  Left = "left",
  Neutral = "neutral",
  Right = "right",
}

export type SimulationInputCommand = {
  readonly horizontal: HorizontalInput;
  readonly jumpPressed: boolean;
  readonly runHeld: boolean;
  readonly firePressed: boolean;
  readonly upHeld: boolean;
  readonly downHeld: boolean;
};

export function makeSimulationInputCommand(
  horizontal: unknown,
  jumpPressed: unknown,
  runHeld: unknown,
  firePressed: unknown,
  upHeld: unknown,
  downHeld: unknown,
): DomainResult<SimulationInputCommand, ValidationError> {
  const errors: ValidationError[] = [];

  if (
    horizontal !== HorizontalInput.Left &&
    horizontal !== HorizontalInput.Neutral &&
    horizontal !== HorizontalInput.Right
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.HorizontalInputInvalid,
        "input.horizontal must be one of: left, neutral, right.",
        "input.horizontal",
      ),
    );
  }

  if (typeof jumpPressed !== "boolean") {
    errors.push(
      makeValidationError(
        ValidationErrorCode.BooleanInputInvalid,
        "input.jumpPressed must be a boolean.",
        "input.jumpPressed",
      ),
    );
  }

  if (typeof runHeld !== "boolean") {
    errors.push(
      makeValidationError(
        ValidationErrorCode.BooleanInputInvalid,
        "input.runHeld must be a boolean.",
        "input.runHeld",
      ),
    );
  }

  if (typeof firePressed !== "boolean") {
    errors.push(
      makeValidationError(
        ValidationErrorCode.BooleanInputInvalid,
        "input.firePressed must be a boolean.",
        "input.firePressed",
      ),
    );
  }

  if (typeof downHeld !== "boolean") {
    errors.push(
      makeValidationError(
        ValidationErrorCode.BooleanInputInvalid,
        "input.downHeld must be a boolean.",
        "input.downHeld",
      ),
    );
  }

  if (typeof upHeld !== "boolean") {
    errors.push(
      makeValidationError(
        ValidationErrorCode.BooleanInputInvalid,
        "input.upHeld must be a boolean.",
        "input.upHeld",
      ),
    );
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  if (
    horizontal !== HorizontalInput.Left &&
    horizontal !== HorizontalInput.Neutral &&
    horizontal !== HorizontalInput.Right
  ) {
    throw new Error("Validated horizontal input is unreachable.");
  }

  if (typeof jumpPressed !== "boolean") {
    throw new Error("Validated jump input is unreachable.");
  }

  if (typeof runHeld !== "boolean") {
    throw new Error("Validated run input is unreachable.");
  }

  if (typeof firePressed !== "boolean") {
    throw new Error("Validated fire input is unreachable.");
  }

  if (typeof downHeld !== "boolean") {
    throw new Error("Validated down input is unreachable.");
  }

  if (typeof upHeld !== "boolean") {
    throw new Error("Validated up input is unreachable.");
  }

  return succeed({
    horizontal,
    jumpPressed,
    runHeld,
    firePressed,
    upHeld,
    downHeld,
  });
}
