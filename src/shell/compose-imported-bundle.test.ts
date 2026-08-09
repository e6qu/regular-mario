import { describe, expect, it } from "vitest";

import {
  UserAssetSourceKind,
  type UserAssetManifest,
  type UserBaseSpriteEntry,
} from "../engine/domain/user-asset-manifest";
import { composeImportedBundleOverSkin } from "./compose-imported-bundle";
import type {
  LoadedImageAsset,
  LoadedLevelAsset,
  LoadedStatefulImageAsset,
  UserAssetBundle,
} from "./user-asset-loader";

function makeSpriteEntry(url: string): UserBaseSpriteEntry {
  return {
    source: { kind: UserAssetSourceKind.Url, url },
    frame: { x: 0, y: 0, width: 1, height: 1 },
    transparentColor: undefined,
  };
}

function makeImage(objectUrl: string): LoadedImageAsset {
  return {
    imageElement: { src: objectUrl } as HTMLImageElement,
    objectUrl,
    frame: { x: 0, y: 0, width: 1, height: 1 },
  };
}

function makeStatefulImage(objectUrl: string): LoadedStatefulImageAsset {
  return { ...makeImage(objectUrl), stateImages: new Map() };
}

function makeManifest(
  overrides: Partial<UserAssetManifest>,
): UserAssetManifest {
  return {
    version: "1",
    tileSprites: {},
    actorSprites: {},
    playerSprite: undefined,
    reactionSprites: {},
    levelVisuals: {},
    sounds: {},
    music: {},
    levels: [],
    ...overrides,
  } as UserAssetManifest;
}

function makeBundle(overrides: Partial<UserAssetBundle>): UserAssetBundle {
  return {
    manifest: makeManifest({}),
    tileImages: new Map(),
    reactionImages: new Map(),
    actorImages: new Map(),
    playerImage: undefined,
    levelVisualImages: new Map(),
    sounds: new Map(),
    music: new Map(),
    levels: new Map(),
    ...overrides,
  };
}

const skin = makeBundle({
  manifest: makeManifest({
    tileSprites: {
      ground: makeSpriteEntry("skin/ground.png"),
      brick: makeSpriteEntry("skin/brick.png"),
    },
    reactionSprites: { "enemy-stomped": makeSpriteEntry("skin/stomped.png") },
  }),
  tileImages: new Map([
    ["ground", makeImage("skin/ground")],
    ["brick", makeImage("skin/brick")],
  ]),
  reactionImages: new Map([["enemy-stomped", makeImage("skin/stomped")]]),
  actorImages: new Map([["enemy", makeStatefulImage("skin/enemy")]]),
  playerImage: makeStatefulImage("skin/player"),
});

describe("composeImportedBundleOverSkin", () => {
  it("gives a level-only import the game's own art", () => {
    // The failure this prevents: a shared demo link carries a level and no
    // sprites, so the scene's reaction art is absent and it throws while
    // building — with the canvas already mounted, which reads as a hang.
    const composed = composeImportedBundleOverSkin(makeBundle({}), skin);

    expect(composed.tileImages.get("ground")?.objectUrl).toBe("skin/ground");
    expect(composed.reactionImages.get("enemy-stomped")?.objectUrl).toBe(
      "skin/stomped",
    );
    expect(composed.actorImages.get("enemy")?.objectUrl).toBe("skin/enemy");
    expect(composed.playerImage?.objectUrl).toBe("skin/player");
  });

  it("lets the import's own art win over the skin's", () => {
    const composed = composeImportedBundleOverSkin(
      makeBundle({
        tileImages: new Map([["ground", makeImage("import/ground")]]),
        playerImage: makeStatefulImage("import/player"),
      }),
      skin,
    );

    expect(composed.tileImages.get("ground")?.objectUrl).toBe("import/ground");
    expect(composed.playerImage?.objectUrl).toBe("import/player");
    // Art the import did not replace is still the skin's.
    expect(composed.tileImages.get("brick")?.objectUrl).toBe("skin/brick");
  });

  it("keeps the manifest describing the art the bundle now holds", () => {
    // Sprite-coverage validation reads the manifest, so a manifest that still
    // claimed the import's original gaps would refuse a level that composes
    // perfectly well.
    const composed = composeImportedBundleOverSkin(
      makeBundle({
        manifest: makeManifest({
          tileSprites: { ground: makeSpriteEntry("import/ground.png") },
        }),
      }),
      skin,
    );

    expect(composed.manifest.tileSprites["ground"]?.source).toEqual({
      kind: UserAssetSourceKind.Url,
      url: "import/ground.png",
    });
    expect(composed.manifest.tileSprites["brick"]?.source).toEqual({
      kind: UserAssetSourceKind.Url,
      url: "skin/brick.png",
    });
    expect(Object.keys(composed.manifest.reactionSprites)).toEqual([
      "enemy-stomped",
    ]);
  });

  it("offers only the import's levels, never the skin's", () => {
    // The menu the user chose from must not silently grow the shipped levels.
    const importedLevel: LoadedLevelAsset = {
      name: "remote-demo",
      levelSpecInput: {
        widthTiles: 1,
        heightTiles: 1,
        tileSizePixels: 16,
        tileDefinitions: [],
        actorDefinitions: [],
        tiles: [],
        actors: [],
      },
      theme: undefined,
      compatibilityProfile: undefined,
      compatibilityConformanceReport: {
        profileId: undefined,
        actorProfileCount: 0,
        unsupportedFeatureCount: 0,
        issues: [],
      },
    };
    const composed = composeImportedBundleOverSkin(
      makeBundle({
        levels: new Map([["remote-demo", importedLevel]]),
      }),
      makeBundle({
        ...skin,
        levels: new Map([["1-1", importedLevel]]),
      }),
    );

    expect([...composed.levels.keys()]).toEqual(["remote-demo"]);
  });
});
