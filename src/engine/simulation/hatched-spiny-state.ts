// Spinies hatched from Lakitu's thrown eggs. An aerial-thrower projectile
// that lands on solid ground converts into a walking Spiny: it patrols like a
// goomba (falling off ledges), hurts the player on any contact (spiked), and
// dies to player fireballs. Deterministic: driven entirely by landing
// positions and the fixed patrol motion.

import type { TileId } from "../domain/identifiers";
import type { LevelSpec } from "../domain/level-spec";
import type { PlayerSimulationState } from "./player-state";
import type { Projectile } from "./projectile-state";
import { makeSolidTileIds, tileIsSolid } from "./tile-collision-support";

const spinyColliderSizePixels = 14;
const spinyPatrolSpeedPixelsPerSecond = 40;
const spinyGravityPixelsPerSecondSquared = 600;
const spinyMaxFallSpeedPixelsPerSecond = 240;
// SMB caps the live spinies (enemy slots); extra eggs fizzle.
const maxLiveSpinies = 3;
const despawnDistancePixels = 420;

export type HatchedSpiny = {
  readonly spinyId: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly velocityX: number;
  readonly velocityY: number;
};

export type HatchedSpinyState = {
  readonly spinies: readonly HatchedSpiny[];
};

export type ResolvedHatchedSpinyState = {
  readonly state: HatchedSpinyState;
  readonly playerContacted: boolean;
  // Fireballs consumed defeating a spiny this frame, and how many died.
  readonly consumedProjectileIds: readonly string[];
  readonly defeatedCount: number;
};

export function makeEmptyHatchedSpinyState(): HatchedSpinyState {
  return { spinies: [] };
}

export function assertValidHatchedSpinyState(
  candidate: unknown,
): asserts candidate is HatchedSpinyState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("Hatched spiny state must be an object.");
  }
  const state = candidate as { spinies?: unknown };
  if (!Array.isArray(state.spinies)) {
    throw new Error("Hatched spiny state must contain a spinies array.");
  }
  for (const [index, spiny] of state.spinies.entries()) {
    const item = spiny as Readonly<Record<string, unknown>>;
    if (
      typeof item.spinyId !== "string" ||
      typeof item.position !== "object" ||
      item.position === null ||
      typeof item.velocityX !== "number" ||
      typeof item.velocityY !== "number"
    ) {
      throw new Error(`Hatched spiny at index ${index} is malformed.`);
    }
  }
}

function solidBelow(
  levelSpec: LevelSpec,
  solidTileIds: ReadonlySet<TileId>,
  x: number,
  y: number,
): boolean {
  const tileSize = levelSpec.tileSizePixels;
  const column = Math.floor((x + spinyColliderSizePixels / 2) / tileSize);
  const row = Math.floor((y + spinyColliderSizePixels) / tileSize);
  return tileIsSolid(levelSpec, solidTileIds, row, column);
}

function stepSpiny(
  spiny: HatchedSpiny,
  levelSpec: LevelSpec,
  solidTileIds: ReadonlySet<TileId>,
  frameDurationSeconds: number,
): HatchedSpiny {
  const tileSize = levelSpec.tileSizePixels;
  const attemptedX = spiny.position.x + spiny.velocityX * frameDurationSeconds;

  // Reverse at world edges and solid walls (leading-edge probe).
  const leadingX =
    spiny.velocityX < 0 ? attemptedX : attemptedX + spinyColliderSizePixels;
  const leadingColumn = Math.floor(leadingX / tileSize);
  const bodyRow = Math.floor(
    (spiny.position.y + spinyColliderSizePixels / 2) / tileSize,
  );
  const blocked =
    attemptedX < 0 ||
    attemptedX + spinyColliderSizePixels >
      levelSpec.widthTiles * tileSize ||
    tileIsSolid(levelSpec, solidTileIds, bodyRow, leadingColumn);
  const velocityX = blocked ? -spiny.velocityX : spiny.velocityX;
  const nextX = blocked ? spiny.position.x : attemptedX;

  // Gravity with landing on tile tops (goombas' ledge-falling rule).
  const resting =
    spiny.velocityY >= 0 &&
    solidBelow(levelSpec, solidTileIds, nextX, spiny.position.y);
  let nextY = spiny.position.y;
  let velocityY = 0;
  if (resting) {
    nextY =
      Math.floor(
        (spiny.position.y + spinyColliderSizePixels) / tileSize,
      ) *
        tileSize -
      spinyColliderSizePixels;
  } else {
    velocityY = Math.min(
      spiny.velocityY + spinyGravityPixelsPerSecondSquared * frameDurationSeconds,
      spinyMaxFallSpeedPixelsPerSecond,
    );
    nextY = spiny.position.y + velocityY * frameDurationSeconds;
    if (
      velocityY > 0 &&
      solidBelow(levelSpec, solidTileIds, nextX, nextY)
    ) {
      nextY =
        Math.floor((nextY + spinyColliderSizePixels) / tileSize) * tileSize -
        spinyColliderSizePixels;
      velocityY = 0;
    }
  }

  return {
    ...spiny,
    position: { x: nextX, y: nextY },
    velocityX,
    velocityY,
  };
}

function spinyOverlapsPlayer(
  spiny: HatchedSpiny,
  player: PlayerSimulationState,
): boolean {
  return (
    spiny.position.x < player.position.x + player.collider.width &&
    spiny.position.x + spinyColliderSizePixels > player.position.x &&
    spiny.position.y < player.position.y + player.collider.height &&
    spiny.position.y + spinyColliderSizePixels > player.position.y
  );
}

function projectileOverlapsSpiny(
  projectile: Projectile,
  spiny: HatchedSpiny,
): boolean {
  return (
    projectile.position.x < spiny.position.x + spinyColliderSizePixels &&
    projectile.position.x + projectile.width > spiny.position.x &&
    projectile.position.y < spiny.position.y + spinyColliderSizePixels &&
    projectile.position.y + projectile.height > spiny.position.y
  );
}

export function resolveHatchedSpinyState(
  previousState: HatchedSpinyState,
  levelSpec: LevelSpec,
  player: PlayerSimulationState,
  playerFireballs: readonly Projectile[],
  hatchPositions: readonly { readonly x: number; readonly y: number }[],
  frameDurationSeconds: number,
  frameIndex: number,
): ResolvedHatchedSpinyState {
  assertValidHatchedSpinyState(previousState);
  if (previousState.spinies.length === 0 && hatchPositions.length === 0) {
    return {
      state: previousState,
      playerContacted: false,
      consumedProjectileIds: [],
      defeatedCount: 0,
    };
  }

  const solidTileIds = makeSolidTileIds(levelSpec);

  // Move survivors and cull the ones far offscreen.
  let spinies = previousState.spinies
    .map((spiny) =>
      stepSpiny(spiny, levelSpec, solidTileIds, frameDurationSeconds),
    )
    .filter(
      (spiny) =>
        Math.abs(spiny.position.x - player.position.x) <= despawnDistancePixels,
    );

  // Player fireballs defeat spinies (and are consumed doing it).
  const consumedProjectileIds: string[] = [];
  let defeatedCount = 0;
  for (const projectile of playerFireballs) {
    if (!projectile.active) {
      continue;
    }
    const hitIndex = spinies.findIndex((spiny) =>
      projectileOverlapsSpiny(projectile, spiny),
    );
    if (hitIndex >= 0) {
      spinies = spinies.filter((_, index) => index !== hitIndex);
      consumedProjectileIds.push(projectile.id);
      defeatedCount += 1;
    }
  }

  // Hatch landed eggs into walkers moving toward the player, respecting the
  // live cap.
  for (const [index, hatch] of hatchPositions.entries()) {
    if (spinies.length >= maxLiveSpinies) {
      break;
    }
    const towardPlayer =
      player.position.x < hatch.x
        ? -spinyPatrolSpeedPixelsPerSecond
        : spinyPatrolSpeedPixelsPerSecond;
    spinies = [
      ...spinies,
      {
        spinyId: `hatched-spiny-${String(frameIndex)}-${String(index)}`,
        position: { x: hatch.x, y: hatch.y },
        velocityX: towardPlayer,
        velocityY: 0,
      },
    ];
  }

  const playerContacted = spinies.some((spiny) =>
    spinyOverlapsPlayer(spiny, player),
  );

  return {
    state: { spinies },
    playerContacted,
    consumedProjectileIds,
    defeatedCount,
  };
}

export function liveHatchedSpinies(
  state: HatchedSpinyState,
): readonly HatchedSpiny[] {
  return state.spinies;
}
