import type { Brand } from "./brand";
import type { DomainResult } from "./result";
import { fail, succeed } from "./result";
import type { ValidationError } from "./validation-error";
import { makeValidationError, ValidationErrorCode } from "./validation-error";

export type TileId = Brand<string, "TileId">;
export type ActorId = Brand<string, "ActorId">;
export type EntityId = Brand<string, "EntityId">;

const identifierPattern = /^[a-z][a-z0-9-]*$/;

function makeIdentifier<Value>(
  value: string,
  path: string,
  errorCode: ValidationErrorCode,
  brandValue: (acceptedValue: string) => Value,
): DomainResult<Value, ValidationError> {
  if (!identifierPattern.test(value)) {
    return fail([
      makeValidationError(
        errorCode,
        `${path} must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.`,
        path,
      ),
    ]);
  }

  return succeed(brandValue(value));
}

export function makeTileId(
  value: string,
  path: string,
): DomainResult<TileId, ValidationError> {
  return makeIdentifier(
    value,
    path,
    ValidationErrorCode.TileIdInvalid,
    (acceptedValue) => acceptedValue as TileId,
  );
}

export function makeActorId(
  value: string,
  path: string,
): DomainResult<ActorId, ValidationError> {
  return makeIdentifier(
    value,
    path,
    ValidationErrorCode.ActorIdInvalid,
    (acceptedValue) => acceptedValue as ActorId,
  );
}

export function makeEntityId(
  value: string,
  path: string,
): DomainResult<EntityId, ValidationError> {
  return makeIdentifier(
    value,
    path,
    ValidationErrorCode.EntityIdInvalid,
    (acceptedValue) => acceptedValue as EntityId,
  );
}
