import { makeEntityId } from "../../domain/identifiers";
import {
  TileCollisionKind,
  type LevelSpecInput,
} from "../../domain/level-spec";
import type { DomainResult } from "../../domain/result";
import { fail, succeed } from "../../domain/result";
import type { ValidationError } from "../../domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../../domain/validation-error";

export enum TiledLayerType {
  TileLayer = "tilelayer",
  ObjectGroup = "objectgroup",
}

type TiledTilesetTile = {
  readonly id: number;
  readonly type: string;
  readonly collision: string;
};

type TiledTileset = {
  readonly firstgid: number;
  readonly tiles: readonly TiledTilesetTile[];
};

type TiledTileLayer = {
  readonly type: TiledLayerType.TileLayer;
  readonly data: readonly number[];
};

type TiledObject = {
  readonly name: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
};

type TiledObjectLayer = {
  readonly type: TiledLayerType.ObjectGroup;
  readonly objects: readonly TiledObject[];
};

export type TiledLayer = TiledTileLayer | TiledObjectLayer;

export type TiledJsonLevelInput = {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly tilesets: readonly TiledTileset[];
  readonly layers: readonly TiledLayer[];
};

// Shape guard so a malformed uploaded Tiled file returns a validation error
// rather than crashing when parseTiledJsonLevel dereferences its arrays.
export function isTiledJsonLevelInput(
  value: unknown,
): value is TiledJsonLevelInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["tilewidth"] === "number" &&
    typeof candidate["tileheight"] === "number" &&
    Array.isArray(candidate["tilesets"]) &&
    Array.isArray(candidate["layers"])
  );
}

type TileDefinitionEntry = LevelSpecInput["tileDefinitions"][number];
type ActorDefinitionEntry = LevelSpecInput["actorDefinitions"][number];
type ActorPlacementEntry = LevelSpecInput["actors"][number];
type TileRow = LevelSpecInput["tiles"][number];

type ResolvedTile = {
  readonly tileId: string;
  readonly collision: string;
};

const emptyTileId = "empty";
const emptyTileCollision = TileCollisionKind.Empty;
const emptyGlobalTileId = 0;

export function parseTiledJsonLevel(
  input: TiledJsonLevelInput,
): DomainResult<LevelSpecInput, ValidationError> {
  const errors: ValidationError[] = [];

  if (input.tilewidth !== input.tileheight) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.TiledTileNotSquare,
        "tilewidth and tileheight must be equal; the runtime uses square tiles.",
        "tilewidth",
      ),
    );
  }

  const gidLookup = buildGlobalTileIdLookup(input.tilesets, errors);
  const tileLayer = findFirstTileLayer(input.layers, errors);

  if (tileLayer === undefined) {
    return fail(errors);
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const tileDefinitions = collectTileDefinitions(gidLookup);
  const actorDefinitions = collectActorDefinitions(input.layers, errors);
  const tiles = collectTiles(input, tileLayer, gidLookup, errors);
  const actors = collectActors(input, errors);

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed({
    widthTiles: input.width,
    heightTiles: input.height,
    tileSizePixels: input.tilewidth,
    tileDefinitions,
    actorDefinitions,
    tiles,
    actors,
  });
}

function buildGlobalTileIdLookup(
  tilesets: readonly TiledTileset[],
  errors: ValidationError[],
): Map<number, ResolvedTile> {
  const lookup = new Map<number, ResolvedTile>();

  for (const [tilesetIndex, tileset] of tilesets.entries()) {
    for (const [tileIndex, tile] of tileset.tiles.entries()) {
      const globalTileId = tileset.firstgid + tile.id;

      if (lookup.has(globalTileId)) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.TiledUnknownGlobalTileId,
            `tilesets[${tilesetIndex}].tiles[${tileIndex}] global tile id ${globalTileId} collides with another tileset entry.`,
            `tilesets[${tilesetIndex}].tiles[${tileIndex}]`,
          ),
        );
        continue;
      }

      lookup.set(globalTileId, {
        tileId: tile.type,
        collision: tile.collision,
      });
    }
  }

  return lookup;
}

function findFirstTileLayer(
  layers: readonly TiledLayer[],
  errors: ValidationError[],
): TiledTileLayer | undefined {
  for (const layer of layers) {
    if (layer.type === TiledLayerType.TileLayer) {
      return layer;
    }
  }

  errors.push(
    makeValidationError(
      ValidationErrorCode.TiledTileLayerMissing,
      "layers must include at least one tilelayer.",
      "layers",
    ),
  );
  return undefined;
}

function collectTileDefinitions(
  gidLookup: Map<number, ResolvedTile>,
): TileDefinitionEntry[] {
  const tileDefinitions: TileDefinitionEntry[] = [];
  const seenTileIds = new Set<string>();

  tileDefinitions.push({
    tileId: emptyTileId,
    collision: emptyTileCollision,
  });
  seenTileIds.add(emptyTileId);

  for (const resolved of gidLookup.values()) {
    if (seenTileIds.has(resolved.tileId)) {
      continue;
    }
    seenTileIds.add(resolved.tileId);
    tileDefinitions.push({
      tileId: resolved.tileId,
      collision: resolved.collision,
    });
  }

  return tileDefinitions;
}

function collectActorDefinitions(
  layers: readonly TiledLayer[],
  errors: ValidationError[],
): ActorDefinitionEntry[] {
  const actorDefinitions: ActorDefinitionEntry[] = [];
  const seenActorIds = new Set<string>();

  for (const layer of layers) {
    if (layer.type !== TiledLayerType.ObjectGroup) {
      continue;
    }

    for (const objectEntry of layer.objects) {
      if (objectEntry.name.trim().length === 0) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.TiledObjectNameMissing,
            "Tiled object is missing a name (actorId).",
            "layers.objects",
          ),
        );
        continue;
      }

      if (seenActorIds.has(objectEntry.name)) {
        continue;
      }
      seenActorIds.add(objectEntry.name);
      actorDefinitions.push({
        actorId: objectEntry.name,
        role: objectEntry.type,
      });
    }
  }

  return actorDefinitions;
}

function collectTiles(
  input: TiledJsonLevelInput,
  tileLayer: TiledTileLayer,
  gidLookup: Map<number, ResolvedTile>,
  errors: ValidationError[],
): TileRow[] {
  const expectedLength = input.width * input.height;

  if (tileLayer.data.length !== expectedLength) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.TiledTileLayerLengthMismatch,
        `tilelayer data length must equal width * height (${expectedLength}).`,
        "layers.data",
      ),
    );
    return [];
  }

  const tiles: TileRow[] = [];

  for (let rowIndex = 0; rowIndex < input.height; rowIndex += 1) {
    const row: string[] = [];
    for (let columnIndex = 0; columnIndex < input.width; columnIndex += 1) {
      const dataIndex = rowIndex * input.width + columnIndex;
      const globalTileId = tileLayer.data[dataIndex];

      if (globalTileId === undefined) {
        row.push(emptyTileId);
        continue;
      }

      if (globalTileId === emptyGlobalTileId) {
        row.push(emptyTileId);
        continue;
      }

      const resolved = gidLookup.get(globalTileId);
      if (resolved === undefined) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.TiledUnknownGlobalTileId,
            `tilelayer data index ${dataIndex} references unknown global tile id ${globalTileId}.`,
            `layers.data[${dataIndex}]`,
          ),
        );
        row.push(emptyTileId);
        continue;
      }

      row.push(resolved.tileId);
    }
    tiles.push(row);
  }

  return tiles;
}

function collectActors(
  input: TiledJsonLevelInput,
  errors: ValidationError[],
): ActorPlacementEntry[] {
  const actors: ActorPlacementEntry[] = [];
  const entityIdCounters = new Map<string, number>();

  for (const layer of input.layers) {
    if (layer.type !== TiledLayerType.ObjectGroup) {
      continue;
    }

    for (const [objectIndex, objectEntry] of layer.objects.entries()) {
      if (objectEntry.name.trim().length === 0) {
        continue;
      }

      if (objectEntry.type.trim().length === 0) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.TiledObjectRoleMissing,
            `layers.objects[${objectIndex}] ${objectEntry.name} is missing a type (role).`,
            `layers.objects[${objectIndex}].type`,
          ),
        );
        continue;
      }

      const nextCount = (entityIdCounters.get(objectEntry.name) ?? 0) + 1;
      entityIdCounters.set(objectEntry.name, nextCount);
      const entityIdResult = makeEntityId(
        `${objectEntry.name}-${nextCount}`,
        `layers.objects[${objectIndex}].entityId`,
      );

      if (!entityIdResult.ok) {
        errors.push(...entityIdResult.errors);
        continue;
      }

      actors.push({
        entityId: entityIdResult.value,
        actorId: objectEntry.name,
        x: Math.floor(objectEntry.x / input.tilewidth),
        y: Math.floor(objectEntry.y / input.tileheight),
      });
    }
  }

  return actors;
}
