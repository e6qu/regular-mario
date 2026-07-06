import type { Brand } from "./brand";
import type { DomainResult } from "./result";
import { fail, succeed } from "./result";
import type { ValidationError } from "./validation-error";
import { makeValidationError, ValidationErrorCode } from "./validation-error";

export type LevelWidthTiles = Brand<number, "LevelWidthTiles">;
export type LevelHeightTiles = Brand<number, "LevelHeightTiles">;
export type TileSizePixels = Brand<number, "TileSizePixels">;
export type TileCoordinate = Brand<number, "TileCoordinate">;
export type FrameIndex = Brand<number, "FrameIndex">;
export type PixelPosition = Brand<number, "PixelPosition">;
export type PixelDistance = Brand<number, "PixelDistance">;
export type PixelDelta = Brand<number, "PixelDelta">;
export type VelocityPixelsPerSecond = Brand<number, "VelocityPixelsPerSecond">;
export type AccelerationPixelsPerSecondSquared = Brand<
  number,
  "AccelerationPixelsPerSecondSquared"
>;
export type FrameDurationMilliseconds = Brand<
  number,
  "FrameDurationMilliseconds"
>;
export type ColliderDimensionPixels = Brand<number, "ColliderDimensionPixels">;

export type TilePoint = {
  readonly x: TileCoordinate;
  readonly y: TileCoordinate;
};

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

function isSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value);
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function makePositiveInteger<Value>(
  value: number,
  path: string,
  errorCode: ValidationErrorCode,
  brandValue: (acceptedValue: number) => Value,
): DomainResult<Value, ValidationError> {
  if (!isInteger(value) || value <= 0) {
    return fail([
      makeValidationError(
        errorCode,
        `${path} must be a positive integer.`,
        path,
      ),
    ]);
  }

  return succeed(brandValue(value));
}

function makeFiniteNumber<Value>(
  value: number,
  path: string,
  errorCode: ValidationErrorCode,
  brandValue: (acceptedValue: number) => Value,
): DomainResult<Value, ValidationError> {
  if (!isFiniteNumber(value)) {
    return fail([
      makeValidationError(errorCode, `${path} must be a finite number.`, path),
    ]);
  }

  return succeed(brandValue(value));
}

function makeNonNegativeFiniteNumber<Value>(
  value: number,
  path: string,
  errorCode: ValidationErrorCode,
  brandValue: (acceptedValue: number) => Value,
): DomainResult<Value, ValidationError> {
  if (!isFiniteNumber(value) || value < 0) {
    return fail([
      makeValidationError(
        errorCode,
        `${path} must be a non-negative finite number.`,
        path,
      ),
    ]);
  }

  return succeed(brandValue(value));
}

function makePositiveFiniteNumber<Value>(
  value: number,
  path: string,
  errorCode: ValidationErrorCode,
  brandValue: (acceptedValue: number) => Value,
): DomainResult<Value, ValidationError> {
  if (!isFiniteNumber(value) || value <= 0) {
    return fail([
      makeValidationError(
        errorCode,
        `${path} must be a positive finite number.`,
        path,
      ),
    ]);
  }

  return succeed(brandValue(value));
}

function makeNonNegativeInteger<Value>(
  value: number,
  path: string,
  errorCode: ValidationErrorCode,
  brandValue: (acceptedValue: number) => Value,
): DomainResult<Value, ValidationError> {
  if (!isInteger(value) || value < 0) {
    return fail([
      makeValidationError(
        errorCode,
        `${path} must be a non-negative integer.`,
        path,
      ),
    ]);
  }

  return succeed(brandValue(value));
}

export function makeLevelWidthTiles(
  value: number,
  path: string,
): DomainResult<LevelWidthTiles, ValidationError> {
  return makePositiveInteger(
    value,
    path,
    ValidationErrorCode.DimensionInvalid,
    (acceptedValue) => acceptedValue as LevelWidthTiles,
  );
}

export function makeLevelHeightTiles(
  value: number,
  path: string,
): DomainResult<LevelHeightTiles, ValidationError> {
  return makePositiveInteger(
    value,
    path,
    ValidationErrorCode.DimensionInvalid,
    (acceptedValue) => acceptedValue as LevelHeightTiles,
  );
}

export function makeTileSizePixels(
  value: number,
  path: string,
): DomainResult<TileSizePixels, ValidationError> {
  return makePositiveInteger(
    value,
    path,
    ValidationErrorCode.TileSizeInvalid,
    (acceptedValue) => acceptedValue as TileSizePixels,
  );
}

export function makeTileCoordinate(
  value: number,
  path: string,
): DomainResult<TileCoordinate, ValidationError> {
  return makeNonNegativeInteger(
    value,
    path,
    ValidationErrorCode.TileCoordinateInvalid,
    (acceptedValue) => acceptedValue as TileCoordinate,
  );
}

export function makeActorCoordinate(
  value: number,
  path: string,
): DomainResult<TileCoordinate, ValidationError> {
  return makeNonNegativeInteger(
    value,
    path,
    ValidationErrorCode.ActorCoordinateInvalid,
    (acceptedValue) => acceptedValue as TileCoordinate,
  );
}

export function makeFrameIndex(
  value: number,
  path: string,
): DomainResult<FrameIndex, ValidationError> {
  if (!isSafeInteger(value) || value < 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.FrameIndexInvalid,
        `${path} must be a non-negative safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as FrameIndex);
}

export function makePixelPosition(
  value: number,
  path: string,
): DomainResult<PixelPosition, ValidationError> {
  return makeFiniteNumber(
    value,
    path,
    ValidationErrorCode.PixelPositionInvalid,
    (acceptedValue) => acceptedValue as PixelPosition,
  );
}

export function makePixelDistance(
  value: number,
  path: string,
): DomainResult<PixelDistance, ValidationError> {
  return makeNonNegativeFiniteNumber(
    value,
    path,
    ValidationErrorCode.PixelDistanceInvalid,
    (acceptedValue) => acceptedValue as PixelDistance,
  );
}

export function makePixelDelta(
  value: number,
  path: string,
): DomainResult<PixelDelta, ValidationError> {
  return makeFiniteNumber(
    value,
    path,
    ValidationErrorCode.PixelDeltaInvalid,
    (acceptedValue) => acceptedValue as PixelDelta,
  );
}

export function makeVelocityPixelsPerSecond(
  value: number,
  path: string,
): DomainResult<VelocityPixelsPerSecond, ValidationError> {
  return makeFiniteNumber(
    value,
    path,
    ValidationErrorCode.VelocityInvalid,
    (acceptedValue) => acceptedValue as VelocityPixelsPerSecond,
  );
}

export function makeAccelerationPixelsPerSecondSquared(
  value: number,
  path: string,
): DomainResult<AccelerationPixelsPerSecondSquared, ValidationError> {
  return makeFiniteNumber(
    value,
    path,
    ValidationErrorCode.AccelerationInvalid,
    (acceptedValue) => acceptedValue as AccelerationPixelsPerSecondSquared,
  );
}

export function makeFrameDurationMilliseconds(
  value: number,
  path: string,
): DomainResult<FrameDurationMilliseconds, ValidationError> {
  return makePositiveFiniteNumber(
    value,
    path,
    ValidationErrorCode.FrameDurationInvalid,
    (acceptedValue) => acceptedValue as FrameDurationMilliseconds,
  );
}

export function makeColliderDimensionPixels(
  value: number,
  path: string,
): DomainResult<ColliderDimensionPixels, ValidationError> {
  return makePositiveFiniteNumber(
    value,
    path,
    ValidationErrorCode.ColliderDimensionInvalid,
    (acceptedValue) => acceptedValue as ColliderDimensionPixels,
  );
}

export function requireColliderDimensionPixels(
  value: number,
  path: string,
): ColliderDimensionPixels {
  const result = makeColliderDimensionPixels(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid collider dimension.`);
  }

  return result.value;
}
