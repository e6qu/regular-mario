import type { Brand } from "./brand";
import type { DomainResult } from "./result";
import { fail, succeed } from "./result";
import type { ValidationError } from "./validation-error";
import { makeValidationError, ValidationErrorCode } from "./validation-error";

type UserAssetManifestVersion = Brand<string, "UserAssetManifestVersion">;

export enum UserAssetSourceKind {
  File = "file",
  Url = "url",
}

export type UserAssetSource =
  | {
      readonly kind: UserAssetSourceKind.File;
      readonly fileName: string;
    }
  | {
      readonly kind: UserAssetSourceKind.Url;
      readonly url: string;
    };

export type UserSpriteFrame = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type UserSpriteTransparentColor = {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly tolerance: number;
};

type UserLevelVisualEraseFill = {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
};

export type UserLevelVisualEraseRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill: UserLevelVisualEraseFill;
};

type UserRectangleFields = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type UserTileSpriteEntry = {
  readonly source: UserAssetSource;
  readonly frame: UserSpriteFrame;
  readonly transparentColor: UserSpriteTransparentColor | undefined;
};

export type UserBaseSpriteEntry = {
  readonly source: UserAssetSource;
  readonly frame: UserSpriteFrame;
  readonly transparentColor: UserSpriteTransparentColor | undefined;
};

export type UserActorSpriteEntry = UserBaseSpriteEntry & {
  readonly stateSprites: Readonly<Record<string, UserBaseSpriteEntry>>;
};

export type UserPlayerSpriteEntry = UserBaseSpriteEntry & {
  readonly stateSprites: Readonly<Record<string, UserBaseSpriteEntry>>;
};

type ParsedStatefulSpriteEntry = {
  readonly source: UserAssetSource;
  readonly frame: UserSpriteFrame;
  readonly transparentColor: UserSpriteTransparentColor | undefined;
  readonly stateSprites: Readonly<Record<string, UserBaseSpriteEntry>>;
};

export type UserLevelVisualEntry = {
  readonly source: UserAssetSource;
  readonly frame: UserSpriteFrame;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly eraseRects: readonly UserLevelVisualEraseRect[];
};

type UserAudioEntry = {
  readonly source: UserAssetSource;
};

type UserMusicEntry = {
  readonly source: UserAssetSource;
};

export enum UserLevelEntryFormat {
  OriginalJson = "original-json",
  TiledJson = "tiled-json",
  VglcText = "vglc-text",
  VglcSmbText = "vglc-smb-text",
  VglcSmbMultiLayer = "vglc-smb-multi-layer",
}

export type UserLevelEntry = {
  readonly name: string;
  readonly format: UserLevelEntryFormat;
  readonly source: UserAssetSource;
  readonly importMetadataSource: UserAssetSource | undefined;
  readonly compatibilityProfileSource: UserAssetSource | undefined;
};

export type UserAssetManifest = {
  readonly version: UserAssetManifestVersion;
  readonly tileSprites: Readonly<Record<string, UserTileSpriteEntry>>;
  readonly actorSprites: Readonly<Record<string, UserActorSpriteEntry>>;
  readonly playerSprite: UserPlayerSpriteEntry | undefined;
  readonly reactionSprites: Readonly<Record<string, UserBaseSpriteEntry>>;
  readonly levelVisuals: Readonly<Record<string, UserLevelVisualEntry>>;
  readonly sounds: Readonly<Record<string, UserAudioEntry>>;
  readonly music: Readonly<Record<string, UserMusicEntry>>;
  readonly levels: readonly UserLevelEntry[];
};

export type UserAssetManifestInput = {
  readonly version: string;
  readonly tileSprites?: Readonly<Record<string, unknown>>;
  readonly actorSprites?: Readonly<Record<string, unknown>>;
  readonly playerSprite?: unknown;
  readonly reactionSprites?: Readonly<Record<string, unknown>>;
  readonly levelVisuals?: Readonly<Record<string, unknown>>;
  readonly sounds?: Readonly<Record<string, unknown>>;
  readonly music?: Readonly<Record<string, unknown>>;
  readonly levels?: readonly unknown[];
};

const supportedManifestVersion = "1";

export function parseUserAssetManifest(
  input: UserAssetManifestInput,
): DomainResult<UserAssetManifest, ValidationError> {
  const errors: ValidationError[] = [];

  if (input.version !== supportedManifestVersion) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestVersionUnsupported,
        `Manifest version must be "${supportedManifestVersion}".`,
        "version",
      ),
    );
  }

  const tileSprites = parseTileSprites(input.tileSprites, errors);
  const actorSprites = parseActorSprites(input.actorSprites, errors);
  const playerSprite = parseOptionalPlayerSprite(
    input.playerSprite,
    "playerSprite",
    errors,
  );
  const reactionSprites = parseReactionSprites(input.reactionSprites, errors);
  const levelVisuals = parseLevelVisuals(input.levelVisuals, errors);
  const sounds = parseAudioMap(input.sounds, "sounds", errors);
  const music = parseAudioMap(input.music, "music", errors);
  const levels = parseLevels(input.levels, errors);

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed({
    version: supportedManifestVersion as UserAssetManifestVersion,
    tileSprites,
    actorSprites,
    playerSprite,
    reactionSprites,
    levelVisuals,
    sounds,
    music,
    levels,
  });
}

function parseLevelVisuals(
  input: Readonly<Record<string, unknown>> | undefined,
  errors: ValidationError[],
): Readonly<Record<string, UserLevelVisualEntry>> {
  if (input === undefined) {
    return {};
  }

  const result: Record<string, UserLevelVisualEntry> = {};

  for (const [levelName, rawEntry] of Object.entries(input)) {
    const entry = parseLevelVisualEntry(
      rawEntry,
      `levelVisuals.${levelName}`,
      errors,
    );

    if (entry !== undefined) {
      result[levelName] = entry;
    }
  }

  return result;
}

function parseLevelVisualEntry(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserLevelVisualEntry | undefined {
  const candidate = parseEntryObject(input, path, "level visual entry", errors);

  if (candidate === undefined) {
    return undefined;
  }

  const source = parseAssetSource(candidate.source, `${path}.source`, errors);
  const frame = parseSpriteFrame(candidate.frame, `${path}.frame`, errors);
  const offsetX = parseNonNegativeInteger(
    candidate.offsetX,
    `${path}.offsetX`,
    errors,
  );
  const offsetY = parseNonNegativeInteger(
    candidate.offsetY,
    `${path}.offsetY`,
    errors,
  );
  const eraseRects = parseOptionalLevelVisualEraseRects(
    candidate.eraseRects,
    `${path}.eraseRects`,
    errors,
  );

  if (
    source === undefined ||
    frame === undefined ||
    offsetX === undefined ||
    offsetY === undefined ||
    eraseRects === invalidLevelVisualEraseRects
  ) {
    return undefined;
  }

  return {
    source,
    frame,
    offsetX,
    offsetY,
    eraseRects,
  };
}

function parseTileSprites(
  input: Readonly<Record<string, unknown>> | undefined,
  errors: ValidationError[],
): Readonly<Record<string, UserTileSpriteEntry>> {
  if (input === undefined) {
    return {};
  }

  const result: Record<string, UserTileSpriteEntry> = {};

  for (const [tileId, rawEntry] of Object.entries(input)) {
    const entry = parseSpriteEntry(rawEntry, `tileSprites.${tileId}`, errors);

    if (entry !== undefined) {
      result[tileId] = entry;
    }
  }

  return result;
}

function parseReactionSprites(
  input: Readonly<Record<string, unknown>> | undefined,
  errors: ValidationError[],
): Readonly<Record<string, UserBaseSpriteEntry>> {
  if (input === undefined) {
    return {};
  }

  const result: Record<string, UserBaseSpriteEntry> = {};

  for (const [reactionId, rawEntry] of Object.entries(input)) {
    const entry = parseSpriteEntry(
      rawEntry,
      `reactionSprites.${reactionId}`,
      errors,
    );

    if (entry !== undefined) {
      result[reactionId] = entry;
    }
  }

  return result;
}

function parseActorSprites(
  input: Readonly<Record<string, unknown>> | undefined,
  errors: ValidationError[],
): Readonly<Record<string, UserActorSpriteEntry>> {
  if (input === undefined) {
    return {};
  }

  const result: Record<string, UserActorSpriteEntry> = {};

  for (const [actorId, rawEntry] of Object.entries(input)) {
    const entry = parseStatefulSpriteEntry(
      rawEntry,
      `actorSprites.${actorId}`,
      errors,
    );

    if (entry !== undefined) {
      result[actorId] = entry;
    }
  }

  return result;
}

function parseOptionalPlayerSprite(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserPlayerSpriteEntry | undefined {
  if (input === undefined) {
    return undefined;
  }

  const entry = parseStatefulSpriteEntry(input, path, errors);

  if (entry === undefined) {
    return undefined;
  }

  return {
    source: entry.source,
    frame: entry.frame,
    transparentColor: entry.transparentColor,
    stateSprites: entry.stateSprites,
  };
}

function parseStatefulSpriteEntry(
  input: unknown,
  path: string,
  errors: ValidationError[],
): ParsedStatefulSpriteEntry | undefined {
  const candidate = parseEntryObject(input, path, "sprite entry", errors);

  if (candidate === undefined) {
    return undefined;
  }

  const baseEntry = parseSpriteEntryFromObject(candidate, path, errors);
  const stateSprites = parseSpriteStateSprites(
    candidate.stateSprites,
    `${path}.stateSprites`,
    errors,
  );

  if (baseEntry === undefined || stateSprites === invalidSpriteStateSprites) {
    return undefined;
  }

  return {
    ...baseEntry,
    stateSprites,
  };
}

function parseSpriteEntry(
  input: unknown,
  path: string,
  errors: ValidationError[],
):
  | {
      readonly source: UserAssetSource;
      readonly frame: UserSpriteFrame;
      readonly transparentColor: UserSpriteTransparentColor | undefined;
    }
  | undefined {
  const candidate = parseEntryObject(input, path, "sprite entry", errors);

  if (candidate === undefined) {
    return undefined;
  }

  return parseSpriteEntryFromObject(candidate, path, errors);
}

function parseSpriteEntryFromObject(
  candidate: Readonly<Record<string, unknown>>,
  path: string,
  errors: ValidationError[],
): UserBaseSpriteEntry | undefined {
  const source = parseAssetSource(candidate.source, `${path}.source`, errors);
  const frame = parseSpriteFrame(candidate.frame, `${path}.frame`, errors);
  const transparentColor = parseOptionalTransparentColor(
    candidate.transparentColor,
    `${path}.transparentColor`,
    errors,
  );

  if (
    source === undefined ||
    frame === undefined ||
    transparentColor === invalidTransparentColor
  ) {
    return undefined;
  }

  return {
    source,
    frame,
    transparentColor,
  };
}

const invalidSpriteStateSprites = Symbol("invalid sprite state sprites");

function parseSpriteStateSprites(
  input: unknown,
  path: string,
  errors: ValidationError[],
):
  | Readonly<Record<string, UserBaseSpriteEntry>>
  | typeof invalidSpriteStateSprites {
  if (input === undefined) {
    return {};
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestSpriteEntryInvalid,
        `${path} must be an object keyed by sprite state.`,
        path,
      ),
    );

    return invalidSpriteStateSprites;
  }

  const result: Record<string, UserBaseSpriteEntry> = {};

  for (const [stateKey, rawEntry] of Object.entries(input)) {
    if (stateKey.trim().length === 0) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.ManifestSpriteEntryInvalid,
          `${path} keys must be non-empty sprite state names.`,
          path,
        ),
      );
      continue;
    }

    const entry = parseSpriteEntry(rawEntry, `${path}.${stateKey}`, errors);

    if (entry !== undefined) {
      result[stateKey] = entry;
    }
  }

  return result;
}

function parseEntryObject(
  input: unknown,
  path: string,
  entryLabel: string,
  errors: ValidationError[],
): Readonly<Record<string, unknown>> | undefined {
  if (typeof input === "object" && input !== null) {
    return input as Readonly<Record<string, unknown>>;
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.ManifestSpriteEntryInvalid,
      `${path} must be a ${entryLabel} object.`,
      path,
    ),
  );

  return undefined;
}

const invalidLevelVisualEraseRects = Symbol("invalid level visual erase rects");

function parseOptionalLevelVisualEraseRects(
  input: unknown,
  path: string,
  errors: ValidationError[],
): readonly UserLevelVisualEraseRect[] | typeof invalidLevelVisualEraseRects {
  if (input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestSpriteEntryInvalid,
        `${path} must be an array of erase rectangles.`,
        path,
      ),
    );

    return invalidLevelVisualEraseRects;
  }

  const eraseRects: UserLevelVisualEraseRect[] = [];

  for (const [index, rawEraseRect] of input.entries()) {
    const eraseRect = parseLevelVisualEraseRect(
      rawEraseRect,
      `${path}.${index}`,
      errors,
    );

    if (eraseRect !== undefined) {
      eraseRects.push(eraseRect);
    }
  }

  return eraseRects;
}

function parseLevelVisualEraseRect(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserLevelVisualEraseRect | undefined {
  const candidate = parseEntryObject(
    input,
    path,
    "level visual erase rectangle",
    errors,
  );

  if (candidate === undefined) {
    return undefined;
  }

  const rectangle = parseRectangleFields(candidate, path, errors);
  const fill = parseLevelVisualEraseFill(
    candidate.fill,
    `${path}.fill`,
    errors,
  );

  if (rectangle === undefined || fill === undefined) {
    return undefined;
  }

  return {
    ...rectangle,
    fill,
  };
}

function parseLevelVisualEraseFill(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserLevelVisualEraseFill | undefined {
  const candidate = parseEntryObject(input, path, "erase fill", errors);

  if (candidate === undefined) {
    return undefined;
  }

  return parseByteRgb(candidate, path, errors);
}

const invalidTransparentColor = Symbol("invalid transparent color");

function parseByteRgb(
  candidate: Readonly<Record<string, unknown>>,
  path: string,
  errors: ValidationError[],
): UserLevelVisualEraseFill | undefined {
  const red = parseByteInteger(candidate.red, `${path}.red`, errors);
  const green = parseByteInteger(candidate.green, `${path}.green`, errors);
  const blue = parseByteInteger(candidate.blue, `${path}.blue`, errors);

  if (red === undefined || green === undefined || blue === undefined) {
    return undefined;
  }

  return {
    red,
    green,
    blue,
  };
}

function parseOptionalTransparentColor(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserSpriteTransparentColor | typeof invalidTransparentColor | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestSpriteEntryInvalid,
        `${path} must be a transparent color object.`,
        path,
      ),
    );

    return invalidTransparentColor;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  const rgb = parseByteRgb(candidate, path, errors);
  const tolerance = parseByteInteger(
    candidate.tolerance,
    `${path}.tolerance`,
    errors,
  );

  if (rgb === undefined || tolerance === undefined) {
    return invalidTransparentColor;
  }

  return {
    ...rgb,
    tolerance,
  };
}

function parseAssetSource(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserAssetSource | undefined {
  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestAssetSourceInvalid,
        `${path} must be an asset source object.`,
        path,
      ),
    );

    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  const kind = candidate.kind;

  if (kind === UserAssetSourceKind.File) {
    const fileName = candidate.fileName;

    if (typeof fileName !== "string" || fileName.trim().length === 0) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.ManifestAssetSourceFileNameInvalid,
          `${path}.fileName must be a non-empty string.`,
          `${path}.fileName`,
        ),
      );

      return undefined;
    }

    return {
      kind: UserAssetSourceKind.File,
      fileName,
    };
  }

  if (kind === UserAssetSourceKind.Url) {
    const url = candidate.url;

    if (typeof url !== "string" || url.trim().length === 0) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.ManifestAssetSourceUrlInvalid,
          `${path}.url must be a non-empty string.`,
          `${path}.url`,
        ),
      );

      return undefined;
    }

    return {
      kind: UserAssetSourceKind.Url,
      url,
    };
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.ManifestAssetSourceKindInvalid,
      `${path}.kind must be "file" or "url".`,
      `${path}.kind`,
    ),
  );

  return undefined;
}

function parseSpriteFrame(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserSpriteFrame | undefined {
  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestSpriteFrameInvalid,
        `${path} must be a sprite frame object.`,
        path,
      ),
    );

    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  return parseRectangleFields(candidate, path, errors);
}

function parseRectangleFields(
  candidate: Readonly<Record<string, unknown>>,
  path: string,
  errors: ValidationError[],
): UserRectangleFields | undefined {
  const x = parseNonNegativeInteger(candidate.x, `${path}.x`, errors);
  const y = parseNonNegativeInteger(candidate.y, `${path}.y`, errors);
  const width = parsePositiveInteger(candidate.width, `${path}.width`, errors);
  const height = parsePositiveInteger(
    candidate.height,
    `${path}.height`,
    errors,
  );

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return undefined;
  }

  return {
    x,
    y,
    width,
    height,
  };
}

function parseNonNegativeInteger(
  input: unknown,
  path: string,
  errors: ValidationError[],
): number | undefined {
  if (
    typeof input !== "number" ||
    !Number.isInteger(input) ||
    input < 0 ||
    !Number.isFinite(input)
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestIntegerInvalid,
        `${path} must be a non-negative integer.`,
        path,
      ),
    );

    return undefined;
  }

  return input;
}

function parsePositiveInteger(
  input: unknown,
  path: string,
  errors: ValidationError[],
): number | undefined {
  if (
    typeof input !== "number" ||
    !Number.isInteger(input) ||
    input <= 0 ||
    !Number.isFinite(input)
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestIntegerInvalid,
        `${path} must be a positive integer.`,
        path,
      ),
    );

    return undefined;
  }

  return input;
}

function parseByteInteger(
  input: unknown,
  path: string,
  errors: ValidationError[],
): number | undefined {
  if (
    typeof input !== "number" ||
    !Number.isInteger(input) ||
    input < 0 ||
    input > 255 ||
    !Number.isFinite(input)
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestIntegerInvalid,
        `${path} must be an integer from 0 to 255.`,
        path,
      ),
    );

    return undefined;
  }

  return input;
}

function parseAudioMap(
  input: Readonly<Record<string, unknown>> | undefined,
  path: string,
  errors: ValidationError[],
): Readonly<Record<string, UserAudioEntry>> {
  if (input === undefined) {
    return {};
  }

  const result: Record<string, UserAudioEntry> = {};

  for (const [key, rawEntry] of Object.entries(input)) {
    const entryPath = `${path}.${key}`;
    const entry = parseAudioEntry(rawEntry, entryPath, errors);

    if (entry !== undefined) {
      result[key] = entry;
    }
  }

  return result;
}

function parseAudioEntry(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserAudioEntry | undefined {
  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestAudioEntryInvalid,
        `${path} must be an audio entry object.`,
        path,
      ),
    );

    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  const source = parseAssetSource(candidate.source, `${path}.source`, errors);

  if (source === undefined) {
    return undefined;
  }

  return {
    source,
  };
}

function parseLevels(
  input: readonly unknown[] | undefined,
  errors: ValidationError[],
): readonly UserLevelEntry[] {
  if (input === undefined) {
    return [];
  }

  const result: UserLevelEntry[] = [];

  for (const [index, rawEntry] of input.entries()) {
    const entry = parseLevelEntry(rawEntry, `levels[${index}]`, errors);

    if (entry !== undefined) {
      result.push(entry);
    }
  }

  return result;
}

function parseLevelEntry(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserLevelEntry | undefined {
  if (typeof input !== "object" || input === null) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestLevelEntryInvalid,
        `${path} must be a level entry object.`,
        path,
      ),
    );

    return undefined;
  }

  const candidate = input as Readonly<Record<string, unknown>>;
  const name = candidate.name;

  if (typeof name !== "string" || name.trim().length === 0) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ManifestLevelNameInvalid,
        `${path}.name must be a non-empty string.`,
        `${path}.name`,
      ),
    );
  }

  const format = parseLevelFormat(candidate.format, `${path}.format`, errors);
  const source = parseAssetSource(candidate.source, `${path}.source`, errors);
  const importMetadataSource = parseOptionalAssetSource(
    candidate.importMetadataSource,
    `${path}.importMetadataSource`,
    errors,
  );
  const compatibilityProfileSource = parseOptionalAssetSource(
    candidate.compatibilityProfileSource,
    `${path}.compatibilityProfileSource`,
    errors,
  );

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    format === undefined ||
    source === undefined ||
    importMetadataSource === "invalid" ||
    compatibilityProfileSource === "invalid"
  ) {
    return undefined;
  }

  return {
    name,
    format,
    source,
    importMetadataSource,
    compatibilityProfileSource,
  };
}

function parseOptionalAssetSource(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserAssetSource | "invalid" | undefined {
  if (input === undefined) {
    return undefined;
  }

  return parseAssetSource(input, path, errors) ?? "invalid";
}

function parseLevelFormat(
  input: unknown,
  path: string,
  errors: ValidationError[],
): UserLevelEntryFormat | undefined {
  switch (input) {
    case "original-json":
      return UserLevelEntryFormat.OriginalJson;
    case "tiled-json":
      return UserLevelEntryFormat.TiledJson;
    case "vglc-text":
      return UserLevelEntryFormat.VglcText;
    case "vglc-smb-text":
      return UserLevelEntryFormat.VglcSmbText;
    case "vglc-smb-multi-layer":
      return UserLevelEntryFormat.VglcSmbMultiLayer;
    default:
      errors.push(
        makeValidationError(
          ValidationErrorCode.ManifestLevelFormatInvalid,
          `${path} must be one of: original-json, tiled-json, vglc-text, vglc-smb-text, vglc-smb-multi-layer.`,
          path,
        ),
      );

      return undefined;
  }
}
