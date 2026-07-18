import type {
  AccelerationPixelsPerSecondSquared,
  FrameDurationMilliseconds,
  TilePoint,
  VelocityPixelsPerSecond,
} from "../domain/units";
import {
  ActorRole,
  type LevelSpec,
  type SpawnedPowerUpMovement,
} from "../domain/level-spec";
import type { ActorId, EntityId, TileId } from "../domain/identifiers";
import { makeEntityId } from "../domain/identifiers";
import {
  makeAccelerationPixelsPerSecondSquared,
  makeVelocityPixelsPerSecond,
} from "../domain/units";
import type { BreakableBlockState } from "./breakable-block-state";
import {
  makeProjectileFrameCount,
  type ProjectileFrameCount,
} from "./movement-model";
import { assertValidTilePointArray } from "./tile-point-state";
import {
  findHorizontalSolidCrossing,
  HorizontalSolidCrossingDirection,
  makeBreakableTileIds,
  makeSolidTileIds,
  type TileIndexRange,
  tileRowHasSolidInColumns,
} from "./tile-collision-support";

export type InteractiveBlockInteractionState = {
  readonly bumpedBlockTilePositions: readonly TilePoint[];
};

export function makeEmptyInteractiveBlockInteractionState(): InteractiveBlockInteractionState {
  return {
    bumpedBlockTilePositions: [],
  };
}

export function assertValidInteractiveBlockInteractionState(
  state: unknown,
): asserts state is InteractiveBlockInteractionState {
  if (typeof state !== "object" || state === null) {
    throw new Error("Interactive block interaction state must be an object.");
  }

  const candidate = state as Readonly<Record<string, unknown>>;

  assertValidTilePointArray(
    candidate.bumpedBlockTilePositions,
    "Interactive block bumped positions",
    "Interactive block bumped position",
  );
}

function tilePositionKey(position: TilePoint): string {
  return `${position.x},${position.y}`;
}

export function resolveInteractiveBlockInteractionState(
  previousState: InteractiveBlockInteractionState,
  bumpedInteractiveBlocks: readonly TilePoint[],
): InteractiveBlockInteractionState {
  assertValidInteractiveBlockInteractionState(previousState);

  const bumpedSet = new Set(
    previousState.bumpedBlockTilePositions.map(tilePositionKey),
  );
  const bumpedBlockTilePositions = [...previousState.bumpedBlockTilePositions];

  for (const position of bumpedInteractiveBlocks) {
    const key = tilePositionKey(position);

    if (!bumpedSet.has(key)) {
      bumpedSet.add(key);
      bumpedBlockTilePositions.push(position);
    }
  }

  return {
    bumpedBlockTilePositions,
  };
}

export type SpawnedActor = {
  readonly entityId: EntityId;
  readonly actorId: ActorId;
  readonly role:
    | typeof ActorRole.Coin
    | typeof ActorRole.Item
    | typeof ActorRole.PowerUp
    | typeof ActorRole.ExtraLife
    | typeof ActorRole.InvincibilityPowerUp
    | typeof ActorRole.Climbable;
  readonly velocityX: VelocityPixelsPerSecond;
  readonly velocityY: VelocityPixelsPerSecond;
  readonly collectionMode: SpawnedActorCollectionMode;
  readonly remainingPopupFrames: ProjectileFrameCount;
  readonly sourceBlockTilePosition: TilePoint;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  // The actor's collision extent below `position.y`. Every spawned actor
  // starts one tile tall; a climbable vine's top edge then grows upward each
  // frame (position.y falls, heightPixels rises) while its bottom stays
  // anchored to the bumped block, so consumers must read this instead of
  // assuming a one-tile extent.
  readonly heightPixels: number;
  readonly active: boolean;
};

export enum SpawnedActorCollectionMode {
  None = "none",
  PlayerOverlap = "player-overlap",
  OnSpawn = "on-spawn",
}

export type SpawnedActorsState = {
  readonly spawnedActors: readonly SpawnedActor[];
  readonly lastSpawnFrameIndexByBlockKey: Readonly<Record<string, number>>;
};

export function makeEmptySpawnedActorsState(): SpawnedActorsState {
  return {
    spawnedActors: [],
    lastSpawnFrameIndexByBlockKey: {},
  };
}

export function assertValidSpawnedActorsState(
  state: unknown,
): asserts state is SpawnedActorsState {
  if (typeof state !== "object" || state === null) {
    throw new Error("Spawned actors state must be an object.");
  }

  const candidate = state as Readonly<Record<string, unknown>>;

  if (!Array.isArray(candidate.spawnedActors)) {
    throw new Error("Spawned actors must be an array.");
  }

  if (
    typeof candidate.lastSpawnFrameIndexByBlockKey !== "object" ||
    candidate.lastSpawnFrameIndexByBlockKey === null
  ) {
    throw new Error(
      "Spawned actors lastSpawnFrameIndexByBlockKey must be an object.",
    );
  }

  for (const [key, value] of Object.entries(
    candidate.lastSpawnFrameIndexByBlockKey as Readonly<
      Record<string, unknown>
    >,
  )) {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new Error(
        `Spawned actors lastSpawnFrameIndexByBlockKey[${key}] must be a non-negative safe integer.`,
      );
    }
  }

  for (const [index, spawnedActor] of candidate.spawnedActors.entries()) {
    if (typeof spawnedActor !== "object" || spawnedActor === null) {
      throw new Error(`Spawned actor at index ${index} must be an object.`);
    }

    const candidateActor = spawnedActor as Readonly<Record<string, unknown>>;

    if (typeof candidateActor.entityId !== "string") {
      throw new Error(`Spawned actor at index ${index} must have an entityId.`);
    }

    if (typeof candidateActor.actorId !== "string") {
      throw new Error(`Spawned actor at index ${index} must have an actorId.`);
    }

    if (
      candidateActor.role !== ActorRole.Coin &&
      candidateActor.role !== ActorRole.Item &&
      candidateActor.role !== ActorRole.PowerUp &&
      candidateActor.role !== ActorRole.ExtraLife &&
      candidateActor.role !== ActorRole.InvincibilityPowerUp &&
      candidateActor.role !== ActorRole.Climbable
    ) {
      throw new Error(
        `Spawned actor at index ${index} must have role coin, item, power-up, extra-life, invincibility-power-up, or climbable.`,
      );
    }

    if (typeof candidateActor.velocityX !== "number") {
      throw new Error(
        `Spawned actor at index ${index} must have a numeric velocityX.`,
      );
    }

    if (typeof candidateActor.velocityY !== "number") {
      throw new Error(
        `Spawned actor at index ${index} must have a numeric velocityY.`,
      );
    }

    if (
      candidateActor.collectionMode !==
        SpawnedActorCollectionMode.PlayerOverlap &&
      candidateActor.collectionMode !== SpawnedActorCollectionMode.OnSpawn &&
      candidateActor.collectionMode !== SpawnedActorCollectionMode.None
    ) {
      throw new Error(
        `Spawned actor at index ${index} must have a valid collectionMode.`,
      );
    }

    if (
      typeof candidateActor.remainingPopupFrames !== "number" ||
      !Number.isSafeInteger(candidateActor.remainingPopupFrames) ||
      candidateActor.remainingPopupFrames < 0
    ) {
      throw new Error(
        `Spawned actor at index ${index} must have a non-negative safe integer remainingPopupFrames.`,
      );
    }

    if (
      typeof candidateActor.position !== "object" ||
      candidateActor.position === null ||
      typeof (candidateActor.position as Readonly<Record<string, unknown>>)
        .x !== "number" ||
      typeof (candidateActor.position as Readonly<Record<string, unknown>>)
        .y !== "number"
    ) {
      throw new Error(
        `Spawned actor at index ${index} must have a numeric position.`,
      );
    }

    assertValidTilePointArray(
      [candidateActor.sourceBlockTilePosition],
      `Spawned actor at index ${index} source block positions`,
      `Spawned actor at index ${index} source block position`,
    );

    if (typeof candidateActor.active !== "boolean") {
      throw new Error(
        `Spawned actor at index ${index} must have an active boolean.`,
      );
    }

    if (
      typeof candidateActor.heightPixels !== "number" ||
      !Number.isFinite(candidateActor.heightPixels) ||
      candidateActor.heightPixels <= 0
    ) {
      throw new Error(
        `Spawned actor at index ${index} must have a positive numeric heightPixels.`,
      );
    }
  }
}

function requireVelocity(value: number, path: string): VelocityPixelsPerSecond {
  const result = makeVelocityPixelsPerSecond(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid velocity.`);
  }

  return result.value;
}

function requireAcceleration(
  value: number,
  path: string,
): AccelerationPixelsPerSecondSquared {
  const result = makeAccelerationPixelsPerSecondSquared(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid acceleration.`);
  }

  return result.value;
}

const spawnedItemVelocityX = requireVelocity(0, "spawnedActor.item.velocityX");
const spawnedCoinVelocityX = requireVelocity(0, "spawnedActor.coin.velocityX");
// The invincibility star bounces away from the bumped block: the original
// gives every power-up a horizontal speed once it has emerged, and runs the
// star through the jumping-enemy movement instead of the walking one.
const spawnedInvincibilityVelocityX = requireVelocity(
  60,
  "spawnedActor.invincibility.velocityX",
);
// Whenever the star lands it relaunches upward, giving the original's
// repeating bounce.
const spawnedInvincibilityBounceVelocityY = requireVelocity(
  -240,
  "spawnedActor.invincibility.bounceVelocityY",
);
const spawnedClimbableVelocityX = requireVelocity(
  0,
  "spawnedActor.climbable.velocityX",
);
// The vine grows at the original's pace: its handler raises the vine top one
// pixel on two frames out of every four, i.e. half a pixel per 60 Hz frame.
const spawnedClimbableGrowthSpeedPixelsPerSecond = 30;
// A fully grown vine's top edge sits about eight tiles above the bumped
// block's top...
const spawnedClimbableGrownTilesAboveBlockTop = 8;
// ...but never inside the HUD band: growth clamps at the level's tile row 2.
const spawnedClimbableGrowthCeilingTileRow = 2;
const spawnedActorStillVelocityY = requireVelocity(
  0,
  "spawnedActor.still.velocityY",
);
// A block-dispensed coin traces the original's full arc: it rises for the
// first half of its popup lifetime, then falls back down to the block top
// before it vanishes (about 48 pixels up and the same back down).
const spawnedCoinPopupVelocityY = requireVelocity(
  -240,
  "spawnedActor.coinPopup.velocityY",
);
const spawnedPowerUpVelocityX = requireVelocity(
  40,
  "spawnedActor.powerUp.velocityX",
);
const spawnedPowerUpGravity = requireAcceleration(
  900,
  "spawnedActor.powerUp.gravity",
);
const spawnedPowerUpTerminalFallVelocityY = requireVelocity(
  240,
  "spawnedActor.powerUp.terminalFallVelocityY",
);
const spawnedCoinPopupFrameCount = requirePopupFrameCount(
  24,
  "spawnedActor.coinPopup.frameCount",
);
// The coin descends once its remaining popup frames reach the halfway point
// of the lifetime above, mirroring the rise exactly.
const spawnedCoinPopupDescentStartFrames = requirePopupFrameCount(
  12,
  "spawnedActor.coinPopup.descentStartFrames",
);
// Block items (mushroom, 1-up, star) rise one tile out of the block over this
// many frames before they start moving — the original's emerge, so they don't
// appear to pop into existence.
const spawnedItemEmergeFrameCount = requirePopupFrameCount(
  16,
  "spawnedActor.itemEmerge.frameCount",
);
const spawnedItemEmergeVelocityY = requireVelocity(
  -60,
  "spawnedActor.itemEmerge.velocityY",
);
const authoredSpawnedPowerUpMovement: SpawnedPowerUpMovement = {
  velocityX: spawnedPowerUpVelocityX,
  gravity: spawnedPowerUpGravity,
  terminalFallVelocityY: spawnedPowerUpTerminalFallVelocityY,
};

function requirePopupFrameCount(
  value: number,
  path: string,
): ProjectileFrameCount {
  const result = makeProjectileFrameCount(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid popup frame count.`);
  }

  return result.value;
}

function makeSpawnedActorEntityId(
  position: TilePoint,
  spawnSequence: number,
): EntityId {
  const suffix = spawnSequence === 1 ? "" : `-${spawnSequence}`;
  const result = makeEntityId(
    `spawned-${position.x}-${position.y}${suffix}`,
    "spawnedActor.entityId",
  );

  if (!result.ok) {
    throw new Error("Spawned actor entity id must be valid.");
  }

  return result.value;
}

function makeTileContentsLookup(levelSpec: LevelSpec): ReadonlyMap<
  string,
  {
    readonly actorId: ActorId | undefined;
    readonly spawnLimit: number;
    readonly spawnCooldownFrames: number | undefined;
  }
> {
  const lookup = new Map<
    string,
    {
      readonly actorId: ActorId | undefined;
      readonly spawnLimit: number;
      readonly spawnCooldownFrames: number | undefined;
    }
  >();

  for (const tileDefinition of levelSpec.tileDefinitions) {
    lookup.set(tileDefinition.tileId, {
      actorId: tileDefinition.contentsActorId,
      spawnLimit: tileDefinition.contentSpawnLimit ?? 1,
      spawnCooldownFrames: tileDefinition.contentSpawnCooldownFrames,
    });
  }

  return lookup;
}

function countSpawnedActorsForBlock(
  spawnedActors: readonly SpawnedActor[],
  position: TilePoint,
): number {
  return spawnedActors.filter(
    (spawnedActor) =>
      spawnedActor.sourceBlockTilePosition.x === position.x &&
      spawnedActor.sourceBlockTilePosition.y === position.y,
  ).length;
}

// The spawned actor id for a power-up block bumped by an already-super
// player: the ROM swaps the mushroom for a stationary fire flower.
export const fireFlowerActorId = "vglc-smb-fire-flower";

export function resolveSpawnedActorsState(
  previousState: SpawnedActorsState,
  levelSpec: LevelSpec,
  bumpedInteractiveBlocks: readonly TilePoint[],
  currentFrameIndex: number = 0,
  playerIsSuper = false,
): SpawnedActorsState {
  assertValidSpawnedActorsState(previousState);

  const contentsLookup = makeTileContentsLookup(levelSpec);
  const spawnedActors = [...previousState.spawnedActors];
  const spawnedSet = new Set(
    spawnedActors.map((spawnedActor) => spawnedActor.entityId),
  );
  const lastSpawnFrameIndexByBlockKey = {
    ...previousState.lastSpawnFrameIndexByBlockKey,
  };

  for (const position of bumpedInteractiveBlocks) {
    const blockKey = tilePositionKey(position);
    const spawnSequence =
      countSpawnedActorsForBlock(spawnedActors, position) + 1;

    const tileId = levelSpec.tiles[position.y]?.[position.x];

    if (tileId === undefined) {
      continue;
    }

    const contents = contentsLookup.get(tileId);

    if (contents === undefined || contents.actorId === undefined) {
      continue;
    }

    if (spawnSequence > contents.spawnLimit) {
      continue;
    }

    if (contents.spawnCooldownFrames !== undefined) {
      const lastSpawnFrame = lastSpawnFrameIndexByBlockKey[blockKey];

      if (
        lastSpawnFrame !== undefined &&
        currentFrameIndex - lastSpawnFrame < contents.spawnCooldownFrames
      ) {
        continue;
      }
    }

    const entityId = makeSpawnedActorEntityId(position, spawnSequence);

    if (spawnedSet.has(entityId)) {
      continue;
    }

    const role = inferSpawnedActorRole(levelSpec, contents.actorId);

    // Emerging items (mushroom, 1-up, star) start inside the block and rise a
    // tile; everything else spawns directly on top.
    const emerges = spawnedActorEmerges(role);
    // A super player's power-up block yields the stationary fire flower
    // instead of the walking mushroom (the ROM's size-dependent contents).
    const spawnsFireFlower = role === ActorRole.PowerUp && playerIsSuper;

    spawnedActors.push({
      entityId,
      actorId: spawnsFireFlower
        ? (fireFlowerActorId as typeof contents.actorId)
        : contents.actorId,
      role,
      velocityX: spawnsFireFlower
        ? requireVelocity(0, "spawnedActor.velocityX")
        : makeSpawnedActorVelocityX(role, levelSpec),
      velocityY: makeSpawnedActorVelocityY(role),
      collectionMode: makeSpawnedActorCollectionMode(role),
      remainingPopupFrames: makeSpawnedActorPopupFrameCount(role),
      sourceBlockTilePosition: position,
      position: {
        x: position.x * levelSpec.tileSizePixels,
        y: (position.y - (emerges ? 0 : 1)) * levelSpec.tileSizePixels,
      },
      heightPixels: levelSpec.tileSizePixels,
      active: true,
    });
    spawnedSet.add(entityId);
    lastSpawnFrameIndexByBlockKey[blockKey] = currentFrameIndex;
  }

  return {
    spawnedActors,
    lastSpawnFrameIndexByBlockKey,
  };
}

export function stepSpawnedActorsState(
  previousState: SpawnedActorsState,
  frameDurationMilliseconds: FrameDurationMilliseconds,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
): SpawnedActorsState {
  assertValidSpawnedActorsState(previousState);

  const frameDurationSeconds = frameDurationMilliseconds / 1000;
  const solidTileIds = makeSolidTileIds(levelSpec);
  const breakableTileIds = makeBreakableTileIds(levelSpec);
  const spawnedPowerUpMovement =
    resolveSpawnedPowerUpMovementForLevel(levelSpec);

  return {
    spawnedActors: previousState.spawnedActors.map((spawnedActor) => {
      if (!spawnedActor.active) {
        return spawnedActor;
      }

      if (spawnedActorEmerges(spawnedActor.role)) {
        return stepSpawnedPowerUpActor(
          spawnedActor,
          frameDurationSeconds,
          levelSpec,
          breakableBlocks,
          solidTileIds,
          breakableTileIds,
          spawnedPowerUpMovement,
        );
      }

      if (spawnedActor.role === ActorRole.Climbable) {
        return stepSpawnedClimbableActor(
          spawnedActor,
          frameDurationSeconds,
          levelSpec,
        );
      }

      const popupMovesThisFrame = spawnedActor.remainingPopupFrames > 0;
      // The popup coin's full arc: it rises through the first half of its
      // lifetime and retraces the same path down through the second half.
      const popupVelocityY =
        spawnedActor.remainingPopupFrames > spawnedCoinPopupDescentStartFrames
          ? spawnedActor.velocityY
          : Math.abs(spawnedActor.velocityY);
      const remainingPopupFrames = decrementPopupFrameCount(
        spawnedActor.remainingPopupFrames,
      );
      const active = !(
        spawnedActor.collectionMode === SpawnedActorCollectionMode.OnSpawn &&
        remainingPopupFrames === 0
      );

      return {
        ...spawnedActor,
        remainingPopupFrames,
        active,
        position: {
          x:
            spawnedActor.position.x +
            spawnedActor.velocityX * frameDurationSeconds,
          y:
            spawnedActor.position.y +
            (popupMovesThisFrame ? popupVelocityY * frameDurationSeconds : 0),
        },
      };
    }),
    lastSpawnFrameIndexByBlockKey: previousState.lastSpawnFrameIndexByBlockKey,
  };
}

function stepSpawnedPowerUpActor(
  spawnedActor: SpawnedActor,
  frameDurationSeconds: number,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
  solidTileIds: ReadonlySet<TileId>,
  breakableTileIds: ReadonlySet<TileId>,
  spawnedPowerUpMovement: SpawnedPowerUpMovement,
): SpawnedActor {
  // Emerge phase: rise straight out of the block, no horizontal motion,
  // gravity, or collision until the item has cleared the block.
  if (spawnedActor.remainingPopupFrames > 0) {
    return {
      ...spawnedActor,
      remainingPopupFrames: decrementPopupFrameCount(
        spawnedActor.remainingPopupFrames,
      ),
      position: {
        x: spawnedActor.position.x,
        y:
          spawnedActor.position.y +
          spawnedItemEmergeVelocityY * frameDurationSeconds,
      },
    };
  }

  const nextVelocityY = makeNextSpawnedPowerUpVelocityY(
    spawnedActor.velocityY,
    frameDurationSeconds,
    spawnedPowerUpMovement,
  );
  const movedActor: SpawnedActor = {
    ...spawnedActor,
    velocityY: nextVelocityY,
    position: {
      x:
        spawnedActor.position.x + spawnedActor.velocityX * frameDurationSeconds,
      y: spawnedActor.position.y + nextVelocityY * frameDurationSeconds,
    },
  };
  const horizontallyResolvedActor = resolveSpawnedActorHorizontalCollision(
    spawnedActor,
    movedActor,
    levelSpec,
    breakableBlocks,
    solidTileIds,
    breakableTileIds,
  );

  return resolveSpawnedActorDownwardCollision(
    spawnedActor,
    horizontallyResolvedActor,
    levelSpec,
    breakableBlocks,
    solidTileIds,
    breakableTileIds,
  );
}

// The pixel y coordinate a fully grown climbable's top edge stops at: about
// eight tiles above the bumped block's top, clamped so it never grows past
// the level's row 2 into the HUD band.
function makeSpawnedClimbableGrownTopPixelY(
  sourceBlockTilePosition: TilePoint,
  levelSpec: LevelSpec,
): number {
  return Math.max(
    (sourceBlockTilePosition.y - spawnedClimbableGrownTilesAboveBlockTop) *
      levelSpec.tileSizePixels,
    spawnedClimbableGrowthCeilingTileRow * levelSpec.tileSizePixels,
  );
}

// The vine's bottom stays anchored to the bumped block's top while its top
// edge extends upward at the original's growth pace until fully grown.
function stepSpawnedClimbableActor(
  spawnedActor: SpawnedActor,
  frameDurationSeconds: number,
  levelSpec: LevelSpec,
): SpawnedActor {
  const grownTopPixelY = makeSpawnedClimbableGrownTopPixelY(
    spawnedActor.sourceBlockTilePosition,
    levelSpec,
  );

  if (spawnedActor.position.y <= grownTopPixelY) {
    return spawnedActor;
  }

  const bottomPixelY = spawnedActor.position.y + spawnedActor.heightPixels;
  const nextTopPixelY = Math.max(
    spawnedActor.position.y -
      spawnedClimbableGrowthSpeedPixelsPerSecond * frameDurationSeconds,
    grownTopPixelY,
  );

  return {
    ...spawnedActor,
    heightPixels: bottomPixelY - nextTopPixelY,
    position: {
      x: spawnedActor.position.x,
      y: nextTopPixelY,
    },
  };
}

function makeNextSpawnedPowerUpVelocityY(
  velocityY: VelocityPixelsPerSecond,
  frameDurationSeconds: number,
  spawnedPowerUpMovement: SpawnedPowerUpMovement,
): VelocityPixelsPerSecond {
  return Math.min(
    velocityY + spawnedPowerUpMovement.gravity * frameDurationSeconds,
    spawnedPowerUpMovement.terminalFallVelocityY,
  ) as VelocityPixelsPerSecond;
}

function resolveSpawnedPowerUpMovementForLevel(
  levelSpec: LevelSpec,
): SpawnedPowerUpMovement {
  return levelSpec.spawnedPowerUpMovement ?? authoredSpawnedPowerUpMovement;
}

function resolveSpawnedActorHorizontalCollision(
  previousActor: SpawnedActor,
  movedActor: SpawnedActor,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
  solidTileIds: ReadonlySet<TileId>,
  breakableTileIds: ReadonlySet<TileId>,
): SpawnedActor {
  if (movedActor.velocityX === 0) {
    return movedActor;
  }

  const tileSizePixels = levelSpec.tileSizePixels;
  const previousLeft = previousActor.position.x;
  const previousRight = previousActor.position.x + tileSizePixels;
  const movedLeft = movedActor.position.x;
  const movedRight = movedActor.position.x + tileSizePixels;
  const rowRange = makeSpawnedActorRowRange(
    previousActor,
    movedActor,
    levelSpec,
  );

  if (movedActor.velocityX > 0) {
    const crossing = findHorizontalSolidCrossing({
      levelSpec,
      solidTileIds,
      breakableTileIds,
      breakableBlocks,
      rowRange,
      previousLeadingEdge: previousRight,
      movedLeadingEdge: movedRight,
      direction: HorizontalSolidCrossingDirection.Right,
    });

    if (crossing !== undefined) {
      return {
        ...movedActor,
        velocityX: -Math.abs(movedActor.velocityX) as VelocityPixelsPerSecond,
        position: {
          x: crossing.tileBoundary - tileSizePixels,
          y: movedActor.position.y,
        },
      };
    }
  }

  if (movedActor.velocityX < 0) {
    const crossing = findHorizontalSolidCrossing({
      levelSpec,
      solidTileIds,
      breakableTileIds,
      breakableBlocks,
      rowRange,
      previousLeadingEdge: previousLeft,
      movedLeadingEdge: movedLeft,
      direction: HorizontalSolidCrossingDirection.Left,
    });

    if (crossing !== undefined) {
      return {
        ...movedActor,
        velocityX: Math.abs(movedActor.velocityX) as VelocityPixelsPerSecond,
        position: {
          x: crossing.tileBoundary,
          y: movedActor.position.y,
        },
      };
    }
  }

  return movedActor;
}

function resolveSpawnedActorDownwardCollision(
  previousActor: SpawnedActor,
  movedActor: SpawnedActor,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
  solidTileIds: ReadonlySet<TileId>,
  breakableTileIds: ReadonlySet<TileId>,
): SpawnedActor {
  if (movedActor.velocityY <= 0) {
    return movedActor;
  }

  const tileSizePixels = levelSpec.tileSizePixels;
  const previousBottom = previousActor.position.y + tileSizePixels;
  const movedBottom = movedActor.position.y + tileSizePixels;
  const crossedStartRow = Math.floor(previousBottom / tileSizePixels);
  const crossedEndRow = Math.floor(movedBottom / tileSizePixels);
  const columnRange = makeSpawnedActorColumnRange(movedActor, levelSpec);

  for (
    let rowIndex = crossedStartRow;
    rowIndex <= crossedEndRow;
    rowIndex += 1
  ) {
    const tileTop = rowIndex * tileSizePixels;

    if (
      previousBottom <= tileTop &&
      movedBottom >= tileTop &&
      tileRowHasSolidInColumns(
        levelSpec,
        solidTileIds,
        breakableTileIds,
        breakableBlocks,
        rowIndex,
        columnRange,
      )
    ) {
      return {
        ...movedActor,
        // Landing stops walking items dead, but the invincibility star
        // relaunches upward for the original's repeating bounce.
        velocityY:
          movedActor.role === ActorRole.InvincibilityPowerUp
            ? spawnedInvincibilityBounceVelocityY
            : spawnedActorStillVelocityY,
        position: {
          x: movedActor.position.x,
          y: tileTop - tileSizePixels,
        },
      };
    }
  }

  return movedActor;
}

function makeSpawnedActorRowRange(
  previousActor: SpawnedActor,
  movedActor: SpawnedActor,
  levelSpec: LevelSpec,
): TileIndexRange {
  const previousRange = makeSpawnedActorSingleRowRange(
    previousActor,
    levelSpec,
  );
  const movedRange = makeSpawnedActorSingleRowRange(movedActor, levelSpec);

  return {
    start: Math.min(previousRange.start, movedRange.start),
    end: Math.max(previousRange.end, movedRange.end),
  };
}

function makeSpawnedActorSingleRowRange(
  actor: SpawnedActor,
  levelSpec: LevelSpec,
): TileIndexRange {
  const tileSizePixels = levelSpec.tileSizePixels;

  return {
    start: Math.floor(actor.position.y / tileSizePixels),
    end: Math.floor((actor.position.y + tileSizePixels - 1) / tileSizePixels),
  };
}

function makeSpawnedActorColumnRange(
  actor: SpawnedActor,
  levelSpec: LevelSpec,
): TileIndexRange {
  const tileSizePixels = levelSpec.tileSizePixels;

  return {
    start: Math.floor(actor.position.x / tileSizePixels),
    end: Math.floor((actor.position.x + tileSizePixels - 1) / tileSizePixels),
  };
}

function decrementPopupFrameCount(
  frameCount: ProjectileFrameCount,
): ProjectileFrameCount {
  if (frameCount <= 0) {
    return 0 as ProjectileFrameCount;
  }

  return (frameCount - 1) as ProjectileFrameCount;
}

function inferSpawnedActorRole(
  levelSpec: LevelSpec,
  actorId: ActorId,
): SpawnedActor["role"] {
  const definition = levelSpec.actorDefinitions.find(
    (candidate) => candidate.actorId === actorId,
  );

  if (definition === undefined) {
    throw new Error(
      "Spawned actor id must reference a known actor definition.",
    );
  }

  if (
    definition.role !== ActorRole.Coin &&
    definition.role !== ActorRole.Item &&
    definition.role !== ActorRole.PowerUp &&
    definition.role !== ActorRole.ExtraLife &&
    definition.role !== ActorRole.InvincibilityPowerUp &&
    definition.role !== ActorRole.Climbable
  ) {
    throw new Error(
      "Spawned actor role must be coin, item, power-up, extra-life, invincibility-power-up, or climbable.",
    );
  }

  return definition.role;
}

function makeSpawnedActorVelocityX(
  role: SpawnedActor["role"],
  levelSpec: LevelSpec,
): VelocityPixelsPerSecond {
  switch (role) {
    case ActorRole.Coin:
      return spawnedCoinVelocityX;
    case ActorRole.Item:
      return spawnedItemVelocityX;
    case ActorRole.PowerUp:
    // The 1-up mushroom walks exactly like the super mushroom in the
    // original; both run the same walking movement with the same speed.
    case ActorRole.ExtraLife:
      return resolveSpawnedPowerUpMovementForLevel(levelSpec).velocityX;
    case ActorRole.InvincibilityPowerUp:
      return spawnedInvincibilityVelocityX;
    case ActorRole.Climbable:
      return spawnedClimbableVelocityX;
    default: {
      const invalidRole: never = role;
      throw new Error(`Invalid spawned actor role: ${String(invalidRole)}`);
    }
  }
}

function makeSpawnedActorVelocityY(
  role: SpawnedActor["role"],
): VelocityPixelsPerSecond {
  switch (role) {
    case ActorRole.Coin:
      return spawnedCoinPopupVelocityY;
    case ActorRole.Item:
    case ActorRole.ExtraLife:
    case ActorRole.InvincibilityPowerUp:
    case ActorRole.Climbable:
    case ActorRole.PowerUp:
      return spawnedActorStillVelocityY;
    default: {
      const invalidRole: never = role;
      throw new Error(`Invalid spawned actor role: ${String(invalidRole)}`);
    }
  }
}

function makeSpawnedActorCollectionMode(
  role: SpawnedActor["role"],
): SpawnedActorCollectionMode {
  switch (role) {
    case ActorRole.Coin:
      return SpawnedActorCollectionMode.OnSpawn;
    case ActorRole.Item:
    case ActorRole.ExtraLife:
    case ActorRole.InvincibilityPowerUp:
    case ActorRole.PowerUp:
      return SpawnedActorCollectionMode.PlayerOverlap;
    case ActorRole.Climbable:
      return SpawnedActorCollectionMode.None;
    default: {
      const invalidRole: never = role;
      throw new Error(`Invalid spawned actor role: ${String(invalidRole)}`);
    }
  }
}

function spawnedActorEmerges(role: SpawnedActor["role"]): boolean {
  return (
    role === ActorRole.PowerUp ||
    role === ActorRole.ExtraLife ||
    role === ActorRole.InvincibilityPowerUp
  );
}

function makeSpawnedActorPopupFrameCount(
  role: SpawnedActor["role"],
): ProjectileFrameCount {
  switch (role) {
    case ActorRole.Coin:
      return spawnedCoinPopupFrameCount;
    case ActorRole.PowerUp:
    case ActorRole.ExtraLife:
    case ActorRole.InvincibilityPowerUp:
      return spawnedItemEmergeFrameCount;
    case ActorRole.Item:
    case ActorRole.Climbable:
      return 0 as ProjectileFrameCount;
    default: {
      const invalidRole: never = role;
      throw new Error(`Invalid spawned actor role: ${String(invalidRole)}`);
    }
  }
}
