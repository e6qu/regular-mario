import type { DomainResult } from "./result";
import { fail, succeed } from "./result";
import type { UserAssetManifestInput } from "./user-asset-manifest";
import type { ValidationError } from "./validation-error";
import { makeValidationError, ValidationErrorCode } from "./validation-error";

// Local content sets (Decision 0019) separate the visual/audio skin (an asset
// set) from the level layout (a map set) so the two are configured and swapped
// independently. Both are build-time organization descriptors; they compose into
// the existing runtime UserAssetManifest, which performs the deep validation.

export enum AssetSetOrigin {
  RomExtracted = "rom-extracted",
  Authored = "authored",
}

// Sprite, audio, level-visual, and level entries are passed through untouched to
// the runtime manifest, which owns their detailed shape and validation. Content
// sets only group and combine them.
export type AssetSetDescriptor = {
  readonly id: string;
  readonly title: string;
  readonly origin: AssetSetOrigin;
  readonly playerSprite?: unknown;
  readonly tileSprites?: Readonly<Record<string, unknown>>;
  readonly reactionSprites?: Readonly<Record<string, unknown>>;
  readonly actorSprites?: Readonly<Record<string, unknown>>;
  readonly sounds?: Readonly<Record<string, unknown>>;
  readonly music?: Readonly<Record<string, unknown>>;
  readonly levelVisuals?: Readonly<Record<string, unknown>>;
};

export type MapSetDescriptor = {
  readonly id: string;
  readonly title: string;
  readonly levels: readonly unknown[];
};

const runtimeManifestVersion = "1";

function validateIdentity(
  id: unknown,
  title: unknown,
  label: string,
  errors: ValidationError[],
): void {
  if (typeof id !== "string" || id.trim().length === 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ContentSetIdentityInvalid,
        `${label} id must be a non-empty string.`,
        `${label}.id`,
      ),
    );
  }

  if (typeof title !== "string" || title.trim().length === 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ContentSetIdentityInvalid,
        `${label} title must be a non-empty string.`,
        `${label}.title`,
      ),
    );
  }
}

// Accepts unknown so it still guards descriptors parsed from untrusted JSON,
// where origin may not be one of the enum values despite the declared type.
function isKnownAssetSetOrigin(origin: unknown): boolean {
  return (
    origin === AssetSetOrigin.RomExtracted || origin === AssetSetOrigin.Authored
  );
}

function countAssetEntries(assetSet: AssetSetDescriptor): number {
  const recordCounts = [
    assetSet.actorSprites,
    assetSet.tileSprites,
    assetSet.reactionSprites,
    assetSet.levelVisuals,
    assetSet.sounds,
    assetSet.music,
  ].reduce((total, record) => total + Object.keys(record ?? {}).length, 0);

  return recordCounts + (assetSet.playerSprite === undefined ? 0 : 1);
}

export function validateAssetSetDescriptor(
  assetSet: AssetSetDescriptor,
): DomainResult<AssetSetDescriptor, ValidationError> {
  const errors: ValidationError[] = [];

  validateIdentity(assetSet.id, assetSet.title, "asset-set", errors);

  if (!isKnownAssetSetOrigin(assetSet.origin)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ContentSetIdentityInvalid,
        'asset-set origin must be "rom-extracted" or "authored".',
        "asset-set.origin",
      ),
    );
  }

  if (countAssetEntries(assetSet) === 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.AssetSetEmpty,
        "asset-set must define at least one sprite, audio, or level-visual entry.",
        "asset-set",
      ),
    );
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed(assetSet);
}

export function validateMapSetDescriptor(
  mapSet: MapSetDescriptor,
): DomainResult<MapSetDescriptor, ValidationError> {
  const errors: ValidationError[] = [];

  validateIdentity(mapSet.id, mapSet.title, "map-set", errors);

  if (!Array.isArray(mapSet.levels) || mapSet.levels.length === 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.MapSetLevelsEmpty,
        "map-set must define at least one level.",
        "map-set.levels",
      ),
    );
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed(mapSet);
}

// Merge one asset set and one map set into a runtime manifest input. Any asset
// set pairs with any map set: the asset dimension and the map dimension are
// independent. The result still flows through parseUserAssetManifest for deep
// validation.
export function composeRuntimeManifestInput(
  assetSet: AssetSetDescriptor,
  mapSet: MapSetDescriptor,
): DomainResult<UserAssetManifestInput, ValidationError> {
  const errors: ValidationError[] = [];

  const assetSetResult = validateAssetSetDescriptor(assetSet);
  if (!assetSetResult.ok) {
    errors.push(...assetSetResult.errors);
  }

  const mapSetResult = validateMapSetDescriptor(mapSet);
  if (!mapSetResult.ok) {
    errors.push(...mapSetResult.errors);
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed({
    version: runtimeManifestVersion,
    tileSprites: assetSet.tileSprites ?? {},
    actorSprites: assetSet.actorSprites ?? {},
    playerSprite: assetSet.playerSprite,
    reactionSprites: assetSet.reactionSprites ?? {},
    levelVisuals: assetSet.levelVisuals ?? {},
    sounds: assetSet.sounds ?? {},
    music: assetSet.music ?? {},
    levels: mapSet.levels,
  });
}
