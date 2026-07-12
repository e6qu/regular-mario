import type { LevelSpec } from "../domain/level-spec";
import { TimedHazardProjectileDirection } from "../domain/level-spec";
import type { FrameIndex } from "../domain/units";
import type { BreakableBlockState } from "./breakable-block-state";
import { assertValidBreakableBlockState } from "./breakable-block-state";
import type { EnemyInteractionState } from "./enemy-interaction";
import type {
  AerialThrowingEnemyActorState,
  EnemyMotionState,
  ThrowingEnemyActorState,
} from "./enemy-motion";
import { playerOverlapsActorPixel } from "./player-actor-overlap";
import { makeSolidTileIds, tileIsSolid } from "./tile-collision-support";
import type { PlayerSimulationState } from "./player-state";
import type { Projectile } from "./projectile-state";
import {
  assertValidProjectilesState,
  projectileHazardBox,
  requireProjectileFrameCount,
  stepExistingProjectiles,
} from "./projectile-state";
import {
  requireSimulationPixelPosition,
  requireSimulationVelocity,
} from "./simulation-units";
import type { MovementConstants } from "./movement-model";

// Downward gravity for thrown, arcing enemy projectiles (hammers, spiny eggs),
// matching the fireball's arc so tosses come back down.
const enemyProjectileGravity = 540;

export type TimedHazardProjectilesState = {
  readonly projectiles: readonly Projectile[];
  readonly playerContact: boolean;
  // Landing spots of Lakitu eggs that hatched this frame (consumed by the
  // hatched-spiny subsystem; not serialized between frames).
  readonly hatchedPositions: readonly {
    readonly x: number;
    readonly y: number;
  }[];
  // Stompable projectiles (Bullet Bills) the player defeated this frame — the
  // step drives the stomp rebound and score from this count.
  readonly stompedProjectileCount: number;
};

export function makeEmptyTimedHazardProjectilesState(): TimedHazardProjectilesState {
  return {
    projectiles: [],
    playerContact: false,
    stompedProjectileCount: 0,
    hatchedPositions: [],
  };
}

export function assertValidTimedHazardProjectilesState(
  state: unknown,
): asserts state is TimedHazardProjectilesState {
  if (typeof state !== "object" || state === null) {
    throw new Error("Timed hazard projectiles state must be an object.");
  }

  const candidate = state as Readonly<Record<string, unknown>>;

  if (typeof candidate.playerContact !== "boolean") {
    throw new Error("timedHazardProjectiles.playerContact must be a boolean.");
  }

  if (
    typeof candidate.stompedProjectileCount !== "number" ||
    !Number.isInteger(candidate.stompedProjectileCount) ||
    candidate.stompedProjectileCount < 0
  ) {
    throw new Error(
      "timedHazardProjectiles.stompedProjectileCount must be a non-negative integer.",
    );
  }

  assertValidProjectilesState({
    projectiles: candidate.projectiles,
    cooldownRemainingFrames: 0,
    fireballHitsByEntityId: {},
  });
}

export function resolveTimedHazardProjectilesState(
  previousState: TimedHazardProjectilesState,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
  player: PlayerSimulationState,
  enemyMotion: EnemyMotionState,
  enemyInteractions: EnemyInteractionState,
  movementConstants: MovementConstants,
  frameDurationMilliseconds: number,
  frameIndex: FrameIndex,
  previousPlayer: PlayerSimulationState = player,
): TimedHazardProjectilesState {
  assertValidTimedHazardProjectilesState(previousState);
  assertValidBreakableBlockState(breakableBlocks);

  const frameDurationSeconds = frameDurationMilliseconds / 1000;
  const steppedProjectiles = stepExistingProjectiles(
    previousState.projectiles,
    frameDurationSeconds,
    levelSpec,
    breakableBlocks,
    // Cannonballs / thrown hazards fly straight — no arc, no bounce.
    0,
    0,
  );
  const spawnedProjectiles = levelSpec.timedHazardProjectileSpawners
    .filter((spawner) =>
      shouldSpawnProjectile(spawner, frameIndex, player, levelSpec),
    )
    .map((spawner) =>
      makeTimedHazardProjectile(levelSpec, spawner, frameIndex),
    );
  const enemyProjectiles = makeThrowingEnemyProjectiles(
    enemyMotion,
    enemyInteractions,
    player,
    movementConstants,
    frameIndex,
  );
  const aerialEnemyProjectiles = makeAerialThrowingEnemyProjectiles(
    enemyMotion,
    enemyInteractions,
    movementConstants,
    frameIndex,
  );
  const allProjectiles = [
    ...steppedProjectiles,
    ...spawnedProjectiles,
    ...enemyProjectiles,
    ...aerialEnemyProjectiles,
  ];

  // A stompable projectile (Bullet Bill) the player lands on is defeated and
  // removed; the surviving projectiles are what can still harm the player.
  const stompedProjectileCount = allProjectiles.filter((projectile) =>
    isProjectileStomp(previousPlayer, player, projectile, movementConstants),
  ).length;
  const unstompedProjectiles = allProjectiles.filter(
    (projectile) =>
      !isProjectileStomp(previousPlayer, player, projectile, movementConstants),
  );

  // Lakitu's eggs convert into Spinies where they touch solid ground: the
  // landed egg leaves the projectile list and reports its landing spot.
  const solidTileIds = makeSolidTileIds(levelSpec);
  const hatchedPositions: { readonly x: number; readonly y: number }[] = [];
  const projectiles = unstompedProjectiles.filter((projectile) => {
    if (projectile.hatchesOnLanding !== true) {
      return true;
    }
    const tileSize = levelSpec.tileSizePixels;
    const column = Math.floor(
      (projectile.position.x + projectile.width / 2) / tileSize,
    );
    const row = Math.floor(
      (projectile.position.y + projectile.height) / tileSize,
    );
    if (!tileIsSolid(levelSpec, solidTileIds, row, column)) {
      return true;
    }
    hatchedPositions.push({
      x: projectile.position.x,
      y: row * tileSize - projectile.height,
    });
    return false;
  });

  return {
    projectiles,
    playerContact: projectiles.some((projectile) => {
      const box = projectileHazardBox(projectile);
      return playerOverlapsActorPixel(
        player,
        { x: box.x, y: box.y },
        { width: box.width, height: box.height },
      );
    }),
    stompedProjectileCount,
    hatchedPositions,
  };
}

// A stompable projectile is defeated when the player is falling and their feet
// cross its top while overlapping it — the same rule as an enemy stomp.
function isProjectileStomp(
  previousPlayer: PlayerSimulationState,
  player: PlayerSimulationState,
  projectile: Projectile,
  movementConstants: MovementConstants,
): boolean {
  if (projectile.stompable !== true) {
    return false;
  }

  const projectileTop = projectile.position.y;
  const previousPlayerBottom =
    previousPlayer.position.y + previousPlayer.collider.height;
  const playerBottom = player.position.y + player.collider.height;

  return (
    player.velocity.y > 0 &&
    previousPlayerBottom <=
      projectileTop + movementConstants.enemyStompForgivenessPixels &&
    playerBottom >= projectileTop &&
    (() => {
      const box = projectileHazardBox(projectile);
      return playerOverlapsActorPixel(
        player,
        { x: box.x, y: box.y },
        { width: box.width, height: box.height },
      );
    })()
  );
}

function makeAerialThrowingEnemyProjectiles(
  enemyMotion: EnemyMotionState,
  enemyInteractions: EnemyInteractionState,
  movementConstants: MovementConstants,
  frameIndex: FrameIndex,
): readonly Projectile[] {
  if (
    (frameIndex as number) %
      movementConstants.aerialThrowingEnemyProjectileIntervalFrameCount !==
    0
  ) {
    return [];
  }

  const defeatedEnemyEntityIds = new Set(
    enemyInteractions.defeatedEnemyEntityIds,
  );
  const activeEnemyEntityIds = new Set(enemyMotion.activeEnemyEntityIds);

  return enemyMotion.aerialThrowingActors
    .filter(
      (aerialThrowingActor) =>
        activeEnemyEntityIds.has(aerialThrowingActor.entityId) &&
        !defeatedEnemyEntityIds.has(aerialThrowingActor.entityId),
    )
    .map((aerialThrowingActor) =>
      makeAerialThrowingEnemyProjectile(
        aerialThrowingActor,
        movementConstants,
        frameIndex,
      ),
    );
}

function makeAerialThrowingEnemyProjectile(
  aerialThrowingActor: AerialThrowingEnemyActorState,
  movementConstants: MovementConstants,
  frameIndex: FrameIndex,
): Projectile {
  return {
    id: makeAerialThrowingEnemyProjectileId(aerialThrowingActor, frameIndex),
    position: {
      x: requireSimulationPixelPosition(
        aerialThrowingActor.position.x,
        "aerialThrowingEnemyProjectile.position.x",
      ),
      y: requireSimulationPixelPosition(
        aerialThrowingActor.position.y,
        "aerialThrowingEnemyProjectile.position.y",
      ),
    },
    velocity: {
      x: requireSimulationVelocity(
        0,
        "aerialThrowingEnemyProjectile.velocity.x",
      ),
      y: requireSimulationVelocity(
        movementConstants.aerialThrowingEnemyProjectileSpeed,
        "aerialThrowingEnemyProjectile.velocity.y",
      ),
    },
    width: movementConstants.aerialThrowingEnemyProjectileColliderWidth,
    hatchesOnLanding: true,
    height: movementConstants.aerialThrowingEnemyProjectileColliderHeight,
    active: true,
    remainingLifetimeFrames: requireProjectileFrameCount(
      movementConstants.aerialThrowingEnemyProjectileLifetimeFrameCount,
      "aerialThrowingEnemyProjectile.remainingLifetimeFrames",
    ),
  };
}

function makeAerialThrowingEnemyProjectileId(
  aerialThrowingActor: AerialThrowingEnemyActorState,
  frameIndex: FrameIndex,
): Projectile["id"] {
  return `aerial-throwing-enemy-${aerialThrowingActor.entityId}-${frameIndex as number}` as Projectile["id"];
}

function makeThrowingEnemyProjectiles(
  enemyMotion: EnemyMotionState,
  enemyInteractions: EnemyInteractionState,
  player: PlayerSimulationState,
  movementConstants: MovementConstants,
  frameIndex: FrameIndex,
): readonly Projectile[] {
  if (
    (frameIndex as number) %
      movementConstants.throwingEnemyProjectileIntervalFrameCount !==
    0
  ) {
    return [];
  }

  const defeatedEnemyEntityIds = new Set(
    enemyInteractions.defeatedEnemyEntityIds,
  );
  const activeEnemyEntityIds = new Set(enemyMotion.activeEnemyEntityIds);

  return enemyMotion.throwingActors
    .filter(
      (throwingActor) =>
        activeEnemyEntityIds.has(throwingActor.entityId) &&
        !defeatedEnemyEntityIds.has(throwingActor.entityId),
    )
    .map((throwingActor) =>
      makeThrowingEnemyProjectile(
        throwingActor,
        player,
        movementConstants,
        frameIndex,
      ),
    );
}

function makeThrowingEnemyProjectile(
  throwingActor: ThrowingEnemyActorState,
  player: PlayerSimulationState,
  movementConstants: MovementConstants,
  frameIndex: FrameIndex,
): Projectile {
  const directionSign = player.position.x < throwingActor.position.x ? -1 : 1;

  return {
    id: makeThrowingEnemyProjectileId(throwingActor, frameIndex),
    position: {
      x: requireSimulationPixelPosition(
        throwingActor.position.x,
        "throwingEnemyProjectile.position.x",
      ),
      y: requireSimulationPixelPosition(
        throwingActor.position.y,
        "throwingEnemyProjectile.position.y",
      ),
    },
    velocity: {
      x: requireSimulationVelocity(
        directionSign * movementConstants.throwingEnemyProjectileSpeed,
        "throwingEnemyProjectile.velocity.x",
      ),
      y: requireSimulationVelocity(
        0 - movementConstants.throwingEnemyProjectileUpwardSpeed,
        "throwingEnemyProjectile.velocity.y",
      ),
    },
    width: movementConstants.throwingEnemyProjectileColliderWidth,
    height: movementConstants.throwingEnemyProjectileColliderHeight,
    active: true,
    // Thrown up and out, then it arcs down under gravity (as in the ROM's
    // ProcHammerObj) instead of flying off in a straight line forever.
    gravityPixelsPerSecondSquared: enemyProjectileGravity,
    remainingLifetimeFrames: requireProjectileFrameCount(
      movementConstants.throwingEnemyProjectileLifetimeFrameCount,
      "throwingEnemyProjectile.remainingLifetimeFrames",
    ),
  };
}

function makeThrowingEnemyProjectileId(
  throwingActor: ThrowingEnemyActorState,
  frameIndex: FrameIndex,
): Projectile["id"] {
  return `throwing-enemy-${throwingActor.entityId}-${frameIndex as number}` as Projectile["id"];
}

// A cannon never fires while the player is nearly on top of it (~48px) — the
// ROM destroys a point-blank Bullet Bill — and never fires in a water area.
// Bowser flames (not stompable) fire regardless of distance.
const cannonPointBlankPixels = 48;

function shouldSpawnProjectile(
  spawner: LevelSpec["timedHazardProjectileSpawners"][number],
  frameIndex: FrameIndex,
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
): boolean {
  if (frameIndex < spawner.initialDelayFrames) {
    return false;
  }

  const isOnInterval =
    ((frameIndex as number) - spawner.initialDelayFrames) %
      spawner.intervalFrames ===
    0;
  if (!isOnInterval) {
    return false;
  }

  // Cannon Bullet Bills (stompable) are gated; flames are not.
  if (spawner.stompable) {
    if (levelSpec.cheepFrenzy !== undefined) {
      // A water area: cannons stay silent (ProcessCannons' AreaType check).
      return false;
    }
    const spawnerPixelX = spawner.position.x * levelSpec.tileSizePixels;
    if (Math.abs(player.position.x - spawnerPixelX) < cannonPointBlankPixels) {
      return false;
    }
  }

  return true;
}

function makeTimedHazardProjectile(
  levelSpec: LevelSpec,
  spawner: LevelSpec["timedHazardProjectileSpawners"][number],
  frameIndex: FrameIndex,
): Projectile {
  const velocityX =
    spawner.direction === TimedHazardProjectileDirection.Right
      ? spawner.speedPixelsPerSecond
      : requireSimulationVelocity(
          0 - spawner.speedPixelsPerSecond,
          "timedHazardProjectile.velocity.x",
        );

  return {
    id: makeTimedHazardProjectileId(spawner.spawnerId, frameIndex),
    position: {
      x: requireSimulationPixelPosition(
        spawner.position.x * levelSpec.tileSizePixels,
        "timedHazardProjectile.position.x",
      ),
      y: requireSimulationPixelPosition(
        spawner.position.y * levelSpec.tileSizePixels,
        "timedHazardProjectile.position.y",
      ),
    },
    velocity: {
      x: velocityX,
      y: requireSimulationVelocity(0, "timedHazardProjectile.velocity.y"),
    },
    width: spawner.widthPixels,
    height: spawner.heightPixels,
    active: true,
    remainingLifetimeFrames: requireProjectileFrameCount(
      spawner.lifetimeFrames,
      "timedHazardProjectile.remainingLifetimeFrames",
    ),
    stompable: spawner.stompable,
    hazardInsetXPixels: spawner.hazardInsetXPixels,
    hazardInsetYPixels: spawner.hazardInsetYPixels,
  };
}

function makeTimedHazardProjectileId(
  spawnerId: string,
  frameIndex: FrameIndex,
): Projectile["id"] {
  return `timed-hazard-${spawnerId}-${frameIndex as number}` as Projectile["id"];
}
