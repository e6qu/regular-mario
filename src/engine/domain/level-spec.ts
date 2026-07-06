import type { Brand } from "./brand";
import type { ActorId, EntityId, TileId } from "./identifiers";
import { makeActorId, makeEntityId, makeTileId } from "./identifiers";
import type { DomainResult } from "./result";
import { fail, succeed } from "./result";
import type {
  ColliderDimensionPixels,
  AccelerationPixelsPerSecondSquared,
  LevelHeightTiles,
  LevelWidthTiles,
  TilePoint,
  TileSizePixels,
  VelocityPixelsPerSecond,
} from "./units";
import {
  makeActorCoordinate,
  makeAccelerationPixelsPerSecondSquared,
  makeColliderDimensionPixels,
  makeLevelHeightTiles,
  makeLevelWidthTiles,
  makeTileSizePixels,
  makeVelocityPixelsPerSecond,
} from "./units";
import type { ValidationError } from "./validation-error";
import { makeValidationError, ValidationErrorCode } from "./validation-error";

type ActorPlacementInput = {
  readonly entityId: string;
  readonly actorId: string;
  readonly x: number;
  readonly y: number;
  readonly targetLevelName?: string;
  readonly targetTileX?: number;
  readonly targetTileY?: number;
  // How a pipe is entered: "down" (stand on top, press down — the default) or a
  // sideways "left"/"right" walk-in (walk into the mouth), as SMB's warp-zone
  // return pipes work.
  readonly pipeEntryDirection?: string;
};

// "down" = top-entry (press down); "left"/"right" = walk into the pipe mouth
// while moving that way.
export type PipeEntryDirection = "down" | "left" | "right";

function resolvePipeEntryDirection(
  value: string | undefined,
): PipeEntryDirection {
  return value === "left" || value === "right" ? value : "down";
}

type LevelTimerDefinitionInput = {
  readonly timerId: string;
  readonly frames: number;
};

type TimedHazardProjectileSpawnerInput = {
  readonly spawnerId: string;
  readonly x: number;
  readonly y: number;
  readonly direction: string;
  readonly intervalFrames: number;
  readonly initialDelayFrames: number;
  readonly speedPixelsPerSecond: number;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly lifetimeFrames: number;
  // Stompable projectiles (Bullet Bills) can be defeated by jumping on them.
  readonly stompable?: boolean;
};

type PathAnnotationPointInput = {
  readonly x: number;
  readonly y: number;
};

type PathAnnotationInput = {
  readonly pathId: string;
  readonly points: readonly PathAnnotationPointInput[];
};

type SpawnedPowerUpMovementInput = {
  readonly velocityX: number;
  readonly gravity: number;
  readonly terminalFallVelocityY: number;
};

export enum TileCollisionKind {
  Empty = "empty",
  Solid = "solid",
  Interactive = "interactive",
  Breakable = "breakable",
  SolidHazard = "solid-hazard",
  Hazard = "hazard",
  Spring = "spring",
  Goal = "goal",
  // Invisible + intangible until bumped from below; then it becomes solid and
  // yields its contents, exactly like an interactive block.
  Hidden = "hidden",
}

type TileDefinitionInput = {
  readonly tileId: string;
  readonly collision: string;
  readonly contentsActorId?: string;
  readonly contentSpawnLimit?: number;
  readonly contentSpawnCooldownFrames?: number;
};

export enum ActorRole {
  PlayerStart = "player-start",
  Enemy = "enemy",
  FlyingEnemy = "flying-enemy",
  ChasingEnemy = "chasing-enemy",
  ArmoredEnemy = "armored-enemy",
  ThrowingEnemy = "throwing-enemy",
  AerialThrowingEnemy = "aerial-throwing-enemy",
  PiranhaPlant = "piranha-plant",
  Coin = "coin",
  Item = "item",
  PowerUp = "power-up",
  ExtraLife = "extra-life",
  InvincibilityPowerUp = "invincibility-power-up",
  Climbable = "climbable",
  Exit = "exit",
  Pipe = "pipe",
}

type ActorDefinitionInput = {
  readonly actorId: string;
  readonly role: string;
  readonly spriteWidthPixels?: number;
  readonly spriteHeightPixels?: number;
  readonly colliderWidthPixels?: number;
  readonly colliderHeightPixels?: number;
  // Armored enemies with this set (Buzzy Beetle) shrug off fireballs.
  readonly fireproof?: boolean;
};

export type LevelSpecInput = {
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly tileSizePixels: number;
  readonly tileDefinitions: readonly TileDefinitionInput[];
  readonly actorDefinitions: readonly ActorDefinitionInput[];
  readonly tiles: readonly (readonly string[])[];
  readonly actors: readonly ActorPlacementInput[];
  readonly enemyPatrolSpeedByEntityId?: Readonly<Record<string, number>>;
  readonly levelTimers?: readonly LevelTimerDefinitionInput[];
  readonly timedHazardProjectileSpawners?: readonly TimedHazardProjectileSpawnerInput[];
  readonly pathAnnotations?: readonly PathAnnotationInput[];
  readonly spawnedPowerUpMovement?: SpawnedPowerUpMovementInput;
};

type LevelTimerId = Brand<string, "LevelTimerId">;
export type LevelTimerFrameCount = Brand<number, "LevelTimerFrameCount">;
type PathAnnotationId = Brand<string, "PathAnnotationId">;
type TimedHazardProjectileSpawnerId = Brand<
  string,
  "TimedHazardProjectileSpawnerId"
>;
type TimedHazardProjectileFrameCount = Brand<
  number,
  "TimedHazardProjectileFrameCount"
>;

export enum TimedHazardProjectileDirection {
  Left = "left",
  Right = "right",
}

type TileDefinition = {
  readonly tileId: TileId;
  readonly collision: TileCollisionKind;
  readonly contentsActorId: ActorId | undefined;
  readonly contentSpawnLimit: number | undefined;
  readonly contentSpawnCooldownFrames: number | undefined;
};

type ActorDefinition = {
  readonly actorId: ActorId;
  readonly role: ActorRole;
  readonly spriteWidthPixels: ColliderDimensionPixels | undefined;
  readonly spriteHeightPixels: ColliderDimensionPixels | undefined;
  readonly colliderWidthPixels: ColliderDimensionPixels | undefined;
  readonly colliderHeightPixels: ColliderDimensionPixels | undefined;
  readonly fireproof: boolean;
};

type ActorPlacement = {
  readonly entityId: EntityId;
  readonly actorId: ActorId;
  readonly position: TilePoint;
  readonly targetLevelName: string | undefined;
  readonly targetTilePosition: TilePoint | undefined;
  readonly pipeEntryDirection: PipeEntryDirection;
};

export type LevelTimerDefinition = {
  readonly timerId: LevelTimerId;
  readonly frames: LevelTimerFrameCount;
};

type PathAnnotation = {
  readonly pathId: PathAnnotationId;
  readonly points: readonly TilePoint[];
};

type TimedHazardProjectileSpawner = {
  readonly spawnerId: TimedHazardProjectileSpawnerId;
  readonly position: TilePoint;
  readonly direction: TimedHazardProjectileDirection;
  readonly intervalFrames: TimedHazardProjectileFrameCount;
  readonly initialDelayFrames: TimedHazardProjectileFrameCount;
  readonly speedPixelsPerSecond: VelocityPixelsPerSecond;
  readonly widthPixels: ColliderDimensionPixels;
  readonly heightPixels: ColliderDimensionPixels;
  readonly lifetimeFrames: TimedHazardProjectileFrameCount;
  readonly stompable: boolean;
};

export type SpawnedPowerUpMovement = {
  readonly velocityX: VelocityPixelsPerSecond;
  readonly gravity: AccelerationPixelsPerSecondSquared;
  readonly terminalFallVelocityY: VelocityPixelsPerSecond;
};

export type LevelSpec = {
  readonly widthTiles: LevelWidthTiles;
  readonly heightTiles: LevelHeightTiles;
  readonly tileSizePixels: TileSizePixels;
  readonly tileDefinitions: readonly TileDefinition[];
  readonly actorDefinitions: readonly ActorDefinition[];
  readonly tiles: readonly (readonly TileId[])[];
  readonly actors: readonly ActorPlacement[];
  readonly pipes: readonly PipePlacement[];
  readonly enemyPatrolSpeedByEntityId: ReadonlyMap<
    EntityId,
    VelocityPixelsPerSecond
  >;
  readonly levelTimers: readonly LevelTimerDefinition[];
  readonly pathAnnotations: readonly PathAnnotation[];
  readonly timedHazardProjectileSpawners: readonly TimedHazardProjectileSpawner[];
  readonly spawnedPowerUpMovement: SpawnedPowerUpMovement | undefined;
};

type ValidatedDimensions = {
  readonly widthTiles: LevelWidthTiles;
  readonly heightTiles: LevelHeightTiles;
  readonly tileSizePixels: TileSizePixels;
};

type ValidatedDefinitions = {
  readonly tileDefinitions: readonly TileDefinition[];
  readonly actorDefinitions: readonly ActorDefinition[];
  readonly knownTileIds: ReadonlySet<string>;
  readonly knownActorIds: ReadonlySet<string>;
  readonly actorRoles: ReadonlyMap<string, ActorRole>;
};

type PipePlacement = {
  readonly entityId: EntityId;
  readonly actorId: ActorId;
  readonly position: TilePoint;
  readonly targetLevelName: string | undefined;
  readonly targetTilePosition: TilePoint;
  readonly entryDirection: PipeEntryDirection;
};

const metadataIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const timedHazardProjectileDirectionByValue = new Map<
  string,
  TimedHazardProjectileDirection
>([
  ["left", TimedHazardProjectileDirection.Left],
  ["right", TimedHazardProjectileDirection.Right],
]);

function makeTileCollisionKind(
  value: string,
  path: string,
): DomainResult<TileCollisionKind, ValidationError> {
  switch (value) {
    case "empty":
      return succeed(TileCollisionKind.Empty);
    case "solid":
      return succeed(TileCollisionKind.Solid);
    case "interactive":
      return succeed(TileCollisionKind.Interactive);
    case "breakable":
      return succeed(TileCollisionKind.Breakable);
    case "solid-hazard":
      return succeed(TileCollisionKind.SolidHazard);
    case "hazard":
      return succeed(TileCollisionKind.Hazard);
    case "spring":
      return succeed(TileCollisionKind.Spring);
    case "goal":
      return succeed(TileCollisionKind.Goal);
    case "hidden":
      return succeed(TileCollisionKind.Hidden);
    default:
      return fail([
        makeValidationError(
          ValidationErrorCode.TileCollisionInvalid,
          `${path} must be one of: empty, solid, interactive, breakable, solid-hazard, hazard, spring, goal, hidden.`,
          path,
        ),
      ]);
  }
}

function makeActorRole(
  value: string,
  path: string,
): DomainResult<ActorRole, ValidationError> {
  switch (value) {
    case "player-start":
      return succeed(ActorRole.PlayerStart);
    case "enemy":
      return succeed(ActorRole.Enemy);
    case "flying-enemy":
      return succeed(ActorRole.FlyingEnemy);
    case "chasing-enemy":
      return succeed(ActorRole.ChasingEnemy);
    case "armored-enemy":
      return succeed(ActorRole.ArmoredEnemy);
    case "throwing-enemy":
      return succeed(ActorRole.ThrowingEnemy);
    case "aerial-throwing-enemy":
      return succeed(ActorRole.AerialThrowingEnemy);
    case "piranha-plant":
      return succeed(ActorRole.PiranhaPlant);
    case "coin":
      return succeed(ActorRole.Coin);
    case "item":
      return succeed(ActorRole.Item);
    case "power-up":
      return succeed(ActorRole.PowerUp);
    case "extra-life":
      return succeed(ActorRole.ExtraLife);
    case "invincibility-power-up":
      return succeed(ActorRole.InvincibilityPowerUp);
    case "climbable":
      return succeed(ActorRole.Climbable);
    case "exit":
      return succeed(ActorRole.Exit);
    case "pipe":
      return succeed(ActorRole.Pipe);
    default:
      return fail([
        makeValidationError(
          ValidationErrorCode.ActorRoleInvalid,
          `${path} must be one of: player-start, enemy, flying-enemy, chasing-enemy, armored-enemy, throwing-enemy, aerial-throwing-enemy, piranha-plant, coin, item, power-up, extra-life, invincibility-power-up, climbable, exit, pipe.`,
          path,
        ),
      ]);
  }
}

function makeOptionalColliderDimensionPixels(
  value: number | undefined,
  path: string,
): DomainResult<ColliderDimensionPixels | undefined, ValidationError> {
  if (value === undefined) {
    return succeed(undefined);
  }

  return makeColliderDimensionPixels(value, path);
}

function collectDimensionErrors(
  input: LevelSpecInput,
): DomainResult<ValidatedDimensions, ValidationError> {
  const errors: ValidationError[] = [];

  const widthResult = makeLevelWidthTiles(input.widthTiles, "widthTiles");
  const heightResult = makeLevelHeightTiles(input.heightTiles, "heightTiles");
  const tileSizeResult = makeTileSizePixels(
    input.tileSizePixels,
    "tileSizePixels",
  );

  if (!widthResult.ok) {
    errors.push(...widthResult.errors);
  }

  if (!heightResult.ok) {
    errors.push(...heightResult.errors);
  }

  if (!tileSizeResult.ok) {
    errors.push(...tileSizeResult.errors);
  }

  if (!widthResult.ok || !heightResult.ok || !tileSizeResult.ok) {
    return fail(errors);
  }

  return succeed({
    widthTiles: widthResult.value,
    heightTiles: heightResult.value,
    tileSizePixels: tileSizeResult.value,
  });
}

function validateDefinitions(
  input: LevelSpecInput,
): DomainResult<ValidatedDefinitions, ValidationError> {
  const errors: ValidationError[] = [];
  const tileDefinitions: TileDefinition[] = [];
  const actorDefinitions: ActorDefinition[] = [];
  const knownTileIds = new Set<string>();
  const knownActorIds = new Set<string>();
  const actorRoles = new Map<string, ActorRole>();

  for (const [tileIndex, tileInput] of input.tileDefinitions.entries()) {
    const tileIdResult = makeTileId(
      tileInput.tileId,
      `tileDefinitions[${tileIndex}].tileId`,
    );
    const collisionResult = makeTileCollisionKind(
      tileInput.collision,
      `tileDefinitions[${tileIndex}].collision`,
    );
    const contentsActorIdResult =
      tileInput.contentsActorId === undefined
        ? undefined
        : makeActorId(
            tileInput.contentsActorId,
            `tileDefinitions[${tileIndex}].contentsActorId`,
          );
    const contentSpawnLimitResult =
      tileInput.contentSpawnLimit === undefined
        ? undefined
        : makeContentSpawnLimit(
            tileInput.contentSpawnLimit,
            `tileDefinitions[${tileIndex}].contentSpawnLimit`,
          );
    const contentSpawnCooldownFramesResult =
      tileInput.contentSpawnCooldownFrames === undefined
        ? undefined
        : makeContentSpawnCooldownFrames(
            tileInput.contentSpawnCooldownFrames,
            `tileDefinitions[${tileIndex}].contentSpawnCooldownFrames`,
          );

    if (tileIdResult.ok) {
      if (knownTileIds.has(tileInput.tileId)) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.TileDefinitionDuplicate,
            `tileDefinitions[${tileIndex}].tileId must be unique.`,
            `tileDefinitions[${tileIndex}].tileId`,
          ),
        );
      } else {
        knownTileIds.add(tileInput.tileId);
      }
    } else {
      errors.push(...tileIdResult.errors);
    }

    if (!collisionResult.ok) {
      errors.push(...collisionResult.errors);
    }

    if (contentsActorIdResult !== undefined && !contentsActorIdResult.ok) {
      errors.push(...contentsActorIdResult.errors);
    }

    if (contentSpawnLimitResult !== undefined && !contentSpawnLimitResult.ok) {
      errors.push(...contentSpawnLimitResult.errors);
    }

    if (
      contentSpawnCooldownFramesResult !== undefined &&
      !contentSpawnCooldownFramesResult.ok
    ) {
      errors.push(...contentSpawnCooldownFramesResult.errors);
    }

    if (
      tileIdResult.ok &&
      collisionResult.ok &&
      (contentsActorIdResult === undefined || contentsActorIdResult.ok) &&
      (contentSpawnLimitResult === undefined || contentSpawnLimitResult.ok) &&
      (contentSpawnCooldownFramesResult === undefined ||
        contentSpawnCooldownFramesResult.ok)
    ) {
      tileDefinitions.push({
        tileId: tileIdResult.value,
        collision: collisionResult.value,
        contentsActorId:
          contentsActorIdResult === undefined
            ? undefined
            : contentsActorIdResult.value,
        contentSpawnLimit:
          contentSpawnLimitResult === undefined
            ? undefined
            : contentSpawnLimitResult.value,
        contentSpawnCooldownFrames:
          contentSpawnCooldownFramesResult === undefined
            ? undefined
            : contentSpawnCooldownFramesResult.value,
      });
    }
  }

  for (const [actorIndex, actorInput] of input.actorDefinitions.entries()) {
    const actorIdResult = makeActorId(
      actorInput.actorId,
      `actorDefinitions[${actorIndex}].actorId`,
    );
    const roleResult = makeActorRole(
      actorInput.role,
      `actorDefinitions[${actorIndex}].role`,
    );
    const spriteWidthResult = makeOptionalColliderDimensionPixels(
      actorInput.spriteWidthPixels,
      `actorDefinitions[${actorIndex}].spriteWidthPixels`,
    );
    const spriteHeightResult = makeOptionalColliderDimensionPixels(
      actorInput.spriteHeightPixels,
      `actorDefinitions[${actorIndex}].spriteHeightPixels`,
    );
    const colliderWidthResult = makeOptionalColliderDimensionPixels(
      actorInput.colliderWidthPixels,
      `actorDefinitions[${actorIndex}].colliderWidthPixels`,
    );
    const colliderHeightResult = makeOptionalColliderDimensionPixels(
      actorInput.colliderHeightPixels,
      `actorDefinitions[${actorIndex}].colliderHeightPixels`,
    );

    if (actorIdResult.ok) {
      if (knownActorIds.has(actorInput.actorId)) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.ActorDefinitionDuplicate,
            `actorDefinitions[${actorIndex}].actorId must be unique.`,
            `actorDefinitions[${actorIndex}].actorId`,
          ),
        );
      } else {
        knownActorIds.add(actorInput.actorId);
      }
    } else {
      errors.push(...actorIdResult.errors);
    }

    if (!roleResult.ok) {
      errors.push(...roleResult.errors);
    }

    if (!spriteWidthResult.ok) {
      errors.push(...spriteWidthResult.errors);
    }

    if (!spriteHeightResult.ok) {
      errors.push(...spriteHeightResult.errors);
    }

    if (!colliderWidthResult.ok) {
      errors.push(...colliderWidthResult.errors);
    }

    if (!colliderHeightResult.ok) {
      errors.push(...colliderHeightResult.errors);
    }

    if (
      spriteWidthResult.ok &&
      spriteHeightResult.ok &&
      (spriteWidthResult.value === undefined) !==
        (spriteHeightResult.value === undefined)
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.ColliderDimensionInvalid,
          `actorDefinitions[${actorIndex}].spriteWidthPixels and spriteHeightPixels must be provided together.`,
          `actorDefinitions[${actorIndex}]`,
        ),
      );
    }

    if (
      colliderWidthResult.ok &&
      colliderHeightResult.ok &&
      (colliderWidthResult.value === undefined) !==
        (colliderHeightResult.value === undefined)
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.ColliderDimensionInvalid,
          `actorDefinitions[${actorIndex}].colliderWidthPixels and colliderHeightPixels must be provided together.`,
          `actorDefinitions[${actorIndex}]`,
        ),
      );
    }

    if (
      actorIdResult.ok &&
      roleResult.ok &&
      spriteWidthResult.ok &&
      spriteHeightResult.ok &&
      colliderWidthResult.ok &&
      colliderHeightResult.ok
    ) {
      actorDefinitions.push({
        actorId: actorIdResult.value,
        role: roleResult.value,
        spriteWidthPixels: spriteWidthResult.value,
        spriteHeightPixels: spriteHeightResult.value,
        colliderWidthPixels: colliderWidthResult.value,
        colliderHeightPixels: colliderHeightResult.value,
        fireproof: actorInput.fireproof === true,
      });
      actorRoles.set(actorInput.actorId, roleResult.value);
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed({
    tileDefinitions,
    actorDefinitions,
    knownTileIds,
    knownActorIds,
    actorRoles,
  });
}

function validateTileGrid(
  input: LevelSpecInput,
  knownTileIds: ReadonlySet<string>,
): DomainResult<readonly (readonly TileId[])[], ValidationError> {
  const errors: ValidationError[] = [];
  const rows: TileId[][] = [];

  if (input.tiles.length !== input.heightTiles) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.TileGridHeightMismatch,
        "tiles row count must equal heightTiles.",
        "tiles",
      ),
    );
  }

  for (const [rowIndex, row] of input.tiles.entries()) {
    if (row.length !== input.widthTiles) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.TileGridWidthMismatch,
          `tiles[${rowIndex}] length must equal widthTiles.`,
          `tiles[${rowIndex}]`,
        ),
      );
    }

    const validatedRow: TileId[] = [];

    for (const [columnIndex, rawTileId] of row.entries()) {
      const tileIdResult = makeTileId(
        rawTileId,
        `tiles[${rowIndex}][${columnIndex}]`,
      );

      if (tileIdResult.ok) {
        validatedRow.push(tileIdResult.value);
        if (!knownTileIds.has(rawTileId)) {
          errors.push(
            makeValidationError(
              ValidationErrorCode.UnknownTileId,
              `tiles[${rowIndex}][${columnIndex}] must reference a tile definition.`,
              `tiles[${rowIndex}][${columnIndex}]`,
            ),
          );
        }
      } else {
        errors.push(...tileIdResult.errors);
      }
    }

    rows.push(validatedRow);
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed(rows);
}

function validateActorPositionBounds(
  actorInput: ActorPlacementInput,
  actorIndex: number,
  input: LevelSpecInput,
): readonly ValidationError[] {
  const errors: ValidationError[] = [];

  if (actorInput.x >= input.widthTiles) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ActorPositionOutOfBounds,
        `actors[${actorIndex}].x must be inside level width.`,
        `actors[${actorIndex}].x`,
      ),
    );
  }

  if (actorInput.y >= input.heightTiles) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ActorPositionOutOfBounds,
        `actors[${actorIndex}].y must be inside level height.`,
        `actors[${actorIndex}].y`,
      ),
    );
  }

  return errors;
}

function validateActorRules(
  actors: readonly ActorPlacementInput[],
  actorRoles: ReadonlyMap<string, ActorRole>,
): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  let playerStartCount = 0;
  let exitCount = 0;

  for (const actorInput of actors) {
    const role = actorRoles.get(actorInput.actorId);

    if (role === ActorRole.PlayerStart) {
      playerStartCount += 1;
    }

    if (role === ActorRole.Exit) {
      exitCount += 1;
    }
  }

  if (playerStartCount !== 1) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.PlayerStartCountInvalid,
        "actors must include exactly one player-start actor.",
        "actors",
      ),
    );
  }

  if (exitCount < 1) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ExitCountInvalid,
        "actors must include at least one exit actor.",
        "actors",
      ),
    );
  }

  return errors;
}

function validateActors(
  input: LevelSpecInput,
  knownActorIds: ReadonlySet<string>,
  actorRoles: ReadonlyMap<string, ActorRole>,
): DomainResult<readonly ActorPlacement[], ValidationError> {
  const errors: ValidationError[] = [];
  const actors: ActorPlacement[] = [];
  const entityIds = new Set<string>();

  for (const [actorIndex, actorInput] of input.actors.entries()) {
    const entityIdResult = makeEntityId(
      actorInput.entityId,
      `actors[${actorIndex}].entityId`,
    );
    const actorIdResult = makeActorId(
      actorInput.actorId,
      `actors[${actorIndex}].actorId`,
    );
    const xResult = makeActorCoordinate(
      actorInput.x,
      `actors[${actorIndex}].x`,
    );
    const yResult = makeActorCoordinate(
      actorInput.y,
      `actors[${actorIndex}].y`,
    );

    errors.push(...validateActorPositionBounds(actorInput, actorIndex, input));

    if (!entityIdResult.ok) {
      errors.push(...entityIdResult.errors);
    } else if (entityIds.has(actorInput.entityId)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.EntityIdDuplicate,
          `actors[${actorIndex}].entityId must be unique.`,
          `actors[${actorIndex}].entityId`,
        ),
      );
    } else {
      entityIds.add(actorInput.entityId);
    }

    if (!actorIdResult.ok) {
      errors.push(...actorIdResult.errors);
    } else if (!knownActorIds.has(actorInput.actorId)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.UnknownActorId,
          `actors[${actorIndex}].actorId must reference an actor definition.`,
          `actors[${actorIndex}].actorId`,
        ),
      );
    }

    if (!xResult.ok) {
      errors.push(...xResult.errors);
    }

    if (!yResult.ok) {
      errors.push(...yResult.errors);
    }

    if (entityIdResult.ok && actorIdResult.ok && xResult.ok && yResult.ok) {
      const role = actorRoles.get(actorIdResult.value);
      const targetTilePosition = resolveTargetTilePosition(
        actorInput,
        actorIndex,
        role,
        input,
        errors,
      );

      actors.push({
        entityId: entityIdResult.value,
        actorId: actorIdResult.value,
        position: {
          x: xResult.value,
          y: yResult.value,
        },
        targetLevelName: normalizeTargetLevelName(actorInput.targetLevelName),
        targetTilePosition,
        pipeEntryDirection: resolvePipeEntryDirection(
          actorInput.pipeEntryDirection,
        ),
      });
    }
  }

  errors.push(...validateActorRules(input.actors, actorRoles));
  errors.push(...validatePipePlacements(actors, actorRoles));

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed(actors);
}

function normalizeTargetLevelName(
  value: string | undefined,
): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return value.trim();
}

function resolveTargetTilePosition(
  actorInput: ActorPlacementInput,
  actorIndex: number,
  role: ActorRole | undefined,
  input: LevelSpecInput,
  errors: ValidationError[],
): TilePoint | undefined {
  const hasTargetTileX = actorInput.targetTileX !== undefined;
  const hasTargetTileY = actorInput.targetTileY !== undefined;

  if (role !== ActorRole.Pipe) {
    if (hasTargetTileX || hasTargetTileY) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.PipeOnlyTargetTile,
          `actors[${actorIndex}].targetTileX and targetTileY are only allowed for pipe actors.`,
          `actors[${actorIndex}]`,
        ),
      );
    }

    return undefined;
  }

  if (!hasTargetTileX || !hasTargetTileY) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.PipeTargetTileRequired,
        `actors[${actorIndex}].targetTileX and targetTileY are required for pipe actors.`,
        `actors[${actorIndex}]`,
      ),
    );

    return undefined;
  }

  const xResult = makeActorCoordinate(
    actorInput.targetTileX,
    `actors[${actorIndex}].targetTileX`,
  );
  const yResult = makeActorCoordinate(
    actorInput.targetTileY,
    `actors[${actorIndex}].targetTileY`,
  );

  if (!xResult.ok) {
    errors.push(...xResult.errors);
  }

  if (!yResult.ok) {
    errors.push(...yResult.errors);
  }

  // A cross-area warp (targetLevelName set) points into a different level, so its
  // target tile is bounded by that level, not this one — only enforce the upper
  // bound for same-level warps. The lower bound (>= 0) always applies.
  const boundToThisLevel = actorInput.targetLevelName === undefined;

  if (
    xResult.ok &&
    (xResult.value < 0 ||
      (boundToThisLevel && xResult.value >= input.widthTiles))
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ActorPositionOutOfBounds,
        `actors[${actorIndex}].targetTileX must be inside level width.`,
        `actors[${actorIndex}].targetTileX`,
      ),
    );
  }

  if (
    yResult.ok &&
    (yResult.value < 0 ||
      (boundToThisLevel && yResult.value >= input.heightTiles))
  ) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ActorPositionOutOfBounds,
        `actors[${actorIndex}].targetTileY must be inside level height.`,
        `actors[${actorIndex}].targetTileY`,
      ),
    );
  }

  if (!xResult.ok || !yResult.ok) {
    return undefined;
  }

  return {
    x: xResult.value,
    y: yResult.value,
  };
}

function validatePipePlacements(
  actors: readonly ActorPlacement[],
  actorRoles: ReadonlyMap<string, ActorRole>,
): readonly ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [index, actor] of actors.entries()) {
    const role = actorRoles.get(actor.actorId);

    if (role !== ActorRole.Pipe) {
      continue;
    }

    if (actor.targetTilePosition === undefined) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.PipeTargetTileRequired,
          `actors[${index}] is a pipe actor and requires a target tile position.`,
          `actors[${index}]`,
        ),
      );
    }
  }

  return errors;
}

export function isEnemyRole(role: ActorRole | undefined): boolean {
  return (
    role === ActorRole.Enemy ||
    role === ActorRole.FlyingEnemy ||
    role === ActorRole.ChasingEnemy ||
    role === ActorRole.ArmoredEnemy ||
    role === ActorRole.ThrowingEnemy ||
    role === ActorRole.AerialThrowingEnemy ||
    role === ActorRole.PiranhaPlant
  );
}

export function makeLevelSpec(
  input: LevelSpecInput,
): DomainResult<LevelSpec, ValidationError> {
  const errors: ValidationError[] = [];
  const dimensionsResult = collectDimensionErrors(input);
  const definitionsResult = validateDefinitions(input);

  if (!dimensionsResult.ok) {
    errors.push(...dimensionsResult.errors);
  }

  if (!definitionsResult.ok) {
    errors.push(...definitionsResult.errors);
  }

  if (!dimensionsResult.ok || !definitionsResult.ok) {
    return fail(errors);
  }

  const tilesResult = validateTileGrid(
    input,
    definitionsResult.value.knownTileIds,
  );
  const actorsResult = validateActors(
    input,
    definitionsResult.value.knownActorIds,
    definitionsResult.value.actorRoles,
  );

  if (!tilesResult.ok) {
    errors.push(...tilesResult.errors);
  }

  if (!actorsResult.ok) {
    errors.push(...actorsResult.errors);
  }

  if (!tilesResult.ok || !actorsResult.ok) {
    return fail(errors);
  }

  const enemyPatrolSpeedResult = validateEnemyPatrolSpeedOverrides(
    input,
    actorsResult.value,
    definitionsResult.value.actorRoles,
  );
  const levelTimersResult = validateLevelTimers(input);
  const pathAnnotationsResult = validatePathAnnotations(input);
  const timedHazardProjectileSpawnersResult =
    validateTimedHazardProjectileSpawners(input);
  const spawnedPowerUpMovementResult = validateSpawnedPowerUpMovement(input);

  if (!enemyPatrolSpeedResult.ok) {
    errors.push(...enemyPatrolSpeedResult.errors);
  }

  if (!levelTimersResult.ok) {
    errors.push(...levelTimersResult.errors);
  }

  if (!pathAnnotationsResult.ok) {
    errors.push(...pathAnnotationsResult.errors);
  }

  if (!timedHazardProjectileSpawnersResult.ok) {
    errors.push(...timedHazardProjectileSpawnersResult.errors);
  }

  if (!spawnedPowerUpMovementResult.ok) {
    errors.push(...spawnedPowerUpMovementResult.errors);
  }

  const interactiveBlockContentsErrors = validateInteractiveBlockContents(
    definitionsResult.value.tileDefinitions,
    definitionsResult.value.actorRoles,
  );

  if (interactiveBlockContentsErrors.length > 0) {
    errors.push(...interactiveBlockContentsErrors);
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  if (
    !enemyPatrolSpeedResult.ok ||
    !levelTimersResult.ok ||
    !pathAnnotationsResult.ok ||
    !timedHazardProjectileSpawnersResult.ok ||
    !spawnedPowerUpMovementResult.ok
  ) {
    throw new Error("Level metadata result is invalid after validation.");
  }

  return succeed({
    widthTiles: dimensionsResult.value.widthTiles,
    heightTiles: dimensionsResult.value.heightTiles,
    tileSizePixels: dimensionsResult.value.tileSizePixels,
    tileDefinitions: definitionsResult.value.tileDefinitions,
    actorDefinitions: definitionsResult.value.actorDefinitions,
    tiles: tilesResult.value,
    actors: actorsResult.value,
    pipes: extractPipePlacements(
      actorsResult.value,
      definitionsResult.value.actorRoles,
    ),
    enemyPatrolSpeedByEntityId: enemyPatrolSpeedResult.value,
    levelTimers: levelTimersResult.value,
    pathAnnotations: pathAnnotationsResult.value,
    timedHazardProjectileSpawners: timedHazardProjectileSpawnersResult.value,
    spawnedPowerUpMovement: spawnedPowerUpMovementResult.value,
  });
}

function validateSpawnedPowerUpMovement(
  input: LevelSpecInput,
): DomainResult<SpawnedPowerUpMovement | undefined, ValidationError> {
  if (input.spawnedPowerUpMovement === undefined) {
    return succeed(undefined);
  }

  const path = "spawnedPowerUpMovement";
  const velocityX = makeVelocityPixelsPerSecond(
    input.spawnedPowerUpMovement.velocityX,
    `${path}.velocityX`,
  );
  const gravity = makePositiveAccelerationPixelsPerSecondSquared(
    input.spawnedPowerUpMovement.gravity,
    `${path}.gravity`,
  );
  const terminalFallVelocityY = makePositiveVelocityPixelsPerSecond(
    input.spawnedPowerUpMovement.terminalFallVelocityY,
    `${path}.terminalFallVelocityY`,
  );
  const errors: ValidationError[] = [];

  if (!velocityX.ok) {
    errors.push(...velocityX.errors);
  }

  if (!gravity.ok) {
    errors.push(...gravity.errors);
  }

  if (!terminalFallVelocityY.ok) {
    errors.push(...terminalFallVelocityY.errors);
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  if (!velocityX.ok || !gravity.ok || !terminalFallVelocityY.ok) {
    throw new Error("Spawned power-up movement result is invalid.");
  }

  return succeed({
    velocityX: velocityX.value,
    gravity: gravity.value,
    terminalFallVelocityY: terminalFallVelocityY.value,
  });
}

function validateLevelTimers(
  input: LevelSpecInput,
): DomainResult<readonly LevelTimerDefinition[], ValidationError> {
  const timers = input.levelTimers;

  if (timers === undefined) {
    return succeed([]);
  }

  const errors: ValidationError[] = [];
  const timerDefinitions: LevelTimerDefinition[] = [];
  const timerIds = new Set<string>();

  for (const [timerIndex, timerInput] of timers.entries()) {
    const path = `levelTimers[${timerIndex}]`;
    const timerId = makeLevelTimerId(timerInput.timerId, `${path}.timerId`);
    const frames = makeLevelTimerFrameCount(
      timerInput.frames,
      `${path}.frames`,
    );

    if (!timerId.ok) {
      errors.push(...timerId.errors);
    } else if (timerIds.has(timerInput.timerId)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.LevelTimerInvalid,
          `${path}.timerId must be unique within levelTimers.`,
          `${path}.timerId`,
        ),
      );
    } else {
      timerIds.add(timerInput.timerId);
    }

    if (!frames.ok) {
      errors.push(...frames.errors);
    }

    if (timerId.ok && frames.ok) {
      timerDefinitions.push({
        timerId: timerId.value,
        frames: frames.value,
      });
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed(timerDefinitions);
}

function makeLevelTimerId(
  value: string,
  path: string,
): DomainResult<LevelTimerId, ValidationError> {
  if (!metadataIdPattern.test(value)) {
    return fail([
      makeValidationError(
        ValidationErrorCode.LevelTimerInvalid,
        `${path} must start with an alphanumeric character and contain only alphanumeric characters, dot, underscore, colon, or hyphen.`,
        path,
      ),
    ]);
  }

  return succeed(value as LevelTimerId);
}

function validatePathAnnotations(
  input: LevelSpecInput,
): DomainResult<readonly PathAnnotation[], ValidationError> {
  const annotations = input.pathAnnotations;

  if (annotations === undefined) {
    return succeed([]);
  }

  const errors: ValidationError[] = [];
  const validatedAnnotations: PathAnnotation[] = [];
  const pathIds = new Set<string>();

  for (const [annotationIndex, annotationInput] of annotations.entries()) {
    const path = `pathAnnotations[${annotationIndex}]`;
    const pathId = makePathAnnotationId(
      annotationInput.pathId,
      `${path}.pathId`,
    );
    const points = validatePathAnnotationPoints(
      annotationInput.points,
      input,
      path,
    );

    if (!pathId.ok) {
      errors.push(...pathId.errors);
    } else if (pathIds.has(annotationInput.pathId)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.PathAnnotationInvalid,
          `${path}.pathId must be unique within pathAnnotations.`,
          `${path}.pathId`,
        ),
      );
    } else {
      pathIds.add(annotationInput.pathId);
    }

    if (!points.ok) {
      errors.push(...points.errors);
    }

    if (pathId.ok && points.ok) {
      validatedAnnotations.push({
        pathId: pathId.value,
        points: points.value,
      });
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed(validatedAnnotations);
}

function validatePathAnnotationPoints(
  points: readonly PathAnnotationPointInput[],
  levelInput: LevelSpecInput,
  path: string,
): DomainResult<readonly TilePoint[], ValidationError> {
  if (points.length === 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.PathAnnotationInvalid,
        `${path}.points must contain at least one tile coordinate.`,
        `${path}.points`,
      ),
    ]);
  }

  const errors: ValidationError[] = [];
  const validatedPoints: TilePoint[] = [];

  for (const [pointIndex, point] of points.entries()) {
    const pointPath = `${path}.points[${pointIndex}]`;
    const x = makeActorCoordinate(point.x, `${pointPath}.x`);
    const y = makeActorCoordinate(point.y, `${pointPath}.y`);

    if (!x.ok) {
      errors.push(
        ...x.errors.map((error) => ({
          ...error,
          code: ValidationErrorCode.PathAnnotationInvalid,
        })),
      );
    }

    if (!y.ok) {
      errors.push(
        ...y.errors.map((error) => ({
          ...error,
          code: ValidationErrorCode.PathAnnotationInvalid,
        })),
      );
    }

    if (x.ok && y.ok) {
      if (
        point.x >= levelInput.widthTiles ||
        point.y >= levelInput.heightTiles
      ) {
        errors.push(
          makeValidationError(
            ValidationErrorCode.PathAnnotationInvalid,
            `${pointPath} must be inside the level bounds.`,
            pointPath,
          ),
        );
      } else {
        validatedPoints.push({ x: x.value, y: y.value });
      }
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed(validatedPoints);
}

function makePathAnnotationId(
  value: string,
  path: string,
): DomainResult<PathAnnotationId, ValidationError> {
  if (!metadataIdPattern.test(value)) {
    return fail([
      makeValidationError(
        ValidationErrorCode.PathAnnotationInvalid,
        `${path} must start with an alphanumeric character and contain only alphanumeric characters, dot, underscore, colon, or hyphen.`,
        path,
      ),
    ]);
  }

  return succeed(value as PathAnnotationId);
}

function makeLevelTimerFrameCount(
  value: number,
  path: string,
): DomainResult<LevelTimerFrameCount, ValidationError> {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.LevelTimerInvalid,
        `${path} must be a positive safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as LevelTimerFrameCount);
}

function validateTimedHazardProjectileSpawners(
  input: LevelSpecInput,
): DomainResult<readonly TimedHazardProjectileSpawner[], ValidationError> {
  const spawners = input.timedHazardProjectileSpawners;

  if (spawners === undefined) {
    return succeed([]);
  }

  const errors: ValidationError[] = [];
  const validatedSpawners: TimedHazardProjectileSpawner[] = [];
  const spawnerIds = new Set<string>();

  for (const [spawnerIndex, spawnerInput] of spawners.entries()) {
    const path = `timedHazardProjectileSpawners[${spawnerIndex}]`;
    const spawnerId = makeTimedHazardProjectileSpawnerId(
      spawnerInput.spawnerId,
      `${path}.spawnerId`,
    );
    const position = makeTimedHazardProjectileSpawnerPosition(
      spawnerInput,
      input,
      path,
    );
    const direction = makeTimedHazardProjectileDirection(
      spawnerInput.direction,
      `${path}.direction`,
    );
    const intervalFrames = makeTimedHazardProjectilePositiveFrameCount(
      spawnerInput.intervalFrames,
      `${path}.intervalFrames`,
    );
    const initialDelayFrames = makeTimedHazardProjectileNonNegativeFrameCount(
      spawnerInput.initialDelayFrames,
      `${path}.initialDelayFrames`,
    );
    const speed = makeTimedHazardProjectileSpeed(
      spawnerInput.speedPixelsPerSecond,
      `${path}.speedPixelsPerSecond`,
    );
    const width = makeColliderDimensionPixels(
      spawnerInput.widthPixels,
      `${path}.widthPixels`,
    );
    const height = makeColliderDimensionPixels(
      spawnerInput.heightPixels,
      `${path}.heightPixels`,
    );
    const lifetimeFrames = makeTimedHazardProjectilePositiveFrameCount(
      spawnerInput.lifetimeFrames,
      `${path}.lifetimeFrames`,
    );

    if (!spawnerId.ok) {
      errors.push(...spawnerId.errors);
    } else if (spawnerIds.has(spawnerInput.spawnerId)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.TimedHazardProjectileInvalid,
          `${path}.spawnerId must be unique within timedHazardProjectileSpawners.`,
          `${path}.spawnerId`,
        ),
      );
    } else {
      spawnerIds.add(spawnerInput.spawnerId);
    }

    for (const result of [
      position,
      direction,
      intervalFrames,
      initialDelayFrames,
      speed,
      width,
      height,
      lifetimeFrames,
    ]) {
      if (!result.ok) {
        errors.push(...result.errors);
      }
    }

    if (
      spawnerId.ok &&
      position.ok &&
      direction.ok &&
      intervalFrames.ok &&
      initialDelayFrames.ok &&
      speed.ok &&
      width.ok &&
      height.ok &&
      lifetimeFrames.ok
    ) {
      validatedSpawners.push({
        spawnerId: spawnerId.value,
        position: position.value,
        direction: direction.value,
        intervalFrames: intervalFrames.value,
        initialDelayFrames: initialDelayFrames.value,
        speedPixelsPerSecond: speed.value,
        widthPixels: width.value,
        heightPixels: height.value,
        lifetimeFrames: lifetimeFrames.value,
        stompable: spawnerInput.stompable === true,
      });
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed(validatedSpawners);
}

function makeTimedHazardProjectileSpawnerId(
  value: string,
  path: string,
): DomainResult<TimedHazardProjectileSpawnerId, ValidationError> {
  if (!metadataIdPattern.test(value)) {
    return fail([
      makeValidationError(
        ValidationErrorCode.TimedHazardProjectileInvalid,
        `${path} must start with an alphanumeric character and contain only alphanumeric characters, dot, underscore, colon, or hyphen.`,
        path,
      ),
    ]);
  }

  return succeed(value as TimedHazardProjectileSpawnerId);
}

function makeTimedHazardProjectileSpawnerPosition(
  spawnerInput: TimedHazardProjectileSpawnerInput,
  levelInput: LevelSpecInput,
  path: string,
): DomainResult<TilePoint, ValidationError> {
  const x = makeActorCoordinate(spawnerInput.x, `${path}.x`);
  const y = makeActorCoordinate(spawnerInput.y, `${path}.y`);
  const errors: ValidationError[] = [];

  for (const result of [x, y]) {
    if (!result.ok) {
      errors.push(...result.errors);
    }
  }

  if (x.ok && y.ok) {
    if (
      spawnerInput.x >= levelInput.widthTiles ||
      spawnerInput.y >= levelInput.heightTiles
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.TimedHazardProjectileInvalid,
          `${path} must be inside the level bounds.`,
          path,
        ),
      );
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  if (!x.ok || !y.ok) {
    throw new Error("Timed hazard projectile position is invalid.");
  }

  return succeed({
    x: x.value,
    y: y.value,
  });
}

function makeTimedHazardProjectileDirection(
  value: string,
  path: string,
): DomainResult<TimedHazardProjectileDirection, ValidationError> {
  const direction = timedHazardProjectileDirectionByValue.get(value);

  if (direction !== undefined) {
    return succeed(direction);
  }

  return fail([
    makeValidationError(
      ValidationErrorCode.TimedHazardProjectileInvalid,
      `${path} must be left or right.`,
      path,
    ),
  ]);
}

function makeTimedHazardProjectilePositiveFrameCount(
  value: number,
  path: string,
): DomainResult<TimedHazardProjectileFrameCount, ValidationError> {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.TimedHazardProjectileInvalid,
        `${path} must be a positive safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as TimedHazardProjectileFrameCount);
}

function makeContentSpawnLimit(
  value: number,
  path: string,
): DomainResult<number, ValidationError> {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.TileContentSpawnLimitInvalid,
        `${path} must be a positive safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value);
}

function makeContentSpawnCooldownFrames(
  value: number,
  path: string,
): DomainResult<number, ValidationError> {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.TileContentSpawnCooldownInvalid,
        `${path} must be a positive safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value);
}

function makeTimedHazardProjectileNonNegativeFrameCount(
  value: number,
  path: string,
): DomainResult<TimedHazardProjectileFrameCount, ValidationError> {
  if (!Number.isSafeInteger(value) || value < 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.TimedHazardProjectileInvalid,
        `${path} must be a non-negative safe integer.`,
        path,
      ),
    ]);
  }

  return succeed(value as TimedHazardProjectileFrameCount);
}

function makeTimedHazardProjectileSpeed(
  value: number,
  path: string,
): DomainResult<VelocityPixelsPerSecond, ValidationError> {
  if (!Number.isFinite(value) || value <= 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.TimedHazardProjectileInvalid,
        `${path} must be a positive finite number.`,
        path,
      ),
    ]);
  }

  return makeVelocityPixelsPerSecond(value, path);
}

function makePositiveVelocityPixelsPerSecond(
  value: number,
  path: string,
): DomainResult<VelocityPixelsPerSecond, ValidationError> {
  if (!Number.isFinite(value) || value <= 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.VelocityInvalid,
        `${path} must be a positive finite number.`,
        path,
      ),
    ]);
  }

  return makeVelocityPixelsPerSecond(value, path);
}

function makePositiveAccelerationPixelsPerSecondSquared(
  value: number,
  path: string,
): DomainResult<AccelerationPixelsPerSecondSquared, ValidationError> {
  if (!Number.isFinite(value) || value <= 0) {
    return fail([
      makeValidationError(
        ValidationErrorCode.AccelerationInvalid,
        `${path} must be a positive finite number.`,
        path,
      ),
    ]);
  }

  return makeAccelerationPixelsPerSecondSquared(value, path);
}

function validateInteractiveBlockContents(
  tileDefinitions: readonly TileDefinition[],
  actorRoles: ReadonlyMap<string, ActorRole>,
): readonly ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [tileIndex, tileDefinition] of tileDefinitions.entries()) {
    if (
      tileDefinition.contentSpawnLimit !== undefined &&
      tileDefinition.contentsActorId === undefined
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.TileContentSpawnLimitInvalid,
          `tileDefinitions[${tileIndex}].contentSpawnLimit requires contentsActorId.`,
          `tileDefinitions[${tileIndex}].contentSpawnLimit`,
        ),
      );
    }

    if (tileDefinition.contentsActorId === undefined) {
      continue;
    }

    if (
      tileDefinition.collision !== TileCollisionKind.Interactive &&
      tileDefinition.collision !== TileCollisionKind.Hidden
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.TileContentsOnNonInteractiveBlock,
          `tileDefinitions[${tileIndex}].contentsActorId can only be set when collision is interactive or hidden.`,
          `tileDefinitions[${tileIndex}].contentsActorId`,
        ),
      );
      continue;
    }

    const role = actorRoles.get(tileDefinition.contentsActorId);

    if (role === undefined) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.TileContentsActorUnknown,
          `tileDefinitions[${tileIndex}].contentsActorId must reference a known actor definition.`,
          `tileDefinitions[${tileIndex}].contentsActorId`,
        ),
      );
      continue;
    }

    if (
      role !== ActorRole.Coin &&
      role !== ActorRole.Item &&
      role !== ActorRole.PowerUp &&
      role !== ActorRole.ExtraLife &&
      role !== ActorRole.InvincibilityPowerUp &&
      role !== ActorRole.Climbable
    ) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.TileContentsActorNotItemOrPowerUp,
          `tileDefinitions[${tileIndex}].contentsActorId must reference a coin, item, power-up, extra-life, invincibility-power-up, or climbable actor definition.`,
          `tileDefinitions[${tileIndex}].contentsActorId`,
        ),
      );
    }
  }

  return errors;
}

function extractPipePlacements(
  actors: readonly ActorPlacement[],
  actorRoles: ReadonlyMap<string, ActorRole>,
): readonly PipePlacement[] {
  const pipePlacements: PipePlacement[] = [];

  for (const actor of actors) {
    const role = actorRoles.get(actor.actorId);

    if (role !== ActorRole.Pipe || actor.targetTilePosition === undefined) {
      continue;
    }

    pipePlacements.push({
      entityId: actor.entityId,
      actorId: actor.actorId,
      position: actor.position,
      targetLevelName: actor.targetLevelName,
      targetTilePosition: actor.targetTilePosition,
      entryDirection: actor.pipeEntryDirection,
    });
  }

  return pipePlacements;
}

function validateEnemyPatrolSpeedOverrides(
  input: LevelSpecInput,
  actors: readonly ActorPlacement[],
  actorRoles: ReadonlyMap<string, ActorRole>,
): DomainResult<
  ReadonlyMap<EntityId, VelocityPixelsPerSecond>,
  ValidationError
> {
  const overrides = input.enemyPatrolSpeedByEntityId;
  if (overrides === undefined) {
    return succeed(new Map());
  }

  const errors: ValidationError[] = [];
  const enemyEntityIds = new Set<string>();
  for (const actor of actors) {
    const role = actorRoles.get(actor.actorId);
    if (isEnemyRole(role)) {
      enemyEntityIds.add(actor.entityId);
    }
  }

  const resolved = new Map<EntityId, VelocityPixelsPerSecond>();

  for (const [entityIdValue, speedValue] of Object.entries(overrides)) {
    const entityIdResult = makeEntityId(
      entityIdValue,
      `enemyPatrolSpeedByEntityId.${entityIdValue}`,
    );
    if (!entityIdResult.ok) {
      errors.push(...entityIdResult.errors);
      continue;
    }

    if (!enemyEntityIds.has(entityIdValue)) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.EnemyPatrolSpeedEntityNotEnemy,
          `enemyPatrolSpeedByEntityId.${entityIdValue} must reference an enemy actor entity id.`,
          `enemyPatrolSpeedByEntityId.${entityIdValue}`,
        ),
      );
      continue;
    }

    const speedResult = makeVelocityPixelsPerSecond(
      speedValue,
      `enemyPatrolSpeedByEntityId.${entityIdValue}`,
    );
    if (!speedResult.ok) {
      errors.push(...speedResult.errors);
      continue;
    }

    resolved.set(entityIdResult.value, speedResult.value);
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed(resolved);
}
