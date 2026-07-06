import type { LevelSpecInput } from "../../domain/level-spec";
import type { DomainResult } from "../../domain/result";
import { fail, succeed } from "../../domain/result";
import { UserLevelEntryFormat } from "../../domain/user-asset-manifest";
import type { ValidationError } from "../../domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../../domain/validation-error";
import { isTiledJsonLevelInput, parseTiledJsonLevel } from "./tiled-json-level";
import {
  parseVglcSmbMultiLayerLevel,
  parseVglcSmbTextLevel,
} from "./vglc-smb-text-level";
import { parseVglcTextLevel } from "./vglc-text-level";

export enum UserLevelFileContentKind {
  Json = "json",
  Text = "text",
}

export type UserLevelFileContent =
  | {
      readonly kind: UserLevelFileContentKind.Json;
      readonly value: unknown;
    }
  | {
      readonly kind: UserLevelFileContentKind.Text;
      readonly value: string;
    };

export type UserLevelImportResult = DomainResult<
  LevelSpecInput,
  ValidationError
>;

export function importUserLevel(
  format: UserLevelEntryFormat,
  content: UserLevelFileContent,
  metadata?: unknown,
): UserLevelImportResult {
  switch (format) {
    case UserLevelEntryFormat.OriginalJson:
      return importOriginalJsonLevel(content);
    case UserLevelEntryFormat.TiledJson:
      return importTiledJsonLevel(content);
    case UserLevelEntryFormat.VglcText:
      return importVglcTextLevel(content);
    case UserLevelEntryFormat.VglcSmbText:
      return importVglcSmbTextLevel(content, metadata);
    case UserLevelEntryFormat.VglcSmbMultiLayer:
      return importVglcSmbMultiLayerLevel(content, metadata);
    default: {
      const invalidFormat: never = format;
      throw new Error(
        `Unsupported user level format: ${String(invalidFormat)}`,
      );
    }
  }
}

function importOriginalJsonLevel(
  content: UserLevelFileContent,
): UserLevelImportResult {
  if (content.kind !== UserLevelFileContentKind.Json) {
    return fail([
      makeValidationError(
        ValidationErrorCode.UserLevelOriginalJsonInvalid,
        "original-json level must be parsed JSON.",
        "content",
      ),
    ]);
  }

  if (!isLevelSpecInput(content.value)) {
    return fail([
      makeValidationError(
        ValidationErrorCode.UserLevelOriginalJsonInvalid,
        "original-json level does not match LevelSpecInput shape.",
        "content",
      ),
    ]);
  }

  return succeed(content.value);
}

function importTiledJsonLevel(
  content: UserLevelFileContent,
): UserLevelImportResult {
  if (content.kind !== UserLevelFileContentKind.Json) {
    return fail([
      makeValidationError(
        ValidationErrorCode.UserLevelTiledJsonInvalid,
        "tiled-json level must be parsed JSON.",
        "content",
      ),
    ]);
  }

  if (!isTiledJsonLevelInput(content.value)) {
    return fail([
      makeValidationError(
        ValidationErrorCode.UserLevelTiledJsonInvalid,
        "tiled-json level is missing required fields (numeric tilewidth/tileheight and tilesets/layers arrays).",
        "content",
      ),
    ]);
  }
  return parseTiledJsonLevel(content.value);
}

function importVglcSmbTextLevel(
  content: UserLevelFileContent,
  metadata: unknown,
): UserLevelImportResult {
  if (content.kind !== UserLevelFileContentKind.Text) {
    return fail([
      makeValidationError(
        ValidationErrorCode.UserLevelVglcTextInvalid,
        "vglc-smb-text level must be plain text.",
        "content",
      ),
    ]);
  }

  return parseVglcSmbTextLevel(content.value, metadata);
}

function importVglcSmbMultiLayerLevel(
  content: UserLevelFileContent,
  metadata: unknown,
): UserLevelImportResult {
  if (content.kind !== UserLevelFileContentKind.Text) {
    return fail([
      makeValidationError(
        ValidationErrorCode.UserLevelVglcTextInvalid,
        "vglc-smb-multi-layer level must be plain text.",
        "content",
      ),
    ]);
  }

  return parseVglcSmbMultiLayerLevel(content.value, metadata);
}

function importVglcTextLevel(
  content: UserLevelFileContent,
): UserLevelImportResult {
  if (content.kind !== UserLevelFileContentKind.Text) {
    return fail([
      makeValidationError(
        ValidationErrorCode.UserLevelVglcTextInvalid,
        "vglc-text level must be plain text.",
        "content",
      ),
    ]);
  }

  const parsed = parseVglcTextLevelJson(content.value);

  if (!parsed.ok) {
    return parsed;
  }

  return parseVglcTextLevel(parsed.value as never);
}

function parseVglcTextLevelJson(
  text: string,
): DomainResult<unknown, ValidationError> {
  try {
    return succeed(JSON.parse(text) as unknown);
  } catch {
    return fail([
      makeValidationError(
        ValidationErrorCode.UserLevelVglcTextJsonInvalid,
        "vglc-text level file must be valid JSON wrapping a VglcTextLevelInput object.",
        "content",
      ),
    ]);
  }
}

function isLevelSpecInput(value: unknown): value is LevelSpecInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Readonly<Record<string, unknown>>;

  return (
    typeof candidate.widthTiles === "number" &&
    typeof candidate.heightTiles === "number" &&
    typeof candidate.tileSizePixels === "number" &&
    Array.isArray(candidate.tileDefinitions) &&
    Array.isArray(candidate.actorDefinitions) &&
    Array.isArray(candidate.tiles) &&
    Array.isArray(candidate.actors)
  );
}
