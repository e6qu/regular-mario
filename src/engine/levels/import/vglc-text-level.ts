import { makeEntityId } from "../../domain/identifiers";
import type { LevelSpecInput } from "../../domain/level-spec";
import type { DomainResult } from "../../domain/result";
import { fail, succeed } from "../../domain/result";
import type { ValidationError } from "../../domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../../domain/validation-error";

type VglcTileLegendEntry = {
  readonly tileId: string;
  readonly collision: string;
  readonly contentsActorId?: string;
  readonly contentSpawnLimit?: number;
  readonly contentSpawnCooldownFrames?: number;
};

type VglcActorLegendEntry = {
  readonly actorId: string;
  readonly role: string;
};

export type VglcTextLevelInput = {
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly tileSizePixels: number;
  readonly tileLegend: Readonly<Record<string, VglcTileLegendEntry>>;
  readonly actorLegend: Readonly<Record<string, VglcActorLegendEntry>>;
  readonly tileRows: readonly string[];
  readonly actorRows: readonly string[];
  readonly levelTimers?: LevelSpecInput["levelTimers"];
  readonly timedHazardProjectileSpawners?: LevelSpecInput["timedHazardProjectileSpawners"];
  readonly pathAnnotations?: LevelSpecInput["pathAnnotations"];
};

type TileDefinitionEntry = LevelSpecInput["tileDefinitions"][number];
type ActorDefinitionEntry = LevelSpecInput["actorDefinitions"][number];
type ActorPlacementEntry = LevelSpecInput["actors"][number];
type TileRow = LevelSpecInput["tiles"][number];

const actorEmptyCellCharacter = " ";

export function parseVglcTextLevel(
  input: VglcTextLevelInput,
): DomainResult<LevelSpecInput, ValidationError> {
  const errors: ValidationError[] = [];

  pushLegendKeyErrors(input.tileLegend, "tileLegend", errors);
  pushLegendKeyErrors(input.actorLegend, "actorLegend", errors);
  errors.push(...collectGridDimensionErrors(input));

  if (errors.length > 0) {
    return fail(errors);
  }

  const tileDefinitions = collectTileDefinitions(input.tileLegend);
  const actorDefinitions = collectActorDefinitions(input.actorLegend, errors);
  const tiles = collectTiles(input, errors);
  const actors = collectActors(input, errors);

  if (errors.length > 0) {
    return fail(errors);
  }

  const levelSpecInput: LevelSpecInput = {
    widthTiles: input.widthTiles,
    heightTiles: input.heightTiles,
    tileSizePixels: input.tileSizePixels,
    tileDefinitions,
    actorDefinitions,
    tiles,
    actors,
  };

  if (
    input.levelTimers !== undefined ||
    input.timedHazardProjectileSpawners !== undefined ||
    input.pathAnnotations !== undefined
  ) {
    return succeed({
      ...levelSpecInput,
      ...(input.levelTimers !== undefined
        ? { levelTimers: input.levelTimers }
        : {}),
      ...(input.timedHazardProjectileSpawners !== undefined
        ? {
            timedHazardProjectileSpawners: input.timedHazardProjectileSpawners,
          }
        : {}),
      ...(input.pathAnnotations !== undefined
        ? { pathAnnotations: input.pathAnnotations }
        : {}),
    });
  }

  return succeed(levelSpecInput);
}

function pushLegendKeyErrors(
  legend: Readonly<Record<string, unknown>>,
  path: string,
  errors: ValidationError[],
): void {
  for (const key of Object.keys(legend)) {
    if (key.length !== 1) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcLegendKeyInvalid,
          `${path} key ${key} must be a single character.`,
          `${path}.${key}`,
        ),
      );
    }
  }
}

function collectGridDimensionErrors(
  input: VglcTextLevelInput,
): readonly ValidationError[] {
  const errors: ValidationError[] = [];

  if (input.tileRows.length !== input.heightTiles) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcGridHeightMismatch,
        "tileRows length must equal heightTiles.",
        "tileRows",
      ),
    );
  }

  if (input.actorRows.length !== input.heightTiles) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.VglcGridHeightMismatch,
        "actorRows length must equal heightTiles.",
        "actorRows",
      ),
    );
  }

  for (const [rowIndex, row] of input.tileRows.entries()) {
    if (row.length !== input.widthTiles) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcGridWidthMismatch,
          `tileRows[${rowIndex}] length must equal widthTiles.`,
          `tileRows[${rowIndex}]`,
        ),
      );
    }
  }

  for (const [rowIndex, row] of input.actorRows.entries()) {
    if (row.length !== input.widthTiles) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.VglcGridWidthMismatch,
          `actorRows[${rowIndex}] length must equal widthTiles.`,
          `actorRows[${rowIndex}]`,
        ),
      );
    }
  }

  return errors;
}

function collectTileDefinitions(
  tileLegend: VglcTextLevelInput["tileLegend"],
): TileDefinitionEntry[] {
  const tileDefinitions: TileDefinitionEntry[] = [];
  const seenTileIds = new Set<string>();

  for (const [, entry] of Object.entries(tileLegend)) {
    if (seenTileIds.has(entry.tileId)) {
      continue;
    }

    seenTileIds.add(entry.tileId);
    tileDefinitions.push({
      tileId: entry.tileId,
      collision: entry.collision,
      ...(entry.contentsActorId === undefined
        ? {}
        : { contentsActorId: entry.contentsActorId }),
      ...(entry.contentSpawnLimit === undefined
        ? {}
        : { contentSpawnLimit: entry.contentSpawnLimit }),
      ...(entry.contentSpawnCooldownFrames === undefined
        ? {}
        : { contentSpawnCooldownFrames: entry.contentSpawnCooldownFrames }),
    });
  }

  return tileDefinitions;
}

function collectActorDefinitions(
  actorLegend: VglcTextLevelInput["actorLegend"],
  errors: ValidationError[],
): ActorDefinitionEntry[] {
  const actorDefinitions: ActorDefinitionEntry[] = [];
  const seenActorIds = new Set<string>();

  for (const [character, entry] of Object.entries(actorLegend)) {
    if (seenActorIds.has(entry.actorId)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.ActorDefinitionDuplicate,
          `actorLegend.${character} references a duplicate actorId ${entry.actorId}.`,
          `actorLegend.${character}`,
        ),
      );
      continue;
    }

    seenActorIds.add(entry.actorId);
    actorDefinitions.push({
      actorId: entry.actorId,
      role: entry.role,
    });
  }

  return actorDefinitions;
}

function collectTiles(
  input: VglcTextLevelInput,
  errors: ValidationError[],
): TileRow[] {
  const tiles: TileRow[] = [];

  for (const [rowIndex, row] of input.tileRows.entries()) {
    const validatedRow: string[] = [];

    for (const [columnIndex, character] of [...row].entries()) {
      const entry = input.tileLegend[character];

      if (entry === undefined) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.VglcTileCharacterUnknown,
            `tileRows[${rowIndex}][${columnIndex}] character ${character} is not in tileLegend.`,
            `tileRows[${rowIndex}][${columnIndex}]`,
          ),
        );
        validatedRow.push(character);
        continue;
      }

      validatedRow.push(entry.tileId);
    }

    tiles.push(validatedRow);
  }

  return tiles;
}

function collectActors(
  input: VglcTextLevelInput,
  errors: ValidationError[],
): ActorPlacementEntry[] {
  const actors: ActorPlacementEntry[] = [];
  const entityIdCounters = new Map<string, number>();

  for (const [rowIndex, row] of input.actorRows.entries()) {
    for (const [columnIndex, character] of [...row].entries()) {
      if (character === actorEmptyCellCharacter) {
        continue;
      }

      const entry = input.actorLegend[character];

      if (entry === undefined) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.VglcActorCharacterUnknown,
            `actorRows[${rowIndex}][${columnIndex}] character ${character} is not in actorLegend.`,
            `actorRows[${rowIndex}][${columnIndex}]`,
          ),
        );
        continue;
      }

      const nextCount = (entityIdCounters.get(entry.actorId) ?? 0) + 1;
      entityIdCounters.set(entry.actorId, nextCount);
      const entityIdResult = makeEntityId(
        `${entry.actorId}-${nextCount}`,
        `actorRows[${rowIndex}][${columnIndex}].entityId`,
      );

      if (!entityIdResult.ok) {
        errors.push(...entityIdResult.errors);
        continue;
      }

      actors.push({
        entityId: entityIdResult.value,
        actorId: entry.actorId,
        x: columnIndex,
        y: rowIndex,
      });
    }
  }

  return actors;
}
