import { describe, expect, it } from "vitest";

import {
  AssetSetOrigin,
  composeRuntimeManifestInput,
  validateAssetSetDescriptor,
  validateMapSetDescriptor,
  type AssetSetDescriptor,
  type MapSetDescriptor,
} from "./content-sets";
import { parseUserAssetManifest } from "./user-asset-manifest";
import { ValidationErrorCode } from "./validation-error";

function spriteEntry(url: string): unknown {
  return {
    source: { kind: "url", url },
    frame: { x: 0, y: 0, width: 16, height: 16 },
  };
}

function levelEntry(name: string, url: string): unknown {
  return {
    name,
    format: "vglc-smb-text",
    source: { kind: "url", url },
  };
}

function assetSet(
  overrides: Partial<AssetSetDescriptor> = {},
): AssetSetDescriptor {
  return {
    id: "rom-smb",
    title: "SMB (ROM extracted)",
    origin: AssetSetOrigin.RomExtracted,
    tileSprites: { ground: spriteEntry("rom/ground.png") },
    ...overrides,
  };
}

function mapSet(overrides: Partial<MapSetDescriptor> = {}): MapSetDescriptor {
  return {
    id: "vglc-smb",
    title: "VGLC SMB",
    levels: [levelEntry("mario-1-1", "vglc/mario-1-1.txt")],
    ...overrides,
  };
}

describe("content sets", () => {
  it("counts an asset set whose only entries are reaction sprites as non-empty", () => {
    const reactionOnly = assetSet({
      tileSprites: {},
      reactionSprites: { "player-head-bonk": spriteEntry("ouch.png") },
    });
    expect(validateAssetSetDescriptor(reactionOnly).ok).toBe(true);
  });

  it("carries reaction sprites from the asset set into the manifest", () => {
    const withReactions = assetSet({
      reactionSprites: {
        "player-head-bonk": spriteEntry("ouch.png"),
      },
    });
    const result = composeRuntimeManifestInput(withReactions, mapSet());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.reactionSprites).toEqual({
      "player-head-bonk": spriteEntry("ouch.png"),
    });
  });

  it("composes an asset set and a map set into a runtime manifest input", () => {
    const result = composeRuntimeManifestInput(assetSet(), mapSet());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.version).toBe("1");
    expect(result.value.tileSprites).toEqual({
      ground: spriteEntry("rom/ground.png"),
    });
    expect(result.value.levels).toEqual([
      levelEntry("mario-1-1", "vglc/mario-1-1.txt"),
    ]);
  });

  it("swaps assets independently of the map", () => {
    const authored = assetSet({
      id: "authored-skin",
      title: "Authored skin",
      origin: AssetSetOrigin.Authored,
      tileSprites: { ground: spriteEntry("authored/ground.png") },
    });

    const romComposed = composeRuntimeManifestInput(assetSet(), mapSet());
    const authoredComposed = composeRuntimeManifestInput(authored, mapSet());

    expect(romComposed.ok && authoredComposed.ok).toBe(true);
    if (!romComposed.ok || !authoredComposed.ok) {
      return;
    }
    // Same map on both, different tile art.
    expect(authoredComposed.value.levels).toEqual(romComposed.value.levels);
    expect(authoredComposed.value.tileSprites).not.toEqual(
      romComposed.value.tileSprites,
    );
  });

  it("swaps maps independently of the assets", () => {
    const underground = mapSet({
      id: "vglc-smb-underground",
      levels: [levelEntry("mario-1-2", "vglc/mario-1-2.txt")],
    });

    const overworld = composeRuntimeManifestInput(assetSet(), mapSet());
    const composedUnderground = composeRuntimeManifestInput(
      assetSet(),
      underground,
    );

    expect(overworld.ok && composedUnderground.ok).toBe(true);
    if (!overworld.ok || !composedUnderground.ok) {
      return;
    }
    // Same art on both, different levels.
    expect(composedUnderground.value.tileSprites).toEqual(
      overworld.value.tileSprites,
    );
    expect(composedUnderground.value.levels).not.toEqual(
      overworld.value.levels,
    );
  });

  it("produces output the runtime manifest parser accepts", () => {
    const composed = composeRuntimeManifestInput(assetSet(), mapSet());
    expect(composed.ok).toBe(true);
    if (!composed.ok) {
      return;
    }

    const parsed = parseUserAssetManifest(composed.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.levels).toHaveLength(1);
    expect(parsed.value.tileSprites.ground).toBeDefined();
  });

  it("rejects an asset set with no entries", () => {
    const result = validateAssetSetDescriptor({
      id: "empty",
      title: "Empty",
      origin: AssetSetOrigin.Authored,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe(ValidationErrorCode.AssetSetEmpty);
  });

  it("rejects a map set with no levels", () => {
    const result = validateMapSetDescriptor({
      id: "empty",
      title: "Empty",
      levels: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe(ValidationErrorCode.MapSetLevelsEmpty);
  });

  it("rejects a content set with a blank identity", () => {
    const result = validateMapSetDescriptor({
      id: "",
      title: "",
      levels: [levelEntry("a", "a.txt")],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errors[0]?.code).toBe(
      ValidationErrorCode.ContentSetIdentityInvalid,
    );
  });

  it("surfaces both descriptors' errors when composing invalid sets", () => {
    const result = composeRuntimeManifestInput(
      { id: "x", title: "X", origin: AssetSetOrigin.Authored },
      { id: "y", title: "Y", levels: [] },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(ValidationErrorCode.AssetSetEmpty);
    expect(codes).toContain(ValidationErrorCode.MapSetLevelsEmpty);
  });
});
