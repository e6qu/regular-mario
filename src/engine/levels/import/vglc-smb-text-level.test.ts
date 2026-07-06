import { ActorRole, TileCollisionKind } from "../../domain/level-spec";
import { ValidationErrorCode } from "../../domain/validation-error";
import { describe, expect, it } from "vitest";

import {
  requireParseFailure,
  requireParseSuccess,
  stepImportedLevelOnce,
} from "./import-test-support";
import { runtimeLevelTimerId } from "../../simulation/level-timer-state";
import {
  parseVglcSmbMultiLayerLevel,
  parseVglcSmbTextLevel,
} from "./vglc-smb-text-level";

function makeCannonProjectileMetadata(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    spawnerId: "cannon-1",
    x: 1,
    y: 0,
    direction: "left",
    intervalFrames: 120,
    initialDelayFrames: 30,
    speedPixelsPerSecond: 80,
    widthPixels: 8,
    heightPixels: 8,
    lifetimeFrames: 180,
    ...overrides,
  };
}

function expectTileDefinition(
  value: Readonly<{ readonly tileDefinitions: readonly unknown[] }>,
  tileId: string,
  collision: TileCollisionKind,
) {
  expect(value.tileDefinitions).toContainEqual({ tileId, collision });
}

describe("parseVglcSmbTextLevel", () => {
  it("converts supported direct VGLC SMB text into a validating LevelSpecInput", () => {
    const levelSpecInput = requireParseSuccess(
      parseVglcSmbTextLevel(["P--G", "-Eo-", "XXXX"].join("\n")),
    );

    expect(() => stepImportedLevelOnce(levelSpecInput)).not.toThrow();
  });

  it("maps supported terrain and actor symbols without a JSON wrapper", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel(["P<>G", "-[]-", "XXXX"].join("\n")),
    );

    expect(value.tileDefinitions).toEqual([
      { tileId: "empty", collision: TileCollisionKind.Empty },
      { tileId: "ground", collision: TileCollisionKind.Solid },
      { tileId: "pipe-top-left", collision: TileCollisionKind.Solid },
      { tileId: "pipe-top-right", collision: TileCollisionKind.Solid },
      { tileId: "pipe-left", collision: TileCollisionKind.Solid },
      { tileId: "pipe-right", collision: TileCollisionKind.Solid },
      {
        tileId: "full-question-block-coin",
        collision: TileCollisionKind.Interactive,
        contentsActorId: "vglc-smb-coin",
      },
      {
        tileId: "breakable-block",
        collision: TileCollisionKind.Breakable,
      },
      {
        tileId: "cannon-top",
        collision: TileCollisionKind.SolidHazard,
      },
      {
        tileId: "cannon-bottom",
        collision: TileCollisionKind.Solid,
      },
      {
        tileId: "flagpole",
        collision: TileCollisionKind.Goal,
      },
      {
        tileId: "full-question-block-power-up",
        collision: TileCollisionKind.Interactive,
        contentsActorId: "vglc-smb-power-up",
      },
    ]);
    expect(value.actorDefinitions).toEqual([
      { actorId: "vglc-smb-enemy", role: ActorRole.Enemy },
      { actorId: "vglc-smb-coin", role: ActorRole.Coin },
      { actorId: "runner-start", role: ActorRole.PlayerStart },
      { actorId: "open-gate", role: ActorRole.Exit },
      { actorId: "vglc-smb-power-up", role: ActorRole.PowerUp },
      { actorId: "vglc-smb-extra-life", role: ActorRole.ExtraLife },
      {
        actorId: "vglc-smb-invincibility",
        role: ActorRole.InvincibilityPowerUp,
      },
      { actorId: "vglc-smb-climbable", role: ActorRole.Climbable },
    ]);
    expect(value.tiles).toEqual([
      ["empty", "pipe-top-left", "pipe-top-right", "flagpole"],
      ["empty", "pipe-left", "pipe-right", "empty"],
      ["ground", "ground", "ground", "ground"],
    ]);
    expect(value.actors).toEqual([
      { entityId: "runner-start-1", actorId: "runner-start", x: 0, y: 0 },
      { entityId: "open-gate-1", actorId: "open-gate", x: 3, y: 0 },
    ]);
  });

  it("maps Q question blocks as coin blocks (VGLC coin marker)", () => {
    const value = requireParseSuccess(parseVglcSmbTextLevel("PQG\nXXX"));

    expect(value.tiles[0]).toEqual([
      "empty",
      "full-question-block-coin",
      "flagpole",
    ]);
  });

  it("maps raw flagpole symbols as goal tiles", () => {
    const value = requireParseSuccess(parseVglcSmbTextLevel("P|G\nXXX"));

    expect(value.tiles[0]).toEqual(["empty", "flagpole", "flagpole"]);
  });

  it("maps breakable block symbols as breakable tiles", () => {
    const value = requireParseSuccess(parseVglcSmbTextLevel("PSG\nXXX"));

    expect(value.tiles[0]).toEqual(["empty", "breakable-block", "flagpole"]);
  });

  it("maps cannon symbols with solid and hazard semantics", () => {
    const value = requireParseSuccess(parseVglcSmbTextLevel("PBG\nXbX"));

    expect(value.tiles).toEqual([
      ["empty", "cannon-top", "flagpole"],
      ["ground", "cannon-bottom", "ground"],
    ]);
  });

  it("maps annotated path cells to empty tiles and runtime path annotations", () => {
    const value = requireParseSuccess(parseVglcSmbTextLevel("PxG\nXxX"));

    expect(value.tiles).toEqual([
      ["empty", "empty", "flagpole"],
      ["ground", "empty", "ground"],
    ]);
    expect(value.pathAnnotations).toEqual([
      {
        pathId: "vglc-smb-annotated-path",
        points: [
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ]);
  });

  it("maps explicit path metadata to runtime path annotations", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel("P-G\nXXX", {
        paths: [
          {
            id: "main-route",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 2, y: 0 },
            ],
          },
        ],
      }),
    );

    expect(value.pathAnnotations).toEqual([
      {
        pathId: "main-route",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    ]);
  });

  it("maps transition metadata to pipe actors", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel(["P<>G", "-[]-", "XXXX"].join("\n"), {
        transitions: [
          {
            id: "pipe-a",
            x: 1,
            y: 0,
            targetLevelName: "underground",
            targetTileX: 2,
            targetTileY: 1,
          },
        ],
      }),
    );

    expect(value.actorDefinitions).toContainEqual({
      actorId: "vglc-smb-transition-pipe",
      role: ActorRole.Pipe,
    });
    expect(value.actors).toContainEqual({
      entityId: "vglc-smb-transition-pipe-a",
      actorId: "vglc-smb-transition-pipe",
      x: 1,
      y: 0,
      targetLevelName: "underground",
      targetTileX: 2,
      targetTileY: 1,
    });
    expect(() => stepImportedLevelOnce(value)).not.toThrow();
  });

  it("rejects invalid transition metadata", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        transitions: [
          {
            id: " ",
            x: 1,
            y: 0,
            targetLevelName: 42,
            targetTileX: -1,
            targetTileY: 0,
          },
        ],
      }),
    );

    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message: "metadata.transitions[0].id must be a non-empty string.",
      path: "metadata.transitions[0].id",
    });
    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.transitions[0].targetLevelName must be a string when provided.",
      path: "metadata.transitions[0].targetLevelName",
    });
    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.transitions[0].targetTileX must be a non-negative safe integer.",
      path: "metadata.transitions[0].targetTileX",
    });
  });

  it("rejects transition metadata that does not point at a pipe", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        transitions: [
          {
            id: "not-pipe",
            x: 1,
            y: 0,
            targetTileX: 0,
            targetTileY: 0,
          },
        ],
      }),
    );

    expect(errors[0]).toEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message: "metadata.transitions[0] must point at a pipe symbol.",
      path: "metadata.transitions[0]",
    });
  });

  it("rejects transition ids that cannot become runtime entity ids", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel(["P<>G", "XXXX"].join("\n"), {
        transitions: [
          {
            id: "Pipe_A",
            x: 1,
            y: 0,
            targetTileX: 0,
            targetTileY: 0,
          },
        ],
      }),
    );

    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.transitions[0].id must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.",
      path: "metadata.transitions[0].id",
    });
  });

  it("rejects duplicate and out-of-bounds transition metadata", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel(["P<>G", "XXXX"].join("\n"), {
        transitions: [
          {
            id: "pipe-a",
            x: 1,
            y: 0,
            targetTileX: 0,
            targetTileY: 0,
          },
          {
            id: "pipe-a",
            x: 8,
            y: 0,
            targetTileX: 0,
            targetTileY: 0,
          },
        ],
      }),
    );

    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.transitions[1].id must be unique within metadata.transitions.",
      path: "metadata.transitions[1].id",
    });
    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.transitions[1] must be inside the VGLC SMB text bounds.",
      path: "metadata.transitions[1]",
    });
  });

  it("rejects invalid path metadata", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        paths: [
          {
            id: " ",
            points: [{ x: 0, y: 0 }],
          },
          {
            id: "empty-route",
            points: [],
          },
        ],
      }),
    );

    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message: "metadata.paths[0].pathId must be a non-empty string.",
      path: "metadata.paths[0].pathId",
    });
    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.paths[1].points must contain at least one tile coordinate.",
      path: "metadata.paths[1].points",
    });
  });

  it("rejects path metadata outside the raw text bounds", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        paths: [
          {
            id: "out-of-bounds-route",
            points: [{ x: 3, y: 0 }],
          },
        ],
      }),
    );

    expect(errors).toEqual([
      {
        code: ValidationErrorCode.VglcMetadataInvalid,
        message:
          "metadata.paths[0].points[0] must be inside the VGLC SMB text bounds.",
        path: "metadata.paths[0].points[0]",
      },
    ]);
  });

  it("maps metadata-backed cannon projectiles to timed hazard projectile spawners", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel("PBG\nXbX", {
        cannonProjectiles: [makeCannonProjectileMetadata()],
      }),
    );

    expect(value.timedHazardProjectileSpawners).toEqual([
      {
        spawnerId: "cannon-1",
        x: 1,
        y: 0,
        direction: "left",
        intervalFrames: 120,
        initialDelayFrames: 30,
        speedPixelsPerSecond: 80,
        widthPixels: 8,
        heightPixels: 8,
        lifetimeFrames: 180,
      },
    ]);
  });

  it("rejects cannon projectile metadata that does not point at a cannon top", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        cannonProjectiles: [makeCannonProjectileMetadata()],
      }),
    );

    expect(errors[0]).toEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.cannonProjectiles[0] must point at a cannon top symbol.",
      path: "metadata.cannonProjectiles[0]",
    });
  });

  it("rejects invalid cannon projectile metadata fields", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("PBG\nXbX", {
        cannonProjectiles: [
          makeCannonProjectileMetadata({
            spawnerId: " ",
            direction: "up",
            intervalFrames: 0,
            initialDelayFrames: -1,
            speedPixelsPerSecond: 0,
            widthPixels: 0,
            lifetimeFrames: 0,
          }),
        ],
      }),
    );

    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.cannonProjectiles[0].spawnerId must be a non-empty string.",
      path: "metadata.cannonProjectiles[0].spawnerId",
    });
    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message: "metadata.cannonProjectiles[0].direction must be left or right.",
      path: "metadata.cannonProjectiles[0].direction",
    });
  });

  it("maps full question blocks through explicit contents metadata", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel("P??G\nXXXX", {
        questionBlocks: [
          { x: 1, y: 0, contents: "coin" },
          { x: 2, y: 0, contents: "power-up" },
        ],
      }),
    );

    expect(value.tiles[0]).toEqual([
      "empty",
      "full-question-block-coin",
      "full-question-block-power-up",
      "flagpole",
    ]);
  });

  it("maps full question blocks through default contents metadata", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel("P??G\nXXXX", {
        questionBlockContentsDefault: "coin",
      }),
    );

    expect(value.tiles[0]).toEqual([
      "empty",
      "full-question-block-coin",
      "full-question-block-coin",
      "flagpole",
    ]);
    expect(() => stepImportedLevelOnce(value)).not.toThrow();
  });

  it("lets explicit question block metadata override default contents metadata", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel("P??G\nXXXX", {
        questionBlockContentsDefault: "coin",
        questionBlocks: [{ x: 2, y: 0, contents: "power-up" }],
      }),
    );

    expect(value.tiles[0]).toEqual([
      "empty",
      "full-question-block-coin",
      "full-question-block-power-up",
      "flagpole",
    ]);
  });

  it("rejects invalid question block default contents metadata", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P?G\nXXX", {
        questionBlockContentsDefault: "star",
      }),
    );

    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.questionBlockContentsDefault must be coin or power-up.",
      path: "metadata.questionBlockContentsDefault",
    });
  });

  it("rejects unused question block default contents metadata", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        questionBlockContentsDefault: "coin",
      }),
    );

    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.questionBlockContentsDefault requires at least one full question block symbol.",
      path: "metadata.questionBlockContentsDefault",
    });
  });

  it("maps explicit timer metadata to level timers", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel("P-G\nXXX", {
        timers: [{ id: runtimeLevelTimerId, value: 400, unit: "frames" }],
      }),
    );

    expect(value.levelTimers).toEqual([
      {
        timerId: runtimeLevelTimerId,
        frames: 400,
      },
    ]);
  });

  it("converts explicit SMB timer units to runtime frames", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel("P-G\nXXX", {
        timer: {
          id: runtimeLevelTimerId,
          value: 400,
          unit: "smb-time-units",
        },
      }),
    );

    expect(value.levelTimers).toEqual([
      {
        timerId: runtimeLevelTimerId,
        frames: 9600,
      },
    ]);
  });

  it("rejects invalid timer metadata", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        timer: { id: runtimeLevelTimerId, value: 0 },
      }),
    );

    expect(errors[0]).toEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.timer.value must be a positive safe integer frame count.",
      path: "metadata.timer.value",
    });
  });

  it("rejects invalid SMB timer units", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        timer: {
          id: runtimeLevelTimerId,
          value: 400,
          unit: "seconds",
        },
      }),
    );

    expect(errors[0]).toEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message: "metadata.timer.unit must be frames or smb-time-units.",
      path: "metadata.timer.unit",
    });
  });

  it("rejects SMB timer unit conversion overflow", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        timer: {
          id: runtimeLevelTimerId,
          value: Number.MAX_SAFE_INTEGER,
          unit: "smb-time-units",
        },
      }),
    );

    expect(errors[0]).toEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.timer.value converted from SMB timer units must be a safe integer frame count.",
      path: "metadata.timer.value",
    });
  });

  it("uses metadata coordinates for player start and exits when raw text omits them", () => {
    const value = requireParseSuccess(
      parseVglcSmbTextLevel("-Eo-\nXXXX", {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 3, y: 0 }],
      }),
    );

    expect(value.actors).toEqual([
      { entityId: "runner-start-1", actorId: "runner-start", x: 0, y: 0 },
      { entityId: "vglc-smb-enemy-1", actorId: "vglc-smb-enemy", x: 1, y: 0 },
      { entityId: "vglc-smb-coin-1", actorId: "vglc-smb-coin", x: 2, y: 0 },
      { entityId: "open-gate-1", actorId: "open-gate", x: 3, y: 0 },
    ]);
    expect(value.tiles).toEqual([
      ["empty", "empty", "empty", "flagpole"],
      ["ground", "ground", "ground", "flagpole"],
    ]);
  });

  it("reports missing required metadata for raw corpus text without starts or exits", () => {
    const errors = requireParseFailure(parseVglcSmbTextLevel("-Eo-\nXXXX"));

    expect(errors).toEqual([
      {
        code: ValidationErrorCode.VglcMetadataMissing,
        message:
          "VGLC SMB text requires exactly one player start marker or metadata.playerStart coordinate.",
        path: "metadata.playerStart",
      },
      {
        code: ValidationErrorCode.VglcMetadataMissing,
        message:
          "VGLC SMB text requires at least one exit marker or metadata.exits coordinate.",
        path: "metadata.exits",
      },
    ]);
  });

  it("rejects import metadata outside the raw text bounds", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("--\nXX", {
        playerStart: { x: 2, y: 0 },
        exits: [{ x: 1, y: 0 }],
      }),
    );

    expect(errors[0]).toEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message: "metadata.playerStart must be inside the VGLC SMB text bounds.",
      path: "metadata.playerStart",
    });
  });

  it("reports missing metadata for full question blocks", () => {
    const errors = requireParseFailure(parseVglcSmbTextLevel("P?G\nXXX"));

    expect(errors).toEqual([
      {
        code: ValidationErrorCode.VglcCharacterUnsupported,
        message:
          "VGLC SMB character ? is unsupported (vglc-smb-question-block-contents): full question blocks need metadata.questionBlocks contents or metadata.questionBlockContentsDefault before direct SMB corpus parity.",
        path: "rows[0][1]",
      },
    ]);
  });

  it("rejects raw text multi-layer metadata instead of ignoring it", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P-G\nXXX", {
        multiLayer: { source: "synthetic" },
      }),
    );

    expect(errors).toEqual([
      {
        code: ValidationErrorCode.VglcMetadataUnsupported,
        message:
          "VGLC SMB import metadata field multiLayer is unsupported (vglc-smb-multi-layer): multi-layer source data requires the vglc-smb-multi-layer import format.",
        path: "metadata.multiLayer",
      },
    ]);
  });

  it("rejects question block metadata that does not point at a full question block", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("PQG\nXXX", {
        questionBlocks: [{ x: 1, y: 0, contents: "coin" }],
      }),
    );

    expect(errors[0]).toEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.questionBlocks[0] must point at a full question block symbol.",
      path: "metadata.questionBlocks[0]",
    });
  });

  it("rejects duplicate and out-of-bounds question block metadata", () => {
    const errors = requireParseFailure(
      parseVglcSmbTextLevel("P?G\nXXX", {
        questionBlocks: [
          { x: 1, y: 0, contents: "coin" },
          { x: 1, y: 0, contents: "power-up" },
          { x: 4, y: 0, contents: "coin" },
        ],
      }),
    );

    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.questionBlocks[1] duplicates another question block metadata coordinate.",
      path: "metadata.questionBlocks[1]",
    });
    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message:
        "metadata.questionBlocks[2] must be inside the VGLC SMB text bounds.",
      path: "metadata.questionBlocks[2]",
    });
  });

  it("rejects unknown symbols outside the SMB metadata symbol set", () => {
    const errors = requireParseFailure(parseVglcSmbTextLevel("PZG\nXXX"));

    expect(errors[0]?.code).toBe(ValidationErrorCode.VglcTileCharacterUnknown);
  });

  it("rejects ragged direct text rows", () => {
    const errors = requireParseFailure(parseVglcSmbTextLevel("P-G\nXX"));

    expect(errors[0]?.code).toBe(ValidationErrorCode.VglcGridWidthMismatch);
  });
});

describe("parseVglcSmbMultiLayerLevel", () => {
  it("maps supported structural layer symbols into a validating LevelSpecInput", () => {
    const value = requireParseSuccess(
      parseVglcSmbMultiLayerLevel(["-g?M+*HOCo|", "######Bpc[]"].join("\n"), {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 10, y: 0 }],
      }),
    );

    expect(value.tiles).toEqual([
      [
        "empty",
        "empty",
        "full-question-block-coin",
        "full-question-block-power-up",
        "extra-life-brick",
        "star-block",
        "beanstalk-block",
        "multi-coin-brick",
        "cannon-top",
        "empty",
        "flagpole",
      ],
      [
        "ground",
        "ground",
        "ground",
        "ground",
        "ground",
        "ground",
        "breakable-block",
        "pipe-left",
        "cannon-bottom",
        "pipe-top-left",
        "flagpole",
      ],
    ]);
    expect(value.tileDefinitions).toContainEqual({
      tileId: "multi-coin-brick",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-coin",
      contentSpawnLimit: 10,
      contentSpawnCooldownFrames: 16,
    });
    expect(value.tileDefinitions).toContainEqual({
      tileId: "extra-life-brick",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-extra-life",
      contentSpawnLimit: 1,
    });
    expect(value.tileDefinitions).toContainEqual({
      tileId: "star-block",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-invincibility",
      contentSpawnLimit: 1,
    });
    expect(value.tileDefinitions).toContainEqual({
      tileId: "beanstalk-block",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-climbable",
      contentSpawnLimit: 1,
    });
    expect(value.actorDefinitions).toContainEqual({
      actorId: "vglc-smb-extra-life",
      role: ActorRole.ExtraLife,
    });
    expect(value.actorDefinitions).toContainEqual({
      actorId: "vglc-smb-invincibility",
      role: ActorRole.InvincibilityPowerUp,
    });
    expect(value.actorDefinitions).toContainEqual({
      actorId: "vglc-smb-climbable",
      role: ActorRole.Climbable,
    });
    expect(value.actors).toHaveLength(4);
    expect(value.actors).toContainEqual({
      entityId: "vglc-smb-enemy-1",
      actorId: "vglc-smb-enemy",
      x: 1,
      y: 0,
    });
    expect(value.actors).toContainEqual({
      entityId: "vglc-smb-coin-1",
      actorId: "vglc-smb-coin",
      x: 9,
      y: 0,
    });
    expect(() => stepImportedLevelOnce(value)).not.toThrow();
  });

  it("maps multi-layer enemy symbols to explicit modeled enemy roles", () => {
    const value = requireParseSuccess(
      parseVglcSmbMultiLayerLevel(["-kKthl|", "#######"].join("\n"), {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 6, y: 0 }],
      }),
    );

    expect(value.actorDefinitions).toContainEqual({
      actorId: "vglc-smb-koopa",
      role: ActorRole.ArmoredEnemy,
    });
    expect(value.actorDefinitions).toContainEqual({
      actorId: "vglc-smb-parakoopa",
      role: ActorRole.FlyingEnemy,
    });
    expect(value.actorDefinitions).toContainEqual({
      actorId: "vglc-smb-turtle",
      role: ActorRole.ArmoredEnemy,
    });
    expect(value.actorDefinitions).toContainEqual({
      actorId: "vglc-smb-throwing-enemy",
      role: ActorRole.ThrowingEnemy,
    });
    expect(value.actorDefinitions).toContainEqual({
      actorId: "vglc-smb-aerial-throwing-enemy",
      role: ActorRole.AerialThrowingEnemy,
    });
    expect(value.actors).toEqual(
      expect.arrayContaining([
        {
          entityId: "vglc-smb-koopa-1",
          actorId: "vglc-smb-koopa",
          x: 1,
          y: 0,
        },
        {
          entityId: "vglc-smb-parakoopa-1",
          actorId: "vglc-smb-parakoopa",
          x: 2,
          y: 0,
        },
        {
          entityId: "vglc-smb-turtle-1",
          actorId: "vglc-smb-turtle",
          x: 3,
          y: 0,
        },
        {
          entityId: "vglc-smb-throwing-enemy-1",
          actorId: "vglc-smb-throwing-enemy",
          x: 4,
          y: 0,
        },
        {
          entityId: "vglc-smb-aerial-throwing-enemy-1",
          actorId: "vglc-smb-aerial-throwing-enemy",
          x: 5,
          y: 0,
        },
      ]),
    );
    expect(() => stepImportedLevelOnce(value)).not.toThrow();
  });

  it("maps multi-layer plant symbols to explicit static hazard tiles", () => {
    const value = requireParseSuccess(
      parseVglcSmbMultiLayerLevel(["-VX|", "####"].join("\n"), {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 3, y: 0 }],
      }),
    );

    expectTileDefinition(value, "plant-hazard", TileCollisionKind.Hazard);
    expect(value.tiles[0]).toEqual([
      "empty",
      "plant-hazard",
      "plant-hazard",
      "flagpole",
    ]);
    expect(() => stepImportedLevelOnce(value)).not.toThrow();
  });

  it("maps multi-layer spring symbols to explicit spring top and solid base tiles", () => {
    const value = requireParseSuccess(
      parseVglcSmbMultiLayerLevel(["-Y-|", "-y-#"].join("\n"), {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 3, y: 0 }],
      }),
    );

    expectTileDefinition(value, "spring-top", TileCollisionKind.Spring);
    expectTileDefinition(value, "spring-bottom", TileCollisionKind.Solid);
    expect(value.tiles[0]).toEqual([
      "empty",
      "spring-top",
      "empty",
      "flagpole",
    ]);
    expect(value.tiles[1]).toEqual([
      "empty",
      "spring-bottom",
      "empty",
      "flagpole",
    ]);
    expect(() => stepImportedLevelOnce(value)).not.toThrow();
  });

  it("maps player path layer cells to runtime path annotations", () => {
    const value = requireParseSuccess(
      parseVglcSmbMultiLayerLevel(["---", "###"].join("\n"), {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 2, y: 0 }],
        multiLayer: {
          playerPathLayer: ["x-x", "---"].join("\n"),
        },
      }),
    );

    expect(value.pathAnnotations).toEqual([
      {
        pathId: "vglc-smb-multi-layer-player-path",
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    ]);
  });

  it("maps multi-layer transition metadata to pipe actors", () => {
    const value = requireParseSuccess(
      parseVglcSmbMultiLayerLevel(["-[]", "-pP"].join("\n"), {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 2, y: 0 }],
        transitions: [
          {
            id: "pipe-b",
            x: 1,
            y: 1,
            targetTileX: 0,
            targetTileY: 0,
          },
        ],
      }),
    );

    expect(value.actors).toContainEqual({
      entityId: "vglc-smb-transition-pipe-b",
      actorId: "vglc-smb-transition-pipe",
      x: 1,
      y: 1,
      targetTileX: 0,
      targetTileY: 0,
    });
  });

  it("rejects invalid player path layer metadata", () => {
    const errors = requireParseFailure(
      parseVglcSmbMultiLayerLevel(["---", "###"].join("\n"), {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 2, y: 0 }],
        multiLayer: {
          playerPathLayer: ["x-z", "---"].join("\n"),
        },
      }),
    );

    expect(errors).toContainEqual({
      code: ValidationErrorCode.VglcMetadataInvalid,
      message: "metadata.multiLayer.playerPathLayer[0][2] must be - or x.",
      path: "metadata.multiLayer.playerPathLayer[0][2]",
    });
  });

  it("rejects unsupported source-specific structural symbols", () => {
    const errors = requireParseFailure(
      parseVglcSmbMultiLayerLevel("-v-", {
        playerStart: { x: 0, y: 0 },
        exits: [{ x: 2, y: 0 }],
      }),
    );

    expect(errors[0]).toEqual({
      code: ValidationErrorCode.VglcCharacterUnsupported,
      message:
        "VGLC SMB multi-layer character v is unsupported (vglc-smb-multi-layer-up-down-moving-platform): up-down moving platform behavior is not represented before direct SMB multi-layer parity.",
      path: "rows[0][1]",
    });
  });
});
