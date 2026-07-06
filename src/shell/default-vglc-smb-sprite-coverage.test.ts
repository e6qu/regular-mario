import { describe, expect, it } from "vitest";

import {
  ActorRole,
  TileCollisionKind,
  type LevelSpecInput,
} from "../engine/domain/level-spec";
import {
  UserAssetSourceKind,
  type UserAssetManifest,
  type UserBaseSpriteEntry,
} from "../engine/domain/user-asset-manifest";
import { validateDefaultVglcSmbSpriteCoverage } from "./default-vglc-smb-sprite-coverage";

const onePixelSpriteEntry: UserBaseSpriteEntry = {
  source: { kind: UserAssetSourceKind.Url, url: "assets/sprite.png" },
  frame: { x: 0, y: 0, width: 1, height: 1 },
  transparentColor: undefined,
};

function makeManifest(
  overrides: Partial<UserAssetManifest>,
): UserAssetManifest {
  return {
    version: "1",
    tileSprites: {},
    actorSprites: {},
    sounds: {},
    music: {},
    levels: [],
    levelVisuals: {},
    playerSprite: undefined,
    ...overrides,
  } as UserAssetManifest;
}

function makeStateSprites(
  stateKeys: readonly string[],
): Record<string, UserBaseSpriteEntry> {
  return Object.fromEntries(
    stateKeys.map((stateKey) => [stateKey, onePixelSpriteEntry]),
  );
}

function makeLevelInput(): LevelSpecInput {
  return {
    tileSizePixels: 16,
    widthTiles: 4,
    heightTiles: 3,
    tileDefinitions: [
      { tileId: "sky", collision: TileCollisionKind.Empty },
      { tileId: "ground", collision: TileCollisionKind.Solid },
    ],
    actorDefinitions: [
      { actorId: "runner-start", role: ActorRole.PlayerStart },
      { actorId: "enemy", role: ActorRole.Enemy },
      { actorId: "armored", role: ActorRole.ArmoredEnemy },
      { actorId: "open-gate", role: ActorRole.Exit },
    ],
    tiles: [
      ["sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "sky"],
      ["ground", "ground", "ground", "ground"],
    ],
    actors: [
      {
        entityId: "runner-start-1",
        actorId: "runner-start",
        x: 0,
        y: 1,
      },
      {
        entityId: "enemy-1",
        actorId: "enemy",
        x: 1,
        y: 1,
      },
      {
        entityId: "armored-1",
        actorId: "armored",
        x: 2,
        y: 1,
      },
      {
        entityId: "open-gate-1",
        actorId: "open-gate",
        x: 3,
        y: 1,
      },
    ],
  };
}

const allRequiredPlayerStateKeys = [
  "small-idle",
  "small-walk",
  "small-run",
  "small-jump",
  "small-fall",
  "small-climb",
  "powered-idle",
  "powered-walk",
  "powered-run",
  "powered-jump",
  "powered-fall",
  "powered-climb",
  "recovering-idle",
  "recovering-walk",
  "recovering-run",
  "recovering-jump",
  "recovering-fall",
  "recovering-climb",
] as const;

describe("validateDefaultVglcSmbSpriteCoverage", () => {
  it("fails loudly for missing player state sprites", () => {
    const messages = validateDefaultVglcSmbSpriteCoverage(
      makeManifest({
        playerSprite: {
          ...onePixelSpriteEntry,
          stateSprites: makeStateSprites(["small-idle"]),
        },
        tileSprites: {
          sky: onePixelSpriteEntry,
          ground: onePixelSpriteEntry,
        },
        actorSprites: {
          enemy: { ...onePixelSpriteEntry, stateSprites: {} },
          armored: { ...onePixelSpriteEntry, stateSprites: {} },
          "open-gate": { ...onePixelSpriteEntry, stateSprites: {} },
        },
      }),
      makeLevelInput(),
    );

    expect(messages).toContain(
      "Default VGLC SMB dev mode requires ignored local playerSprite stateSprites for every rendered player state. Missing playerSprite stateSprites: powered-climb, powered-fall, powered-idle, powered-jump, powered-run, powered-walk, recovering-climb, recovering-fall, recovering-idle, recovering-jump, recovering-run, recovering-walk, small-climb, small-fall, small-jump, small-run, small-walk.",
    );
  });

  it("fails loudly for missing enemy and armored shell state sprites", () => {
    const messages = validateDefaultVglcSmbSpriteCoverage(
      makeManifest({
        playerSprite: {
          ...onePixelSpriteEntry,
          stateSprites: makeStateSprites(allRequiredPlayerStateKeys),
        },
        tileSprites: {
          sky: onePixelSpriteEntry,
          ground: onePixelSpriteEntry,
        },
        actorSprites: {
          enemy: {
            ...onePixelSpriteEntry,
            stateSprites: makeStateSprites(["walk-left"]),
          },
          armored: {
            ...onePixelSpriteEntry,
            stateSprites: makeStateSprites(["walk-left", "shell-idle"]),
          },
          "open-gate": { ...onePixelSpriteEntry, stateSprites: {} },
        },
      }),
      makeLevelInput(),
    );

    expect(messages).toContain(
      "Default VGLC SMB dev mode requires ignored local actorSprites.enemy.stateSprites for every rendered actor state. Missing actorSprites.enemy.stateSprites: walk-right.",
    );
    expect(messages).toContain(
      "Default VGLC SMB dev mode requires ignored local actorSprites.armored.stateSprites for every rendered actor state. Missing actorSprites.armored.stateSprites: shell-left, shell-right, walk-right.",
    );
    expect(
      messages.some((message) =>
        message.includes("actorSprites.open-gate.stateSprites"),
      ),
    ).toBe(false);
  });
});
