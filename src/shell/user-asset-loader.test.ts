import {
  UserAssetSourceKind,
  UserLevelEntryFormat,
} from "../engine/domain/user-asset-manifest";
import { ActorRole } from "../engine/domain/level-spec";
import { describe, expect, it } from "vitest";

import {
  parseUserAssetManifest,
  type UserAssetManifest,
} from "../engine/domain/user-asset-manifest";
import { finishRouteLevelInput } from "../engine/levels/finish-route-level";
import {
  loadUserAssetBundle,
  defaultMaxFileBytes,
  defaultMaxTotalBytes,
  type UserAssetLoadResult,
} from "./user-asset-loader";

function expectLoadFailure(
  result: UserAssetLoadResult,
  expectedMessage: string,
): void {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected load failure.");
  }

  expect(result.errors[0]?.message).toContain(expectedMessage);
}

function makeJsonFile(value: unknown, fileName: string): File {
  return new File([JSON.stringify(value)], fileName, {
    type: "application/json",
  });
}

function makeTextFile(value: string, fileName: string): File {
  return new File([value], fileName, {
    type: "text/plain",
  });
}

function makeSyntheticCompatibilityProfileInput() {
  return {
    profileId: "synthetic-profile",
    actors: [
      {
        sourceActorId: "source-runner",
        actorId: "runner-start",
        role: "player-start",
        spriteWidthPixels: 16,
        spriteHeightPixels: 24,
        colliderWidthPixels: 14,
        colliderHeightPixels: 24,
        behaviorProfileId: "player-default",
        stateColliders: [],
      },
    ],
    movementConstants: [{ id: "player.run-speed", value: 144 }],
    timers: [{ id: "level.timer", value: 400 }],
    unsupportedFeatures: [],
  };
}

function makeUnsupportedSyntheticCompatibilityProfileInput() {
  return {
    ...makeSyntheticCompatibilityProfileInput(),
    unsupportedFeatures: [
      {
        featureId: "screen-wrap",
        reason: "The current runtime has bounded horizontal world edges.",
      },
    ],
  };
}

function parseManifestWithProfileLevel(): UserAssetManifest {
  const manifestResult = parseUserAssetManifest({
    version: "1",
    levels: [
      {
        name: "custom-level",
        format: UserLevelEntryFormat.OriginalJson,
        source: { kind: UserAssetSourceKind.File, fileName: "level.json" },
        compatibilityProfileSource: {
          kind: UserAssetSourceKind.File,
          fileName: "profile.json",
        },
      },
    ],
  });

  expect(manifestResult.ok).toBe(true);
  if (!manifestResult.ok) {
    throw new Error("Expected successful manifest parse.");
  }

  return manifestResult.value;
}

async function loadSyntheticProfileLevel(
  compatibilityProfileInput: unknown,
): Promise<UserAssetLoadResult> {
  return loadUserAssetBundle(
    parseManifestWithProfileLevel(),
    [
      makeJsonFile(finishRouteLevelInput, "level.json"),
      makeJsonFile(compatibilityProfileInput, "profile.json"),
    ],
    {
      maxFileBytes: defaultMaxFileBytes,
      maxTotalBytes: defaultMaxTotalBytes,
    },
  );
}

describe("loadUserAssetBundle", () => {
  it("rejects unknown sound event keys", async () => {
    const manifestResult = parseUserAssetManifest({
      version: "1",
      sounds: {
        unknown: {
          source: { kind: UserAssetSourceKind.File, fileName: "unknown.wav" },
        },
      },
    });

    expect(manifestResult.ok).toBe(true);

    if (!manifestResult.ok) {
      throw new Error("Expected successful manifest parse.");
    }

    const result = await loadUserAssetBundle(manifestResult.value, [], {
      maxFileBytes: defaultMaxFileBytes,
      maxTotalBytes: defaultMaxTotalBytes,
    });

    expectLoadFailure(result, "unknown");
  });

  it.each([
    {
      label: "total size limit",
      maxFileBytes: 3000,
      maxTotalBytes: 1000,
      expectedMessage: "total size",
    },
    {
      label: "per-file size limit",
      maxFileBytes: 1000,
      maxTotalBytes: 3000,
      expectedMessage: "big.png",
    },
  ])("rejects bundles exceeding the $label", async (testCase) => {
    const manifestResult = parseUserAssetManifest({ version: "1" });

    expect(manifestResult.ok).toBe(true);

    if (!manifestResult.ok) {
      throw new Error("Expected successful manifest parse.");
    }

    const bigFile = new File([new Uint8Array(2000)], "big.png", {
      type: "image/png",
    });
    const result = await loadUserAssetBundle(manifestResult.value, [bigFile], {
      maxFileBytes: testCase.maxFileBytes,
      maxTotalBytes: testCase.maxTotalBytes,
    });

    expectLoadFailure(result, testCase.expectedMessage);
  });

  it("loads an optional compatibility profile beside a user level", async () => {
    const result = await loadSyntheticProfileLevel(
      makeUnsupportedSyntheticCompatibilityProfileInput(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected successful load.");
    }

    expect(
      result.bundle.levels.get("custom-level")?.compatibilityProfile?.profileId,
    ).toBe("synthetic-profile");
    expect(
      result.bundle.levels.get("custom-level")?.compatibilityConformanceReport
        .unsupportedFeatureCount,
    ).toBe(1);
  });

  it("applies conformance-clean compatibility profile dimensions to runtime level input", async () => {
    const result = await loadSyntheticProfileLevel(
      makeSyntheticCompatibilityProfileInput(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected successful load.");
    }

    expect(
      result.bundle.levels.get("custom-level")?.levelSpecInput
        .actorDefinitions[0],
    ).toEqual({
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
      spriteWidthPixels: 16,
      spriteHeightPixels: 24,
      colliderWidthPixels: 14,
      colliderHeightPixels: 24,
    });
  });

  it("loads import metadata beside a direct VGLC SMB text level", async () => {
    const manifestResult = parseUserAssetManifest({
      version: "1",
      levels: [
        {
          name: "direct-vglc",
          format: UserLevelEntryFormat.VglcSmbText,
          source: {
            kind: UserAssetSourceKind.File,
            fileName: "level.txt",
          },
          importMetadataSource: {
            kind: UserAssetSourceKind.File,
            fileName: "metadata.json",
          },
        },
      ],
    });

    expect(manifestResult.ok).toBe(true);
    if (!manifestResult.ok) {
      throw new Error("Expected manifest parse to succeed.");
    }

    const result = await loadUserAssetBundle(
      manifestResult.value,
      [
        makeTextFile(["-Eo-", "XXXX"].join("\n"), "level.txt"),
        makeJsonFile(
          {
            playerStart: { x: 0, y: 0 },
            exits: [{ x: 3, y: 0 }],
          },
          "metadata.json",
        ),
      ],
      {
        maxFileBytes: defaultMaxFileBytes,
        maxTotalBytes: defaultMaxTotalBytes,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected successful load.");
    }

    const actors =
      result.bundle.levels.get("direct-vglc")?.levelSpecInput.actors ?? [];

    expect(actors).toHaveLength(4);
    expect(actors.map((actor) => actor.actorId)).toEqual([
      "runner-start",
      "vglc-smb-enemy",
      "vglc-smb-coin",
      "open-gate",
    ]);
    expect(actors.map((actor) => [actor.x, actor.y])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it("rejects an invalid compatibility profile beside a user level", async () => {
    const result = await loadSyntheticProfileLevel({
      ...makeSyntheticCompatibilityProfileInput(),
      profileId: "",
    });

    expectLoadFailure(result, "Compatibility profile");
  });
});
