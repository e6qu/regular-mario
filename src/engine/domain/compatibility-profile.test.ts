import { describe, expect, it } from "vitest";

import { ActorRole } from "./level-spec";
import {
  makeCompatibilityProfile,
  spawnedPowerUpGravityConstantId,
  spawnedPowerUpTerminalFallVelocityYConstantId,
  spawnedPowerUpVelocityXConstantId,
  type CompatibilityActorProfileInput,
  type CompatibilityProfileInput,
} from "./compatibility-profile";
import { ValidationErrorCode } from "./validation-error";

function makeValidCompatibilityProfileInput(): CompatibilityProfileInput {
  return {
    profileId: "synthetic-community-profile",
    actors: [
      {
        sourceActorId: "source:runner",
        actorId: "runner-start",
        role: ActorRole.PlayerStart,
        spriteWidthPixels: 14,
        spriteHeightPixels: 16,
        colliderWidthPixels: 12,
        colliderHeightPixels: 16,
        behaviorProfileId: "player.standard",
        stateColliders: [
          {
            stateId: "powered",
            colliderWidthPixels: 12,
            colliderHeightPixels: 28,
          },
        ],
      },
      {
        sourceActorId: "source:walker",
        actorId: "beetle",
        role: ActorRole.Enemy,
        spriteWidthPixels: 16,
        spriteHeightPixels: 16,
        colliderWidthPixels: 14,
        colliderHeightPixels: 14,
        behaviorProfileId: "enemy.walker",
        stateColliders: [],
      },
    ],
    movementConstants: [
      {
        id: "player.run-speed",
        value: 144,
      },
      {
        id: spawnedPowerUpVelocityXConstantId,
        value: 42,
      },
      {
        id: spawnedPowerUpGravityConstantId,
        value: 960,
      },
      {
        id: spawnedPowerUpTerminalFallVelocityYConstantId,
        value: 300,
      },
    ],
    timers: [
      {
        id: "level.timer",
        value: 400,
      },
    ],
    unsupportedFeatures: [
      {
        featureId: "screen-wrap",
        reason: "The current runtime has bounded horizontal world edges.",
      },
    ],
  };
}

function requireActorInput(
  input: CompatibilityProfileInput,
  actorIndex: number,
): CompatibilityActorProfileInput {
  const actor = input.actors[actorIndex];

  if (actor === undefined) {
    throw new Error(`Expected actor input at index ${actorIndex}.`);
  }

  return actor;
}

describe("makeCompatibilityProfile", () => {
  it("accepts exact actor dimensions, per-state colliders, behavior ids, constants, timers, and unsupported features", () => {
    const input = makeValidCompatibilityProfileInput();
    const result = makeCompatibilityProfile(input);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected compatibility profile to validate.");
    }

    expect(result.value.profileId).toBe(input.profileId);
    expect(result.value.actors[0]?.sourceActorId).toBe("source:runner");
    expect(result.value.actors[0]?.spriteWidthPixels).toBe(14);
    expect(result.value.actors[0]?.colliderHeightPixels).toBe(16);
    expect(result.value.actors[0]?.stateColliders[0]?.stateId).toBe("powered");
    expect(result.value.movementConstants[0]?.id).toBe("player.run-speed");
    expect(result.value.spawnedPowerUpMovement).toEqual({
      velocityX: 42,
      gravity: 960,
      terminalFallVelocityY: 300,
    });
    expect(result.value.timers[0]?.value).toBe(400);
    expect(result.value.unsupportedFeatures[0]?.featureId).toBe("screen-wrap");
  });

  it("rejects duplicate source actor ids and duplicate state collider ids", () => {
    const input = makeValidCompatibilityProfileInput();
    const runner = requireActorInput(input, 0);
    const walker = requireActorInput(input, 1);
    const result = makeCompatibilityProfile({
      ...input,
      actors: [
        {
          ...runner,
          stateColliders: [
            {
              stateId: "same-state",
              colliderWidthPixels: 12,
              colliderHeightPixels: 16,
            },
            {
              stateId: "same-state",
              colliderWidthPixels: 10,
              colliderHeightPixels: 8,
            },
          ],
        },
        {
          ...walker,
          sourceActorId: runner.sourceActorId,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected duplicate compatibility ids to fail.");
    }

    expect(
      result.errors.filter(
        (error) =>
          error.code === ValidationErrorCode.CompatibilitySourceActorIdInvalid,
      ),
    ).toHaveLength(1);
    expect(
      result.errors.filter(
        (error) =>
          error.code === ValidationErrorCode.CompatibilityStateIdInvalid,
      ),
    ).toHaveLength(1);
  });

  it("rejects invalid dimensions and unsupported actor roles", () => {
    const input = makeValidCompatibilityProfileInput();
    const runner = requireActorInput(input, 0);
    const result = makeCompatibilityProfile({
      ...input,
      actors: [
        {
          ...runner,
          role: "unsupported-role",
          spriteWidthPixels: 0,
          colliderHeightPixels: Number.NaN,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected invalid actor profile to fail.");
    }

    expect(
      result.errors.some(
        (error) => error.code === ValidationErrorCode.CompatibilityActorInvalid,
      ),
    ).toBe(true);
    expect(
      result.errors.filter(
        (error) => error.code === ValidationErrorCode.ColliderDimensionInvalid,
      ),
    ).toHaveLength(2);
  });

  it("rejects non-finite constants, invalid timers, duplicate constant ids, and blank unsupported-feature reasons", () => {
    const input = makeValidCompatibilityProfileInput();
    const result = makeCompatibilityProfile({
      ...input,
      movementConstants: [
        { id: "player.speed", value: 1 },
        { id: "player.speed", value: Number.POSITIVE_INFINITY },
      ],
      timers: [
        { id: "level-timer.frames", value: 120 },
        { id: "source-timer.fractional", value: 12.5 },
        { id: "source-timer.negative", value: -1 },
      ],
      unsupportedFeatures: [
        {
          featureId: "unsupported-object",
          reason: " ",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected invalid constants/features to fail.");
    }

    expect(
      result.errors.some(
        (error) =>
          error.code === ValidationErrorCode.CompatibilityNumberInvalid,
      ),
    ).toBe(true);
    expect(
      result.errors.filter((error) => error.path.startsWith("timers[")),
    ).toHaveLength(2);
    expect(
      result.errors.filter(
        (error) =>
          error.code === ValidationErrorCode.CompatibilityFeatureInvalid,
      ),
    ).toHaveLength(2);
  });

  it("rejects partial or non-positive spawned power-up movement constants", () => {
    const input = makeValidCompatibilityProfileInput();
    const result = makeCompatibilityProfile({
      ...input,
      movementConstants: [
        {
          id: spawnedPowerUpVelocityXConstantId,
          value: 32,
        },
        {
          id: spawnedPowerUpGravityConstantId,
          value: 0,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected invalid spawned power-up constants to fail.");
    }

    expect(
      result.errors.filter(
        (error) =>
          error.code === ValidationErrorCode.CompatibilityFeatureInvalid,
      ),
    ).toHaveLength(1);
    expect(
      result.errors.filter(
        (error) =>
          error.code === ValidationErrorCode.CompatibilityNumberInvalid,
      ),
    ).toHaveLength(1);
  });
});
