import { TileCollisionKind, ActorRole } from "../domain/level-spec";
import { describe, expect, it } from "vitest";

import { makeEntityId } from "./identifiers";
import { makeLevelSpec, type LevelSpecInput } from "./level-spec";
import { ValidationErrorCode } from "./validation-error";

function entityIdFromValue(value: string) {
  const result = makeEntityId(value, "test.entityId");
  if (!result.ok) {
    throw new Error("Expected valid test entity id.");
  }
  return result.value;
}

function makeValidLevelInput(): LevelSpecInput {
  return {
    widthTiles: 3,
    heightTiles: 2,
    tileSizePixels: 16,
    tileDefinitions: [
      {
        tileId: "sky",
        collision: TileCollisionKind.Empty,
      },
      {
        tileId: "ground",
        collision: TileCollisionKind.Solid,
      },
    ],
    actorDefinitions: [
      {
        actorId: "player",
        role: ActorRole.PlayerStart,
      },
      {
        actorId: "level-exit",
        role: ActorRole.Exit,
      },
    ],
    tiles: [
      ["sky", "sky", "sky"],
      ["ground", "ground", "ground"],
    ],
    actors: [
      {
        entityId: "player-1",
        actorId: "player",
        x: 1,
        y: 0,
      },
      {
        entityId: "exit-1",
        actorId: "level-exit",
        x: 2,
        y: 0,
      },
    ],
  };
}

function makeValidLevelInputWithEnemy(): LevelSpecInput {
  return {
    ...makeValidLevelInput(),
    actorDefinitions: [
      ...makeValidLevelInput().actorDefinitions,
      {
        actorId: "beetle",
        role: ActorRole.Enemy,
      },
    ],
    actors: [
      ...makeValidLevelInput().actors,
      {
        entityId: "beetle-1",
        actorId: "beetle",
        x: 0,
        y: 0,
      },
    ],
  };
}

describe("makeLevelSpec", () => {
  it("accepts a valid authored level spec", () => {
    const input = makeValidLevelInput();
    const result = makeLevelSpec(input);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected valid level input to succeed.");
    }

    expect(result.value).toEqual({
      widthTiles: input.widthTiles,
      heightTiles: input.heightTiles,
      tileSizePixels: input.tileSizePixels,
      tileDefinitions: input.tileDefinitions.map((definition) => ({
        ...definition,
        contentsActorId: undefined,
        contentSpawnLimit: undefined,
      })),
      actorDefinitions: input.actorDefinitions.map((definition) => ({
        ...definition,
        spriteWidthPixels: undefined,
        spriteHeightPixels: undefined,
        colliderWidthPixels: undefined,
        colliderHeightPixels: undefined,
        fireproof: false,
        spiky: false,
        turnsAtLedges: false,
        wingedFlight: undefined,
        projectileHitPoints: 1,
      })),
      tiles: input.tiles,
      actors: [
        {
          entityId: "player-1",
          actorId: "player",
          position: {
            x: 1,
            y: 0,
          },
          targetLevelName: undefined,
          targetTilePosition: undefined,
          pipeEntryDirection: "down",
        },
        {
          entityId: "exit-1",
          actorId: "level-exit",
          position: {
            x: 2,
            y: 0,
          },
          targetLevelName: undefined,
          targetTilePosition: undefined,
          pipeEntryDirection: "down",
        },
      ],
      pipes: [],
      enemyPatrolSpeedByEntityId: new Map(),
      levelTimers: [],
      pathAnnotations: [],
      timedHazardProjectileSpawners: [],
      spawnedPowerUpMovement: undefined,
      cheepFrenzy: undefined,
      firebars: [],
      podoboos: [],
      platforms: [],
      loopZones: [],
    });
  });

  it("accepts explicit level timer definitions", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      levelTimers: [
        {
          timerId: "level-timer.frames",
          frames: 120,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected valid timer input to succeed.");
    }

    expect(result.value.levelTimers).toEqual([
      {
        timerId: "level-timer.frames",
        frames: 120,
      },
    ]);
  });

  it("rejects invalid and duplicate level timer definitions", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      levelTimers: [
        {
          timerId: "level-timer.frames",
          frames: 120,
        },
        {
          timerId: "level-timer.frames",
          frames: 0,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.LevelTimerInvalid,
          message: "levelTimers[1].timerId must be unique within levelTimers.",
          path: "levelTimers[1].timerId",
        },
        {
          code: ValidationErrorCode.LevelTimerInvalid,
          message: "levelTimers[1].frames must be a positive safe integer.",
          path: "levelTimers[1].frames",
        },
      ],
    });
  });

  it("accepts path annotations", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      pathAnnotations: [
        {
          pathId: "main-route",
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected path annotations to validate.");
    }

    expect(result.value.pathAnnotations).toEqual([
      {
        pathId: "main-route",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
    ]);
  });

  it("rejects invalid, duplicate, empty, and out-of-bounds path annotations", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      pathAnnotations: [
        {
          pathId: "main-route",
          points: [{ x: 0, y: 0 }],
        },
        {
          pathId: "main-route",
          points: [],
        },
        {
          pathId: " ",
          points: [{ x: 3, y: 0 }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected invalid path annotations to fail.");
    }

    expect(result.errors).toContainEqual({
      code: ValidationErrorCode.PathAnnotationInvalid,
      message:
        "pathAnnotations[1].pathId must be unique within pathAnnotations.",
      path: "pathAnnotations[1].pathId",
    });
    expect(result.errors).toContainEqual({
      code: ValidationErrorCode.PathAnnotationInvalid,
      message:
        "pathAnnotations[1].points must contain at least one tile coordinate.",
      path: "pathAnnotations[1].points",
    });
    expect(result.errors).toContainEqual({
      code: ValidationErrorCode.PathAnnotationInvalid,
      message:
        "pathAnnotations[2].pathId must start with an alphanumeric character and contain only alphanumeric characters, dot, underscore, colon, or hyphen.",
      path: "pathAnnotations[2].pathId",
    });
    expect(result.errors).toContainEqual({
      code: ValidationErrorCode.PathAnnotationInvalid,
      message: "pathAnnotations[2].points[0] must be inside the level bounds.",
      path: "pathAnnotations[2].points[0]",
    });
  });

  it("accepts timed hazard projectile spawners", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      timedHazardProjectileSpawners: [
        {
          spawnerId: "cannon-1",
          x: 0,
          y: 0,
          direction: "right",
          intervalFrames: 120,
          initialDelayFrames: 30,
          speedPixelsPerSecond: 80,
          widthPixels: 8,
          heightPixels: 8,
          lifetimeFrames: 180,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected timed hazard projectile spawner to validate.");
    }

    expect(result.value.timedHazardProjectileSpawners).toEqual([
      {
        spawnerId: "cannon-1",
        position: { x: 0, y: 0 },
        direction: "right",
        intervalFrames: 120,
        initialDelayFrames: 30,
        speedPixelsPerSecond: 80,
        widthPixels: 8,
        heightPixels: 8,
        lifetimeFrames: 180,
        stompable: false,
      },
    ]);
  });

  it("rejects invalid and duplicate timed hazard projectile spawners", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      timedHazardProjectileSpawners: [
        {
          spawnerId: "cannon-1",
          x: 0,
          y: 0,
          direction: "right",
          intervalFrames: 120,
          initialDelayFrames: 0,
          speedPixelsPerSecond: 80,
          widthPixels: 8,
          heightPixels: 8,
          lifetimeFrames: 180,
        },
        {
          spawnerId: "cannon-1",
          x: 3,
          y: 0,
          direction: "up",
          intervalFrames: 0,
          initialDelayFrames: -1,
          speedPixelsPerSecond: 0,
          widthPixels: 0,
          heightPixels: 8,
          lifetimeFrames: 0,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error(
        "Expected invalid timed hazard projectile spawners to fail.",
      );
    }

    expect(
      result.errors.filter(
        (error) =>
          error.code === ValidationErrorCode.TimedHazardProjectileInvalid,
      ).length,
    ).toBeGreaterThanOrEqual(7);
    expect(result.errors).toContainEqual({
      code: ValidationErrorCode.TimedHazardProjectileInvalid,
      message:
        "timedHazardProjectileSpawners[1].spawnerId must be unique within timedHazardProjectileSpawners.",
      path: "timedHazardProjectileSpawners[1].spawnerId",
    });
  });

  it("resolves authored enemy patrol speed overrides keyed by entity id", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInputWithEnemy(),
      enemyPatrolSpeedByEntityId: {
        "beetle-1": 3,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected valid override input to succeed.");
    }

    expect(
      result.value.enemyPatrolSpeedByEntityId.get(
        entityIdFromValue("beetle-1"),
      ),
    ).toBe(3);
  });

  it("accepts profile-backed actor sprite and collider dimensions", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInputWithEnemy(),
      actorDefinitions: [
        ...makeValidLevelInput().actorDefinitions,
        {
          actorId: "beetle",
          role: ActorRole.Enemy,
          spriteWidthPixels: 16,
          spriteHeightPixels: 24,
          colliderWidthPixels: 10,
          colliderHeightPixels: 12,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected valid actor dimensions to succeed.");
    }

    expect(result.value.actorDefinitions[2]).toEqual({
      actorId: "beetle",
      role: ActorRole.Enemy,
      spriteWidthPixels: 16,
      spriteHeightPixels: 24,
      colliderWidthPixels: 10,
      colliderHeightPixels: 12,
      fireproof: false,
      spiky: false,
      turnsAtLedges: false,
      wingedFlight: undefined,
      projectileHitPoints: 1,
    });
  });

  it("accepts profile-backed spawned power-up movement constants", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      spawnedPowerUpMovement: {
        velocityX: 48,
        gravity: 960,
        terminalFallVelocityY: 320,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected valid spawned power-up movement to succeed.");
    }

    expect(result.value.spawnedPowerUpMovement).toEqual({
      velocityX: 48,
      gravity: 960,
      terminalFallVelocityY: 320,
    });
  });

  it("rejects invalid spawned power-up movement constants", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      spawnedPowerUpMovement: {
        velocityX: Number.NaN,
        gravity: 0,
        terminalFallVelocityY: -1,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected invalid spawned power-up movement to fail.");
    }

    expect(result.errors).toEqual([
      {
        code: ValidationErrorCode.VelocityInvalid,
        message: "spawnedPowerUpMovement.velocityX must be a finite number.",
        path: "spawnedPowerUpMovement.velocityX",
      },
      {
        code: ValidationErrorCode.AccelerationInvalid,
        message:
          "spawnedPowerUpMovement.gravity must be a positive finite number.",
        path: "spawnedPowerUpMovement.gravity",
      },
      {
        code: ValidationErrorCode.VelocityInvalid,
        message:
          "spawnedPowerUpMovement.terminalFallVelocityY must be a positive finite number.",
        path: "spawnedPowerUpMovement.terminalFallVelocityY",
      },
    ]);
  });

  it("rejects invalid actor collider dimensions", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInputWithEnemy(),
      actorDefinitions: [
        ...makeValidLevelInput().actorDefinitions,
        {
          actorId: "beetle",
          role: ActorRole.Enemy,
          colliderWidthPixels: 0,
          colliderHeightPixels: Number.NaN,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected invalid actor dimensions to fail.");
    }

    expect(result.errors).toEqual([
      {
        code: ValidationErrorCode.ColliderDimensionInvalid,
        message:
          "actorDefinitions[2].colliderWidthPixels must be a positive finite number.",
        path: "actorDefinitions[2].colliderWidthPixels",
      },
      {
        code: ValidationErrorCode.ColliderDimensionInvalid,
        message:
          "actorDefinitions[2].colliderHeightPixels must be a positive finite number.",
        path: "actorDefinitions[2].colliderHeightPixels",
      },
    ]);
  });

  it("rejects enemy patrol speed overrides referencing a non-enemy entity", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInputWithEnemy(),
      enemyPatrolSpeedByEntityId: {
        "player-1": 3,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected override referencing a non-enemy to fail.");
    }
    expect(
      result.errors.some(
        (error) =>
          error.code === ValidationErrorCode.EnemyPatrolSpeedEntityNotEnemy,
      ),
    ).toBe(true);
  });

  it("rejects invalid enemy patrol speed override values", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInputWithEnemy(),
      enemyPatrolSpeedByEntityId: {
        "beetle-1": Number.NaN,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected invalid override value to fail.");
    }
    expect(
      result.errors.some(
        (error) => error.code === ValidationErrorCode.VelocityInvalid,
      ),
    ).toBe(true);
  });

  it("collects dimension errors before reference validation", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      widthTiles: 0,
      tileSizePixels: 0,
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.DimensionInvalid,
          message: "widthTiles must be a positive integer.",
          path: "widthTiles",
        },
        {
          code: ValidationErrorCode.TileSizeInvalid,
          message: "tileSizePixels must be a positive integer.",
          path: "tileSizePixels",
        },
      ],
    });
  });

  it("rejects invalid references, duplicate entities, and actor position errors", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      widthTiles: 2,
      tiles: [
        ["sky", "unknown-tile"],
        ["ground", "ground"],
      ],
      actors: [
        {
          entityId: "player",
          actorId: "player",
          x: 0,
          y: 0,
        },
        {
          entityId: "player",
          actorId: "unknown-actor",
          x: 2,
          y: -1,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.UnknownTileId,
          message: "tiles[0][1] must reference a tile definition.",
          path: "tiles[0][1]",
        },
        {
          code: ValidationErrorCode.ActorPositionOutOfBounds,
          message: "actors[1].x must be inside level width.",
          path: "actors[1].x",
        },
        {
          code: ValidationErrorCode.EntityIdDuplicate,
          message: "actors[1].entityId must be unique.",
          path: "actors[1].entityId",
        },
        {
          code: ValidationErrorCode.UnknownActorId,
          message: "actors[1].actorId must reference an actor definition.",
          path: "actors[1].actorId",
        },
        {
          code: ValidationErrorCode.ActorCoordinateInvalid,
          message: "actors[1].y must be a non-negative integer.",
          path: "actors[1].y",
        },
        {
          code: ValidationErrorCode.ExitCountInvalid,
          message: "actors must include at least one exit actor.",
          path: "actors",
        },
      ],
    });
  });

  it("rejects duplicate definitions and invalid definition kinds", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      heightTiles: 1,
      tileDefinitions: [
        {
          tileId: "sky",
          collision: TileCollisionKind.Empty,
        },
        {
          tileId: "sky",
          collision: "made-up",
        },
      ],
      actorDefinitions: [
        {
          actorId: "player",
          role: ActorRole.PlayerStart,
        },
        {
          actorId: "player",
          role: "made-up",
        },
      ],
      tiles: [["sky", "sky", "sky"]],
      actors: [
        {
          entityId: "player-1",
          actorId: "player",
          x: 0,
          y: 0,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.TileDefinitionDuplicate,
          message: "tileDefinitions[1].tileId must be unique.",
          path: "tileDefinitions[1].tileId",
        },
        {
          code: ValidationErrorCode.TileCollisionInvalid,
          message:
            "tileDefinitions[1].collision must be one of: empty, solid, interactive, breakable, solid-hazard, hazard, spring, goal, hidden.",
          path: "tileDefinitions[1].collision",
        },
        {
          code: ValidationErrorCode.ActorDefinitionDuplicate,
          message: "actorDefinitions[1].actorId must be unique.",
          path: "actorDefinitions[1].actorId",
        },
        {
          code: ValidationErrorCode.ActorRoleInvalid,
          message:
            "actorDefinitions[1].role must be one of: player-start, enemy, flying-enemy, chasing-enemy, armored-enemy, throwing-enemy, aerial-throwing-enemy, piranha-plant, coin, item, power-up, extra-life, invincibility-power-up, climbable, exit, pipe.",
          path: "actorDefinitions[1].role",
        },
      ],
    });
  });

  it("accepts explicit interactive block content spawn limits", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      tileDefinitions: [
        ...makeValidLevelInput().tileDefinitions,
        {
          tileId: "coin-box",
          collision: TileCollisionKind.Interactive,
          contentsActorId: "coin",
          contentSpawnLimit: 10,
        },
      ],
      actorDefinitions: [
        ...makeValidLevelInput().actorDefinitions,
        {
          actorId: "coin",
          role: ActorRole.Coin,
        },
      ],
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected repeatable content block to validate.");
    }

    expect(
      result.value.tileDefinitions.find(
        (definition) => definition.tileId === "coin-box",
      ),
    ).toMatchObject({
      contentsActorId: "coin",
      contentSpawnLimit: 10,
    });
  });

  it("rejects content spawn limits without block contents", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      tileDefinitions: [
        ...makeValidLevelInput().tileDefinitions,
        {
          tileId: "empty-box",
          collision: TileCollisionKind.Interactive,
          contentSpawnLimit: 2,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.TileContentSpawnLimitInvalid,
          message:
            "tileDefinitions[2].contentSpawnLimit requires contentsActorId.",
          path: "tileDefinitions[2].contentSpawnLimit",
        },
      ],
    });
  });

  it("rejects non-positive content spawn limits", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      tileDefinitions: [
        ...makeValidLevelInput().tileDefinitions,
        {
          tileId: "coin-box",
          collision: TileCollisionKind.Interactive,
          contentsActorId: "coin",
          contentSpawnLimit: 0,
        },
      ],
      actorDefinitions: [
        ...makeValidLevelInput().actorDefinitions,
        {
          actorId: "coin",
          role: ActorRole.Coin,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.TileContentSpawnLimitInvalid,
          message:
            "tileDefinitions[2].contentSpawnLimit must be a positive safe integer.",
          path: "tileDefinitions[2].contentSpawnLimit",
        },
      ],
    });
  });

  it("requires one player start and at least one exit actor", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      heightTiles: 1,
      tiles: [["sky", "sky", "sky"]],
      actors: [
        {
          entityId: "player-1",
          actorId: "player",
          x: 0,
          y: 0,
        },
        {
          entityId: "player-2",
          actorId: "player",
          x: 1,
          y: 0,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.PlayerStartCountInvalid,
          message: "actors must include exactly one player-start actor.",
          path: "actors",
        },
        {
          code: ValidationErrorCode.ExitCountInvalid,
          message: "actors must include at least one exit actor.",
          path: "actors",
        },
      ],
    });
  });

  it("does not report duplicate entity IDs for invalid raw entity IDs", () => {
    const result = makeLevelSpec({
      ...makeValidLevelInput(),
      heightTiles: 1,
      tiles: [["sky", "sky", "sky"]],
      actors: [
        {
          entityId: "",
          actorId: "player",
          x: 0,
          y: 0,
        },
        {
          entityId: "",
          actorId: "level-exit",
          x: 1,
          y: 0,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.EntityIdInvalid,
          message:
            "actors[0].entityId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.",
          path: "actors[0].entityId",
        },
        {
          code: ValidationErrorCode.EntityIdInvalid,
          message:
            "actors[1].entityId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.",
          path: "actors[1].entityId",
        },
      ],
    });
  });
});
