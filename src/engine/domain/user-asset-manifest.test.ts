import {
  UserAssetSourceKind,
  UserLevelEntryFormat,
} from "../domain/user-asset-manifest";
import { describe, expect, it } from "vitest";

import {
  parseUserAssetManifest,
  type UserAssetManifestInput,
} from "./user-asset-manifest";
import { ValidationErrorCode } from "./validation-error";

const validLevelVisualEraseRect = {
  x: 16,
  y: 160,
  width: 32,
  height: 32,
  fill: { red: 92, green: 148, blue: 252 },
};

function makeLevelVisualInput(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    source: { kind: UserAssetSourceKind.File, fileName: "level.png" },
    frame: { x: 0, y: 0, width: 320, height: 180 },
    offsetX: 0,
    offsetY: 16,
    eraseRects: [validLevelVisualEraseRect],
    ...overrides,
  };
}

function makePlayerSpriteInput(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    source: { kind: UserAssetSourceKind.File, fileName: "player.png" },
    frame: { x: 0, y: 0, width: 16, height: 24 },
    ...overrides,
  };
}

function makeValidManifestInput(): UserAssetManifestInput {
  return {
    version: "1",
    tileSprites: {
      grass: {
        source: { kind: UserAssetSourceKind.File, fileName: "tiles.png" },
        frame: { x: 0, y: 0, width: 16, height: 16 },
      },
    },
    actorSprites: {
      beetle: {
        source: {
          kind: UserAssetSourceKind.Url,
          url: "https://example.com/actors.png",
        },
        frame: { x: 0, y: 0, width: 12, height: 12 },
        stateSprites: {
          "walk-left": {
            source: {
              kind: UserAssetSourceKind.Url,
              url: "https://example.com/actors.png",
            },
            frame: { x: 12, y: 0, width: 12, height: 12 },
          },
        },
      },
    },
    playerSprite: makePlayerSpriteInput({
      transparentColor: { red: 92, green: 148, blue: 252, tolerance: 8 },
      stateSprites: {
        "small-jump": {
          source: { kind: UserAssetSourceKind.File, fileName: "player.png" },
          frame: { x: 16, y: 0, width: 16, height: 24 },
          transparentColor: { red: 92, green: 148, blue: 252, tolerance: 8 },
        },
      },
    }),
    levelVisuals: {
      "custom-level": makeLevelVisualInput(),
    },
    sounds: {
      jump: {
        source: { kind: UserAssetSourceKind.File, fileName: "jump.wav" },
      },
    },
    music: {
      level1: {
        source: { kind: UserAssetSourceKind.File, fileName: "level1.ogg" },
      },
    },
    levels: [
      {
        name: "custom-level",
        format: UserLevelEntryFormat.OriginalJson,
        source: { kind: UserAssetSourceKind.File, fileName: "level.json" },
        importMetadataSource: {
          kind: UserAssetSourceKind.File,
          fileName: "metadata.json",
        },
        compatibilityProfileSource: {
          kind: UserAssetSourceKind.File,
          fileName: "profile.json",
        },
      },
    ],
  };
}

function expectValidationErrorCode(
  result: ReturnType<typeof parseUserAssetManifest>,
  expectedCode: ValidationErrorCode,
): void {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected parse failure.");
  }

  expect(result.errors[0]?.code).toBe(expectedCode);
}

describe("parseUserAssetManifest", () => {
  it("parses a valid manifest", () => {
    const result = parseUserAssetManifest(makeValidManifestInput());

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected successful parse.");
    }

    expect(result.value.levels[0]?.compatibilityProfileSource).toEqual({
      kind: UserAssetSourceKind.File,
      fileName: "profile.json",
    });
    expect(result.value.levels[0]?.importMetadataSource).toEqual({
      kind: UserAssetSourceKind.File,
      fileName: "metadata.json",
    });
    expect(result.value.playerSprite?.transparentColor).toEqual({
      red: 92,
      green: 148,
      blue: 252,
      tolerance: 8,
    });
    expect(result.value.playerSprite?.stateSprites["small-jump"]).toEqual({
      source: { kind: UserAssetSourceKind.File, fileName: "player.png" },
      frame: { x: 16, y: 0, width: 16, height: 24 },
      transparentColor: { red: 92, green: 148, blue: 252, tolerance: 8 },
    });
    expect(result.value.actorSprites.beetle?.stateSprites["walk-left"]).toEqual(
      {
        source: {
          kind: UserAssetSourceKind.Url,
          url: "https://example.com/actors.png",
        },
        frame: { x: 12, y: 0, width: 12, height: 12 },
        transparentColor: undefined,
      },
    );
    expect(result.value.levelVisuals["custom-level"]).toEqual({
      source: { kind: UserAssetSourceKind.File, fileName: "level.png" },
      frame: { x: 0, y: 0, width: 320, height: 180 },
      offsetX: 0,
      offsetY: 16,
      eraseRects: [validLevelVisualEraseRect],
    });
  });

  it("parses a minimal manifest with only version", () => {
    const result = parseUserAssetManifest({ version: "1" });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error("Expected successful parse.");
    }

    expect(result.value.tileSprites).toEqual({});
    expect(result.value.actorSprites).toEqual({});
    expect(result.value.playerSprite).toBeUndefined();
    expect(result.value.reactionSprites).toEqual({});
    expect(result.value.levelVisuals).toEqual({});
    expect(result.value.sounds).toEqual({});
    expect(result.value.music).toEqual({});
    expect(result.value.levels).toEqual([]);
  });

  it("parses reaction sprite entries", () => {
    const result = parseUserAssetManifest({
      version: "1",
      reactionSprites: {
        "player-head-bonk": {
          source: { kind: "url", url: "ouch.png" },
          frame: { x: 0, y: 0, width: 16, height: 16 },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected successful parse.");
    }
    expect(result.value.reactionSprites["player-head-bonk"]?.frame.width).toBe(
      16,
    );
  });

  it("rejects an unsupported manifest version", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      version: "2",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected parse failure.");
    }

    expect(result.errors[0]?.code).toBe(
      ValidationErrorCode.ManifestVersionUnsupported,
    );
  });

  it("rejects a sprite entry with a missing source", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      tileSprites: {
        grass: {
          frame: { x: 0, y: 0, width: 16, height: 16 },
        },
      },
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a sprite frame with non-positive dimensions", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      tileSprites: {
        grass: {
          source: { kind: UserAssetSourceKind.File, fileName: "tiles.png" },
          frame: { x: 0, y: 0, width: 0, height: 16 },
        },
      },
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a sprite transparent color outside the byte range", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      playerSprite: makePlayerSpriteInput({
        transparentColor: { red: 256, green: 148, blue: 252, tolerance: 8 },
      }),
    });

    expectValidationErrorCode(
      result,
      ValidationErrorCode.ManifestIntegerInvalid,
    );
  });

  it("rejects a sprite transparent color with a missing tolerance", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      actorSprites: {
        beetle: {
          source: {
            kind: UserAssetSourceKind.Url,
            url: "https://example.com/actors.png",
          },
          frame: { x: 0, y: 0, width: 12, height: 12 },
          transparentColor: { red: 92, green: 148, blue: 252 },
        },
      },
    });

    expectValidationErrorCode(
      result,
      ValidationErrorCode.ManifestIntegerInvalid,
    );
  });

  it("rejects an empty sprite state key", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      playerSprite: makePlayerSpriteInput({
        stateSprites: {
          "": {
            source: { kind: UserAssetSourceKind.File, fileName: "player.png" },
            frame: { x: 16, y: 0, width: 16, height: 24 },
          },
        },
      }),
    });

    expectValidationErrorCode(
      result,
      ValidationErrorCode.ManifestSpriteEntryInvalid,
    );
  });

  it("rejects a level visual with an invalid offset", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      levelVisuals: {
        "custom-level": makeLevelVisualInput({ offsetX: -1 }),
      },
    });

    expectValidationErrorCode(
      result,
      ValidationErrorCode.ManifestIntegerInvalid,
    );
  });

  it("rejects a level visual erase rectangle with an invalid fill", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      levelVisuals: {
        "custom-level": makeLevelVisualInput({
          eraseRects: [
            {
              x: 0,
              y: 0,
              width: 16,
              height: 16,
              fill: { red: 92, green: 148, blue: 300 },
            },
          ],
        }),
      },
    });

    expectValidationErrorCode(
      result,
      ValidationErrorCode.ManifestIntegerInvalid,
    );
  });

  it("rejects an asset source with an unknown kind", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      tileSprites: {
        grass: {
          source: { kind: "blob" },
          frame: { x: 0, y: 0, width: 16, height: 16 },
        },
      },
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected parse failure.");
    }

    expect(result.errors[0]?.code).toBe(
      ValidationErrorCode.ManifestAssetSourceKindInvalid,
    );
  });

  it("rejects a level with an unsupported format", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      levels: [
        {
          name: "bad-level",
          format: "proprietary-binary",
          source: { kind: UserAssetSourceKind.File, fileName: "level.bin" },
        },
      ],
    });

    expectValidationErrorCode(
      result,
      ValidationErrorCode.ManifestLevelFormatInvalid,
    );
  });

  it("rejects a level with a missing name", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      levels: [
        {
          name: "",
          format: UserLevelEntryFormat.OriginalJson,
          source: { kind: UserAssetSourceKind.File, fileName: "level.json" },
        },
      ],
    });

    expectValidationErrorCode(
      result,
      ValidationErrorCode.ManifestLevelNameInvalid,
    );
  });

  it("accepts all supported level formats", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      levels: [
        {
          name: "a",
          format: UserLevelEntryFormat.OriginalJson,
          source: { kind: UserAssetSourceKind.File, fileName: "a.json" },
          compatibilityProfileSource: undefined,
        },
        {
          name: "b",
          format: UserLevelEntryFormat.TiledJson,
          source: { kind: UserAssetSourceKind.File, fileName: "b.tmj" },
        },
        {
          name: "c",
          format: UserLevelEntryFormat.VglcText,
          source: { kind: UserAssetSourceKind.File, fileName: "c.json" },
        },
        {
          name: "d",
          format: UserLevelEntryFormat.VglcSmbText,
          source: { kind: UserAssetSourceKind.File, fileName: "d.txt" },
        },
        {
          name: "e",
          format: UserLevelEntryFormat.VglcSmbMultiLayer,
          source: { kind: UserAssetSourceKind.File, fileName: "e.txt" },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a level with an invalid compatibility profile source", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      levels: [
        {
          name: "custom-level",
          format: UserLevelEntryFormat.OriginalJson,
          source: { kind: UserAssetSourceKind.File, fileName: "level.json" },
          compatibilityProfileSource: { kind: "blob" },
        },
      ],
    });

    expectValidationErrorCode(
      result,
      ValidationErrorCode.ManifestAssetSourceKindInvalid,
    );
  });

  it("rejects a level with an invalid import metadata source", () => {
    const result = parseUserAssetManifest({
      ...makeValidManifestInput(),
      levels: [
        {
          name: "custom-level",
          format: UserLevelEntryFormat.VglcSmbText,
          source: { kind: UserAssetSourceKind.File, fileName: "level.txt" },
          importMetadataSource: { kind: "blob" },
        },
      ],
    });

    expectValidationErrorCode(
      result,
      ValidationErrorCode.ManifestAssetSourceKindInvalid,
    );
  });
});
