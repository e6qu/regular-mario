import { describe, expect, it } from "vitest";

import {
  makeAccelerationPixelsPerSecondSquared,
  makeActorCoordinate,
  makeColliderDimensionPixels,
  makeFrameDurationMilliseconds,
  makeFrameIndex,
  makeLevelHeightTiles,
  makeLevelWidthTiles,
  makePixelDistance,
  makePixelDelta,
  makePixelPosition,
  makeTileCoordinate,
  makeTileSizePixels,
  makeVelocityPixelsPerSecond,
} from "./units";
import { ValidationErrorCode } from "./validation-error";

describe("unit constructors", () => {
  it("accepts positive level dimensions", () => {
    expect(makeLevelWidthTiles(12, "widthTiles")).toEqual({
      ok: true,
      value: 12,
    });
  });

  it("rejects fractional dimensions", () => {
    expect(makeLevelWidthTiles(12.5, "widthTiles")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.DimensionInvalid,
          message: "widthTiles must be a positive integer.",
          path: "widthTiles",
        },
      ],
    });
  });

  it("rejects invalid level heights", () => {
    expect(makeLevelHeightTiles(-1, "heightTiles")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.DimensionInvalid,
          message: "heightTiles must be a positive integer.",
          path: "heightTiles",
        },
      ],
    });
  });

  it("rejects invalid tile size values", () => {
    expect(makeTileSizePixels(0, "tileSizePixels")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.TileSizeInvalid,
          message: "tileSizePixels must be a positive integer.",
          path: "tileSizePixels",
        },
      ],
    });
  });

  it("uses generic tile coordinate errors for generic tile coordinates", () => {
    expect(makeTileCoordinate(-1, "tile.x")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.TileCoordinateInvalid,
          message: "tile.x must be a non-negative integer.",
          path: "tile.x",
        },
      ],
    });
  });

  it("uses actor coordinate errors for actor placement coordinates", () => {
    expect(makeActorCoordinate(1.5, "actors[0].x")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.ActorCoordinateInvalid,
          message: "actors[0].x must be a non-negative integer.",
          path: "actors[0].x",
        },
      ],
    });
  });

  it("accepts zero as the first frame index", () => {
    expect(makeFrameIndex(0, "frameIndex")).toEqual({
      ok: true,
      value: 0,
    });
  });

  it("rejects invalid frame indexes with frame-specific errors", () => {
    expect(makeFrameIndex(-1, "frameIndex")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.FrameIndexInvalid,
          message: "frameIndex must be a non-negative safe integer.",
          path: "frameIndex",
        },
      ],
    });
  });

  it("rejects unsafe frame indexes", () => {
    expect(makeFrameIndex(Number.MAX_SAFE_INTEGER + 1, "frameIndex")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.FrameIndexInvalid,
          message: "frameIndex must be a non-negative safe integer.",
          path: "frameIndex",
        },
      ],
    });
  });

  it("accepts signed finite pixel positions", () => {
    expect(makePixelPosition(-4.5, "position.x")).toEqual({
      ok: true,
      value: -4.5,
    });
  });

  it("rejects non-finite pixel positions", () => {
    expect(makePixelPosition(Number.POSITIVE_INFINITY, "position.x")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.PixelPositionInvalid,
          message: "position.x must be a finite number.",
          path: "position.x",
        },
      ],
    });
  });

  it("accepts non-negative finite pixel distances", () => {
    expect(makePixelDistance(12.25, "separation.x")).toEqual({
      ok: true,
      value: 12.25,
    });
  });

  it("rejects negative pixel distances", () => {
    expect(makePixelDistance(-1, "separation.x")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.PixelDistanceInvalid,
          message: "separation.x must be a non-negative finite number.",
          path: "separation.x",
        },
      ],
    });
  });

  it("accepts signed finite pixel deltas", () => {
    expect(makePixelDelta(-12.25, "delta.x")).toEqual({
      ok: true,
      value: -12.25,
    });
  });

  it("rejects non-finite velocities", () => {
    expect(makeVelocityPixelsPerSecond(Number.NaN, "velocity.x")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.VelocityInvalid,
          message: "velocity.x must be a finite number.",
          path: "velocity.x",
        },
      ],
    });
  });

  it("accepts signed finite acceleration values", () => {
    expect(makeAccelerationPixelsPerSecondSquared(980, "gravity.y")).toEqual({
      ok: true,
      value: 980,
    });
  });

  it("rejects non-finite acceleration values", () => {
    expect(
      makeAccelerationPixelsPerSecondSquared(Number.NaN, "acceleration.x"),
    ).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.AccelerationInvalid,
          message: "acceleration.x must be a finite number.",
          path: "acceleration.x",
        },
      ],
    });
  });

  it("rejects zero frame durations", () => {
    expect(makeFrameDurationMilliseconds(0, "frameDuration")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.FrameDurationInvalid,
          message: "frameDuration must be a positive finite number.",
          path: "frameDuration",
        },
      ],
    });
  });

  it("rejects non-positive collider dimensions", () => {
    expect(makeColliderDimensionPixels(-1, "collider.width")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.ColliderDimensionInvalid,
          message: "collider.width must be a positive finite number.",
          path: "collider.width",
        },
      ],
    });
  });
});
