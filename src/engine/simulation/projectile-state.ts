import type { Brand } from "../domain/brand";
import type { EntityId } from "../domain/identifiers";
import { TileCollisionKind } from "../domain/level-spec";
import type { LevelSpec } from "../domain/level-spec";
import type { BreakableBlockState } from "./breakable-block-state";
import {
  assertValidBreakableBlockState,
  isBreakableBlockBroken,
} from "./breakable-block-state";
import {
  makePixelDelta,
  type FrameIndex,
  type PixelDelta,
  type PixelPosition,
  type TileCoordinate,
  type VelocityPixelsPerSecond,
} from "../domain/units";
import type { EnemyMotionState } from "./enemy-motion";
import { requireEnemyActorState } from "./enemy-motion";
import { makeActorColliderSizePixels } from "./actor-interaction";
import type { MovementConstants, ProjectileFrameCount } from "./movement-model";
import { makeProjectileFrameCount } from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import {
  PlayerVitalityKind,
  type PlayerVitalityState,
} from "./player-vitality";
import {
  requireSimulationPixelPosition,
  requireSimulationVelocity,
} from "./simulation-units";

type ProjectileId = Brand<string, "ProjectileId">;

export type Projectile = {
  readonly id: ProjectileId;
  readonly position: {
    readonly x: PixelPosition;
    readonly y: PixelPosition;
  };
  readonly velocity: {
    readonly x: VelocityPixelsPerSecond;
    readonly y: VelocityPixelsPerSecond;
  };
  readonly width: number;
  readonly height: number;
  readonly active: boolean;
  readonly remainingLifetimeFrames: ProjectileFrameCount;
  // Bullet Bills can be stomped; other projectiles (fireballs, thrown hammers)
  // leave this undefined and are never stompable.
  readonly stompable?: boolean;
  // Lakitu's eggs hatch into walking Spinies when they land on solid ground.
  readonly hatchesOnLanding?: boolean;
  // The hazardous collision box can be inset from the rendered sprite (the ROM
  // Bowser flame is a wide sprite with a tiny hitbox). Absent means no inset.
  readonly hazardInsetXPixels?: number;
  readonly hazardInsetYPixels?: number;
};

// The rectangle a projectile actually collides with — its render box shrunk by
// the (optional) symmetric hazard inset and re-centred. For most projectiles
// this is just the render box.
export function projectileHazardBox(projectile: Projectile): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  const insetX = projectile.hazardInsetXPixels ?? 0;
  const insetY = projectile.hazardInsetYPixels ?? 0;
  return {
    x: projectile.position.x + insetX,
    y: projectile.position.y + insetY,
    width: projectile.width - insetX * 2,
    height: projectile.height - insetY * 2,
  };
}

export type ProjectilesState = {
  readonly projectiles: readonly Projectile[];
  readonly cooldownRemainingFrames: ProjectileFrameCount;
  // Landed fireball hits per multi-hit enemy (Bowser); absent means zero.
  readonly fireballHitsByEntityId: Readonly<Record<string, number>>;
};

export type ResolvedProjectilesState = {
  readonly state: ProjectilesState;
  readonly newlyDefeatedEnemyEntityIds: readonly EntityId[];
  readonly firedProjectile: boolean;
};

export function makeEmptyProjectilesState(): ProjectilesState {
  return {
    projectiles: [],
    cooldownRemainingFrames: 0 as ProjectileFrameCount,
    fireballHitsByEntityId: {},
  };
}

export function assertValidProjectilesState(
  projectilesState: unknown,
): asserts projectilesState is ProjectilesState {
  if (typeof projectilesState !== "object" || projectilesState === null) {
    throw new Error("Projectiles state must be an object.");
  }

  const candidate = projectilesState as Readonly<Record<string, unknown>>;

  if (!Array.isArray(candidate.projectiles)) {
    throw new Error("projectilesState.projectiles must be an array.");
  }

  if (typeof candidate.cooldownRemainingFrames !== "number") {
    throw new Error(
      "projectilesState.cooldownRemainingFrames must be a number.",
    );
  }

  if (
    typeof candidate.fireballHitsByEntityId !== "object" ||
    candidate.fireballHitsByEntityId === null
  ) {
    throw new Error(
      "projectilesState.fireballHitsByEntityId must be an object.",
    );
  }

  for (const projectile of candidate.projectiles) {
    assertValidProjectile(projectile);
  }
}

function assertValidProjectile(projectile: unknown): void {
  if (typeof projectile !== "object" || projectile === null) {
    throw new Error("Projectile must be an object.");
  }

  const candidate = projectile as Readonly<Record<string, unknown>>;

  if (typeof candidate.id !== "string") {
    throw new Error("projectile.id must be a string.");
  }

  if (
    typeof candidate.position !== "object" ||
    candidate.position === null ||
    typeof (candidate.position as Record<string, unknown>).x !== "number" ||
    typeof (candidate.position as Record<string, unknown>).y !== "number"
  ) {
    throw new Error("projectile.position must have numeric x and y.");
  }

  if (
    typeof candidate.velocity !== "object" ||
    candidate.velocity === null ||
    typeof (candidate.velocity as Record<string, unknown>).x !== "number" ||
    typeof (candidate.velocity as Record<string, unknown>).y !== "number"
  ) {
    throw new Error("projectile.velocity must have numeric x and y.");
  }

  if (
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number" ||
    typeof candidate.active !== "boolean" ||
    typeof candidate.remainingLifetimeFrames !== "number"
  ) {
    throw new Error(
      "projectile must have numeric width/height/remainingLifetimeFrames and boolean active.",
    );
  }
}

export function requireProjectileFrameCount(
  value: number,
  path: string,
): ProjectileFrameCount {
  const result = makeProjectileFrameCount(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid projectile frame count.`);
  }

  return result.value;
}

export function resolveProjectilesState(
  inputCommand: { readonly firePressed: boolean },
  player: PlayerSimulationState,
  playerVitality: PlayerVitalityState,
  enemyMotion: EnemyMotionState,
  enemies: { readonly defeatedEnemyEntityIds: readonly EntityId[] },
  previousState: ProjectilesState,
  breakableBlocks: BreakableBlockState,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
  frameDurationMilliseconds: number,
  frameIndex: FrameIndex,
): ResolvedProjectilesState {
  assertValidProjectilesState(previousState);
  assertValidBreakableBlockState(breakableBlocks);

  const frameDurationSeconds = frameDurationMilliseconds / 1000;
  const existingProjectiles = stepExistingProjectiles(
    previousState.projectiles,
    frameDurationSeconds,
    levelSpec,
    breakableBlocks,
    movementConstants.projectileGravity,
    movementConstants.projectileBounceSpeed,
  );
  const defeatedEnemyEntityIdSet = new Set(enemies.defeatedEnemyEntityIds);
  const {
    projectiles: projectilesAfterCollisions,
    newlyDefeatedEnemyEntityIds,
    fireballHitsByEntityId,
  } = resolveProjectileEnemyCollisions(
    existingProjectiles,
    enemyMotion,
    levelSpec,
    defeatedEnemyEntityIdSet,
    previousState.fireballHitsByEntityId,
  );
  const cooldownRemainingFrames = decrementCooldown(
    previousState.cooldownRemainingFrames,
  );

  if (
    !inputCommand.firePressed ||
    playerVitality.kind !== PlayerVitalityKind.Fire ||
    cooldownRemainingFrames > 0
  ) {
    return {
      state: {
        projectiles: projectilesAfterCollisions,
        cooldownRemainingFrames,
        fireballHitsByEntityId,
      },
      newlyDefeatedEnemyEntityIds,
      firedProjectile: false,
    };
  }

  const direction = projectileDirectionFromPlayer(player);
  const projectileSpeed = movementConstants.projectileSpeed;
  const velocityX =
    direction === ProjectileDirection.Right
      ? projectileSpeed
      : requireSimulationVelocity(0 - projectileSpeed, "projectile.velocity.x");
  const spawnPosition = makeProjectileSpawnPosition(player);
  const newProjectile: Projectile = {
    id: makeProjectileId(frameIndex, projectilesAfterCollisions.length),
    position: spawnPosition,
    velocity: {
      x: velocityX,
      y: 0 as VelocityPixelsPerSecond,
    },
    width: movementConstants.projectileColliderWidth,
    height: movementConstants.projectileColliderHeight,
    active: true,
    remainingLifetimeFrames: movementConstants.projectileLifetimeFrameCount,
  };

  return {
    state: {
      projectiles: [...projectilesAfterCollisions, newProjectile],
      cooldownRemainingFrames: movementConstants.projectileCooldownFrameCount,
      fireballHitsByEntityId,
    },
    newlyDefeatedEnemyEntityIds,
    firedProjectile: true,
  };
}

function decrementCooldown(
  cooldownRemainingFrames: ProjectileFrameCount,
): ProjectileFrameCount {
  if (cooldownRemainingFrames <= 0) {
    return 0 as ProjectileFrameCount;
  }

  return (cooldownRemainingFrames - 1) as ProjectileFrameCount;
}

function makeProjectileId(
  frameIndex: FrameIndex,
  spawnIndex: number,
): ProjectileId {
  return `projectile-${frameIndex as number}-${spawnIndex}` as ProjectileId;
}

function makeProjectileSpawnPosition(player: PlayerSimulationState): {
  x: PixelPosition;
  y: PixelPosition;
} {
  const x = requireSimulationPixelPosition(
    player.position.x + player.collider.width / 2,
    "projectile.position.x",
  );
  const y = requireSimulationPixelPosition(
    player.position.y + player.collider.height / 2,
    "projectile.position.y",
  );

  return { x, y };
}

function requirePixelDelta(value: number, path: string): PixelDelta {
  const result = makePixelDelta(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid pixel delta.`);
  }

  return result.value;
}

enum ProjectileDirection {
  Left = "left",
  Right = "right",
}

function projectileDirectionFromPlayer(
  player: PlayerSimulationState,
): ProjectileDirection {
  if (player.velocity.x > 0) {
    return ProjectileDirection.Right;
  }

  if (player.velocity.x < 0) {
    return ProjectileDirection.Left;
  }

  return ProjectileDirection.Right;
}

export function stepExistingProjectiles(
  projectiles: readonly Projectile[],
  frameDurationSeconds: number,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
  // Fireballs arc + bounce; straight hazards (cannonballs) pass 0 for both.
  projectileGravity: number,
  projectileBounceSpeed: number,
): readonly Projectile[] {
  const steppedProjectiles: Projectile[] = [];

  for (const projectile of projectiles) {
    if (!projectile.active) {
      continue;
    }

    const remainingLifetimeFrames = requireProjectileFrameCount(
      projectile.remainingLifetimeFrames - 1,
      "projectile.remainingLifetimeFrames",
    );

    if (remainingLifetimeFrames <= 0) {
      continue;
    }

    // Gravity pulls the fireball down so it travels in an arc (0 underwater,
    // where it flies straight and buoyant).
    const velocityYAfterGravity =
      projectile.velocity.y + projectileGravity * frameDurationSeconds;

    // Horizontal move first — running into a wall kills the fireball.
    const nextX = requireSimulationPixelPosition(
      projectile.position.x +
        requirePixelDelta(
          projectile.velocity.x * frameDurationSeconds,
          "projectile.position.x",
        ),
      "projectile.position.x",
    );
    const horizontallyMoved: Projectile = {
      ...projectile,
      position: { x: nextX, y: projectile.position.y },
      remainingLifetimeFrames,
    };
    if (
      projectileOverlapsSolidTile(horizontallyMoved, levelSpec, breakableBlocks)
    ) {
      continue;
    }

    // Vertical move — hitting the ground bounces it back up in an arc; a ceiling
    // just cancels the upward motion. Either way it keeps its pre-move height so
    // it never sinks into the tile.
    const nextY = requireSimulationPixelPosition(
      projectile.position.y +
        requirePixelDelta(
          velocityYAfterGravity * frameDurationSeconds,
          "projectile.position.y",
        ),
      "projectile.position.y",
    );
    const verticallyMoved: Projectile = {
      ...horizontallyMoved,
      position: { x: nextX, y: nextY },
    };

    const resolvedProjectile: Projectile = projectileOverlapsSolidTile(
      verticallyMoved,
      levelSpec,
      breakableBlocks,
    )
      ? {
          ...horizontallyMoved,
          velocity: {
            x: projectile.velocity.x,
            y: requireSimulationVelocity(
              velocityYAfterGravity > 0 ? 0 - projectileBounceSpeed : 0,
              "projectile.velocity.y",
            ),
          },
        }
      : {
          ...verticallyMoved,
          velocity: {
            x: projectile.velocity.x,
            y: requireSimulationVelocity(
              velocityYAfterGravity,
              "projectile.velocity.y",
            ),
          },
        };

    if (isProjectileOutOfBounds(resolvedProjectile, levelSpec)) {
      continue;
    }

    steppedProjectiles.push(resolvedProjectile);
  }

  return steppedProjectiles;
}

function resolveProjectileEnemyCollisions(
  projectiles: readonly Projectile[],
  enemyMotion: EnemyMotionState,
  levelSpec: LevelSpec,
  alreadyDefeatedEnemyEntityIds: ReadonlySet<EntityId>,
  previousFireballHits: Readonly<Record<string, number>>,
): {
  readonly projectiles: readonly Projectile[];
  readonly newlyDefeatedEnemyEntityIds: readonly EntityId[];
  readonly fireballHitsByEntityId: Readonly<Record<string, number>>;
} {
  const survivingProjectiles: Projectile[] = [];
  const newlyDefeatedEnemyEntityIds: EntityId[] = [];
  const newlyDefeatedSet = new Set<EntityId>();
  const fireballHits: Record<string, number> = { ...previousFireballHits };

  for (const projectile of projectiles) {
    if (!projectile.active) {
      continue;
    }

    const hit = findHitEnemyEntityId(
      projectile,
      enemyMotion,
      levelSpec,
      alreadyDefeatedEnemyEntityIds,
      newlyDefeatedSet,
    );

    if (hit !== undefined) {
      // A fireproof enemy (Buzzy) is not defeated, but the fireball still
      // detonates on it — consume it (drop from the surviving list) without
      // scoring a hit, so it can't pass through to an enemy behind.
      if (hit.fireproof) {
        continue;
      }
      // Multi-hit enemies (Bowser) soak fireballs until their hit points run
      // out; everyone else is defeated by the first hit.
      const placement = levelSpec.actors.find(
        (actor) => actor.entityId === hit.entityId,
      );
      const hitPointsNeeded =
        placement === undefined
          ? 1
          : (levelSpec.actorDefinitions.find(
              (definition) => definition.actorId === placement.actorId,
            )?.projectileHitPoints ?? 1);
      const landedHits = (fireballHits[hit.entityId] ?? 0) + 1;
      fireballHits[hit.entityId] = landedHits;
      if (landedHits >= hitPointsNeeded) {
        newlyDefeatedEnemyEntityIds.push(hit.entityId);
        newlyDefeatedSet.add(hit.entityId);
      }
      continue;
    }

    survivingProjectiles.push(projectile);
  }

  return {
    projectiles: survivingProjectiles,
    newlyDefeatedEnemyEntityIds,
    fireballHitsByEntityId: fireballHits,
  };
}

function findHitEnemyEntityId(
  projectile: Projectile,
  enemyMotion: EnemyMotionState,
  levelSpec: LevelSpec,
  alreadyDefeatedEnemyEntityIds: ReadonlySet<EntityId>,
  newlyDefeatedEnemyEntityIds: ReadonlySet<EntityId>,
): { readonly entityId: EntityId; readonly fireproof: boolean } | undefined {
  for (const actor of levelSpec.actors) {
    if (
      alreadyDefeatedEnemyEntityIds.has(actor.entityId) ||
      newlyDefeatedEnemyEntityIds.has(actor.entityId)
    ) {
      continue;
    }

    const enemyActor = tryGetEnemyActorState(enemyMotion, actor.entityId);

    if (enemyActor === undefined) {
      continue;
    }

    if (
      rectanglesOverlap(
        {
          x: projectile.position.x,
          y: projectile.position.y,
          width: projectile.width,
          height: projectile.height,
        },
        {
          x: enemyActor.position.x,
          y: enemyActor.position.y,
          ...makeActorColliderSizePixels(levelSpec, actor.actorId),
        },
      )
    ) {
      // The fireball explodes on the first enemy it overlaps. A fireproof enemy
      // (Buzzy Beetle) shrugs it off — the projectile is still consumed, but the
      // enemy is not defeated (matching the ROM, where it can't tunnel through).
      const actorDefinition = levelSpec.actorDefinitions.find(
        (definition) => definition.actorId === actor.actorId,
      );
      return {
        entityId: actor.entityId,
        fireproof: actorDefinition?.fireproof === true,
      };
    }
  }

  return undefined;
}

function tryGetEnemyActorState(
  enemyMotion: EnemyMotionState,
  entityId: EntityId,
): ReturnType<typeof requireEnemyActorState> | undefined {
  try {
    return requireEnemyActorState(enemyMotion, entityId);
  } catch {
    return undefined;
  }
}

function rectanglesOverlap(
  first: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  second: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function projectileOverlapsSolidTile(
  projectile: Projectile,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
): boolean {
  const leftTile = Math.floor(projectile.position.x / levelSpec.tileSizePixels);
  const rightTile = Math.floor(
    (projectile.position.x + projectile.width - 1) / levelSpec.tileSizePixels,
  );
  const topTile = Math.floor(projectile.position.y / levelSpec.tileSizePixels);
  const bottomTile = Math.floor(
    (projectile.position.y + projectile.height - 1) / levelSpec.tileSizePixels,
  );

  for (let tileX = leftTile; tileX <= rightTile; tileX += 1) {
    for (let tileY = topTile; tileY <= bottomTile; tileY += 1) {
      if (tileCoordinateIsSolid(tileX, tileY, levelSpec, breakableBlocks)) {
        return true;
      }
    }
  }

  return false;
}

function tileCoordinateIsSolid(
  tileX: number,
  tileY: number,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
): boolean {
  if (
    tileX < 0 ||
    tileX >= levelSpec.widthTiles ||
    tileY < 0 ||
    tileY >= levelSpec.heightTiles
  ) {
    return false;
  }

  const row = levelSpec.tiles[tileY];

  if (row === undefined) {
    throw new Error(`Tile row ${tileY} is out of bounds.`);
  }

  const tileId = row[tileX];

  if (tileId === undefined) {
    throw new Error(`Tile column ${tileX} is out of bounds.`);
  }

  const tileDefinition = levelSpec.tileDefinitions.find(
    (definition) => definition.tileId === tileId,
  );

  if (tileDefinition === undefined) {
    throw new Error(`Unknown tile id ${tileId} at (${tileX}, ${tileY}).`);
  }

  switch (tileDefinition.collision) {
    case TileCollisionKind.Solid:
    case TileCollisionKind.Interactive:
    case TileCollisionKind.SolidHazard:
    case TileCollisionKind.Spring:
      return true;
    case TileCollisionKind.Breakable:
      return !isBreakableBlockBroken(breakableBlocks, {
        x: tileX as TileCoordinate,
        y: tileY as TileCoordinate,
      });
    case TileCollisionKind.Empty:
    case TileCollisionKind.Hazard:
    case TileCollisionKind.Goal:
    // A hidden block is intangible until bumped from below, so a fireball passes
    // straight through it.
    case TileCollisionKind.Hidden:
      return false;
    default: {
      const invalidCollision: never = tileDefinition.collision;
      throw new Error(`Invalid tile collision: ${String(invalidCollision)}`);
    }
  }
}

function isProjectileOutOfBounds(
  projectile: Projectile,
  levelSpec: LevelSpec,
): boolean {
  return (
    projectile.position.x + projectile.width < 0 ||
    projectile.position.x > levelSpec.widthTiles * levelSpec.tileSizePixels ||
    projectile.position.y + projectile.height < 0 ||
    projectile.position.y > levelSpec.heightTiles * levelSpec.tileSizePixels
  );
}
