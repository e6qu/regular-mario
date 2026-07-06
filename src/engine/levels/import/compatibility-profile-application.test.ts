import {
  ActorRole,
  makeLevelSpec,
  type LevelSpecInput,
} from "../../domain/level-spec";
import {
  makeCompatibilityProfile,
  spawnedPowerUpGravityConstantId,
  spawnedPowerUpTerminalFallVelocityYConstantId,
  spawnedPowerUpVelocityXConstantId,
} from "../../domain/compatibility-profile";
import { describe, expect, it } from "vitest";

import { applyCompatibilityProfileToLevelInput } from "./compatibility-profile-application";
import { runtimeLevelTimerId } from "../../simulation/level-timer-state";

function makeSyntheticLevelInput(): LevelSpecInput {
  return {
    widthTiles: 4,
    heightTiles: 3,
    tileSizePixels: 16,
    tileDefinitions: [
      { tileId: "sky", collision: "empty" },
      { tileId: "ground", collision: "solid" },
    ],
    actorDefinitions: [
      {
        actorId: "runner-start",
        role: ActorRole.PlayerStart,
      },
      {
        actorId: "compact-beetle",
        role: ActorRole.Enemy,
      },
      {
        actorId: "open-gate",
        role: ActorRole.Exit,
      },
    ],
    tiles: [
      ["sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "sky"],
      ["ground", "ground", "ground", "ground"],
    ],
    actors: [
      {
        entityId: "runner-1",
        actorId: "runner-start",
        x: 0,
        y: 1,
      },
      {
        entityId: "beetle-1",
        actorId: "compact-beetle",
        x: 1,
        y: 1,
      },
      {
        entityId: "gate-1",
        actorId: "open-gate",
        x: 3,
        y: 1,
      },
    ],
  };
}

function makeSyntheticCompatibilityProfile() {
  const result = makeCompatibilityProfile({
    profileId: "synthetic-profile",
    actors: [
      {
        sourceActorId: "source-compact-beetle",
        actorId: "compact-beetle",
        role: ActorRole.Enemy,
        spriteWidthPixels: 16,
        spriteHeightPixels: 18,
        colliderWidthPixels: 8,
        colliderHeightPixels: 10,
        behaviorProfileId: "basic-patrol",
        stateColliders: [],
      },
    ],
    movementConstants: [],
    timers: [],
    unsupportedFeatures: [],
  });

  if (!result.ok) {
    throw new Error("Expected synthetic compatibility profile to validate.");
  }

  return result.value;
}

function makeSyntheticTimedCompatibilityProfile() {
  const result = makeCompatibilityProfile({
    profileId: "synthetic-timed-profile",
    actors: [],
    movementConstants: [],
    timers: [{ id: runtimeLevelTimerId, value: 240 }],
    unsupportedFeatures: [],
  });

  if (!result.ok) {
    throw new Error(
      "Expected synthetic timed compatibility profile to validate.",
    );
  }

  return result.value;
}

function makeSyntheticSpawnedPowerUpMovementProfile() {
  const result = makeCompatibilityProfile({
    profileId: "synthetic-spawned-power-up-profile",
    actors: [],
    movementConstants: [
      { id: spawnedPowerUpVelocityXConstantId, value: 48 },
      { id: spawnedPowerUpGravityConstantId, value: 960 },
      { id: spawnedPowerUpTerminalFallVelocityYConstantId, value: 320 },
    ],
    timers: [],
    unsupportedFeatures: [],
  });

  if (!result.ok) {
    throw new Error("Expected synthetic spawned power-up profile to validate.");
  }

  return result.value;
}

describe("applyCompatibilityProfileToLevelInput", () => {
  it("copies profile actor dimensions onto matching imported actor definitions", () => {
    const levelSpecInput = makeSyntheticLevelInput();
    const applied = applyCompatibilityProfileToLevelInput(
      levelSpecInput,
      makeSyntheticCompatibilityProfile(),
    );

    expect(applied.actorDefinitions[1]).toEqual({
      actorId: "compact-beetle",
      role: ActorRole.Enemy,
      spriteWidthPixels: 16,
      spriteHeightPixels: 18,
      colliderWidthPixels: 8,
      colliderHeightPixels: 10,
    });
    expect(levelSpecInput.actorDefinitions[1]).toEqual({
      actorId: "compact-beetle",
      role: ActorRole.Enemy,
    });
  });

  it("returns the original input object when no compatibility profile exists", () => {
    const levelSpecInput = makeSyntheticLevelInput();

    expect(
      applyCompatibilityProfileToLevelInput(levelSpecInput, undefined),
    ).toBe(levelSpecInput);
  });

  it("copies profile timers onto the imported level input", () => {
    const levelSpecInput = {
      ...makeSyntheticLevelInput(),
      levelTimers: [{ timerId: "source-intro.frames", frames: 30 }],
    };
    const applied = applyCompatibilityProfileToLevelInput(
      levelSpecInput,
      makeSyntheticTimedCompatibilityProfile(),
    );

    expect(applied.levelTimers).toEqual([
      { timerId: "source-intro.frames", frames: 30 },
      { timerId: runtimeLevelTimerId, frames: 240 },
    ]);
    expect(levelSpecInput.levelTimers).toEqual([
      { timerId: "source-intro.frames", frames: 30 },
    ]);
  });

  it("produces a runtime-valid LevelSpec when profile timers are applied", () => {
    const applied = applyCompatibilityProfileToLevelInput(
      makeSyntheticLevelInput(),
      makeSyntheticTimedCompatibilityProfile(),
    );
    const result = makeLevelSpec(applied);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected profile-timed level input to validate.");
    }

    expect(result.value.levelTimers).toEqual([
      { timerId: runtimeLevelTimerId, frames: 240 },
    ]);
  });

  it("copies profile spawned power-up movement constants onto imported level input", () => {
    const levelSpecInput = makeSyntheticLevelInput();
    const applied = applyCompatibilityProfileToLevelInput(
      levelSpecInput,
      makeSyntheticSpawnedPowerUpMovementProfile(),
    );

    expect(applied.spawnedPowerUpMovement).toEqual({
      velocityX: 48,
      gravity: 960,
      terminalFallVelocityY: 320,
    });
    expect(levelSpecInput.spawnedPowerUpMovement).toBeUndefined();
  });

  it("produces a runtime-valid LevelSpec when spawned power-up movement is applied", () => {
    const applied = applyCompatibilityProfileToLevelInput(
      makeSyntheticLevelInput(),
      makeSyntheticSpawnedPowerUpMovementProfile(),
    );
    const result = makeLevelSpec(applied);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(
        "Expected spawned-power-up-profiled level input to validate.",
      );
    }

    expect(result.value.spawnedPowerUpMovement).toEqual({
      velocityX: 48,
      gravity: 960,
      terminalFallVelocityY: 320,
    });
  });
});
