// Rideable moving platforms (SMB lifts). Oscillating and wrapping lifts are
// pure functions of the frame index; drop lifts and rope-linked balance pairs
// carry runtime state (their fall/offset progress). The player rides a
// platform by landing on its top edge and is carried with its motion.

import type { LevelSpec, PlatformDefinition } from "../domain/level-spec";
import { TileCollisionKind } from "../domain/level-spec";
import type { FrameIndex } from "../domain/units";
import { VerticalMovementState } from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import {
  requireSimulationPixelPosition,
  requireSimulationVelocity,
} from "./simulation-units";

const platformHeightPixels = 8;
// Oscillating lifts sweep about three tiles either way over ~5.5 seconds.
const oscillationAmplitudePixels = 48;
const oscillationPeriodFrames = 330;
// Wrapping elevator lifts travel at a steady pace.
const wrappingLiftSpeedPixelsPerSecond = 60;
// A drop lift accelerates while ridden, up to a terminal speed.
const dropLiftGravityPixelsPerSecondSquared = 300;
const dropLiftMaxFallSpeedPixelsPerSecond = 180;
// Balance pairs shift while ridden and detach past the rope limit.
const balanceShiftSpeedPixelsPerSecond = 60;
const balanceRopeLimitPixels = 44;
const balanceFallSpeedPixelsPerSecond = 200;
const balanceDetachFallAcceleration = 800;
// Landing forgiveness: how deep the player's feet may cross the platform top
// in one frame and still snap onto it.
const landingTolerancePixels = 10;

type PlatformRuntimeState = {
  readonly platformId: string;
  // Runtime offsets on top of the spec-defined base position: drop lifts and
  // fallen balance platforms accumulate fallOffsetY; balance pairs accumulate
  // a signed balanceOffsetY (negative = pulled up).
  readonly fallOffsetY: number;
  readonly fallVelocityY: number;
  readonly balanceOffsetY: number;
  readonly detached: boolean;
};

export type PlatformsState = {
  readonly platforms: readonly PlatformRuntimeState[];
};

export type PlatformPlacement = {
  readonly platformId: string;
  readonly kind: LevelSpec["platforms"][number]["kind"];
  readonly x: number;
  readonly y: number;
  readonly widthPixels: number;
  readonly heightPixels: number;
};

export function makeEmptyPlatformsState(levelSpec: LevelSpec): PlatformsState {
  return {
    platforms: levelSpec.platforms.map((platform) => ({
      platformId: platform.platformId,
      fallOffsetY: 0,
      fallVelocityY: 0,
      balanceOffsetY: 0,
      detached: false,
    })),
  };
}

export function assertValidPlatformsState(
  state: unknown,
  levelSpec: LevelSpec,
): asserts state is PlatformsState {
  if (typeof state !== "object" || state === null) {
    throw new Error("Platforms state must be an object.");
  }
  const candidate = state as Readonly<Record<string, unknown>>;
  if (!Array.isArray(candidate.platforms)) {
    throw new Error("Platforms state must contain a platforms array.");
  }
  if (candidate.platforms.length !== levelSpec.platforms.length) {
    throw new Error(
      "Platforms state must match the level's platform definitions.",
    );
  }
  for (const [index, platform] of candidate.platforms.entries()) {
    const item = platform as Readonly<Record<string, unknown>>;
    if (
      typeof item.platformId !== "string" ||
      typeof item.fallOffsetY !== "number" ||
      typeof item.fallVelocityY !== "number" ||
      typeof item.balanceOffsetY !== "number" ||
      typeof item.detached !== "boolean"
    ) {
      throw new Error(`Platforms state entry at index ${index} is malformed.`);
    }
  }
}

function requireDefinition(
  levelSpec: LevelSpec,
  platformId: string,
): PlatformDefinition {
  const definition = levelSpec.platforms.find(
    (platform) => platform.platformId === platformId,
  );
  if (definition === undefined) {
    throw new Error(`Platform definition missing for ${platformId}.`);
  }
  return definition;
}

// The horizontal pixel range the plank's left edge can occupy without any of
// its tiles overlapping a solid on its row.
function horizontalFreeSpan(
  definition: PlatformDefinition,
  levelSpec: LevelSpec,
): { readonly minX: number; readonly maxX: number } {
  const tileSize = levelSpec.tileSizePixels;
  const row = levelSpec.tiles[definition.tileY];
  const solidAt = (column: number): boolean => {
    const tileId = row?.[column];
    if (tileId === undefined) {
      return true;
    }
    const collision = levelSpec.tileDefinitions.find(
      (definitionEntry) => definitionEntry.tileId === tileId,
    )?.collision;
    return (
      collision === TileCollisionKind.Solid ||
      collision === TileCollisionKind.Breakable ||
      collision === TileCollisionKind.Interactive
    );
  };
  let leftColumn = definition.tileX;
  while (leftColumn > 0 && !solidAt(leftColumn - 1)) {
    leftColumn -= 1;
  }
  let rightColumn = definition.tileX + definition.widthTiles - 1;
  while (rightColumn < levelSpec.widthTiles - 1 && !solidAt(rightColumn + 1)) {
    rightColumn += 1;
  }
  return {
    minX: leftColumn * tileSize,
    maxX: (rightColumn - definition.widthTiles + 1) * tileSize,
  };
}

// The base (frame-driven) position of a platform before runtime offsets.
// The ROM's oscillating lifts move at constant speed and reverse at the
// extremes — a triangle wave over the period, not a sine ease.
function oscillationOffsetPixels(frame: number): number {
  const phase =
    (((frame % oscillationPeriodFrames) + oscillationPeriodFrames) %
      oscillationPeriodFrames) /
    oscillationPeriodFrames;
  // Sine-aligned triangle: 0 at phase 0, +1 at 1/4, 0 at 1/2, -1 at 3/4.
  const triangle =
    phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4;
  return oscillationAmplitudePixels * triangle;
}

function basePlatformPosition(
  definition: PlatformDefinition,
  levelSpec: LevelSpec,
  frameIndex: FrameIndex,
): { readonly x: number; readonly y: number } {
  const tileSize = levelSpec.tileSizePixels;
  const baseX = definition.tileX * tileSize;
  const baseY = definition.tileY * tileSize;
  const frame = Number(frameIndex);
  switch (definition.kind) {
    case "vertical": {
      return {
        x: baseX,
        y: baseY + oscillationOffsetPixels(frame),
      };
    }
    case "horizontal": {
      // Clamp the sweep to the free span on the plank's row: an off-centre
      // base with the full amplitude could carry the plank into a side wall
      // (8-4's lava shuttle penetrated the pit's right wall and shoved its
      // rider inside it).
      const span = horizontalFreeSpan(definition, levelSpec);
      const swept = baseX + oscillationOffsetPixels(frame);
      return {
        x: Math.max(span.minX, Math.min(swept, span.maxX)),
        y: baseY,
      };
    }
    case "lift-up":
    case "lift-down": {
      // Wrap through the playfield plus a margin so the lift re-enters from
      // the far side, like the original's elevator shafts.
      const span = levelSpec.heightTiles * tileSize + 4 * tileSize;
      const travel = (wrappingLiftSpeedPixelsPerSecond / 60) * frame;
      const signedTravel = definition.kind === "lift-up" ? -travel : travel;
      const wrapped =
        ((((baseY + signedTravel) % span) + span) % span) - 2 * tileSize;
      return { x: baseX, y: wrapped };
    }
    case "drop":
    case "balance":
      return { x: baseX, y: baseY };
    default: {
      const invalidKind: never = definition.kind;
      throw new Error(`Invalid platform kind: ${String(invalidKind)}`);
    }
  }
}

export function computePlatformPlacements(
  state: PlatformsState,
  levelSpec: LevelSpec,
  frameIndex: FrameIndex,
): readonly PlatformPlacement[] {
  return state.platforms.map((runtime) => {
    const definition = requireDefinition(levelSpec, runtime.platformId);
    const base = basePlatformPosition(definition, levelSpec, frameIndex);
    return {
      platformId: runtime.platformId,
      kind: definition.kind,
      x: base.x,
      y: base.y + runtime.balanceOffsetY + runtime.fallOffsetY,
      widthPixels: definition.widthTiles * levelSpec.tileSizePixels,
      heightPixels: platformHeightPixels,
    };
  });
}

function playerRidesPlacement(
  player: PlayerSimulationState,
  placement: PlatformPlacement,
): boolean {
  const playerBottom = player.position.y + player.collider.height;
  const horizontalOverlap =
    player.position.x + player.collider.width > placement.x &&
    player.position.x < placement.x + placement.widthPixels;
  return (
    horizontalOverlap &&
    player.velocity.y >= 0 &&
    playerBottom >= placement.y &&
    playerBottom <= placement.y + landingTolerancePixels
  );
}

export type PlatformsResolution = {
  readonly state: PlatformsState;
  readonly player: PlayerSimulationState;
  readonly playerRiding: boolean;
};

// Advance every platform one frame and settle the player onto whichever
// platform they ride. Riding a drop lift makes it fall; riding a balance
// platform pulls it down and its rope partner up, detaching both past the
// rope limit.
export function resolvePlatformsState(
  previousState: PlatformsState,
  levelSpec: LevelSpec,
  player: PlayerSimulationState,
  frameDurationMilliseconds: number,
  frameIndex: FrameIndex,
): PlatformsResolution {
  assertValidPlatformsState(previousState, levelSpec);
  if (levelSpec.platforms.length === 0) {
    return { state: previousState, player, playerRiding: false };
  }

  const frameSeconds = frameDurationMilliseconds / 1000;
  const previousPlacements = computePlatformPlacements(
    previousState,
    levelSpec,
    frameIndex,
  );
  const riddenIds = new Set(
    previousPlacements
      .filter((placement) => playerRidesPlacement(player, placement))
      .map((placement) => placement.platformId),
  );

  const byId = new Map(
    previousState.platforms.map((platform) => [platform.platformId, platform]),
  );

  const nextPlatforms = previousState.platforms.map((runtime) => {
    const definition = requireDefinition(levelSpec, runtime.platformId);

    if (runtime.detached || definition.kind === "drop") {
      const ridden = riddenIds.has(runtime.platformId);
      const shouldFall =
        runtime.detached || ridden || runtime.fallVelocityY > 0;
      if (!shouldFall) {
        return runtime;
      }
      const acceleration = runtime.detached
        ? balanceDetachFallAcceleration
        : dropLiftGravityPixelsPerSecondSquared;
      const nextVelocity = Math.min(
        runtime.fallVelocityY + acceleration * frameSeconds,
        runtime.detached
          ? balanceFallSpeedPixelsPerSecond
          : dropLiftMaxFallSpeedPixelsPerSecond,
      );
      return {
        ...runtime,
        fallVelocityY: nextVelocity,
        fallOffsetY: runtime.fallOffsetY + nextVelocity * frameSeconds,
      };
    }

    if (definition.kind === "balance") {
      const partnerId = definition.balancePartnerId;
      const partner = partnerId === undefined ? undefined : byId.get(partnerId);
      const ridden = riddenIds.has(runtime.platformId);
      const partnerRidden = partnerId !== undefined && riddenIds.has(partnerId);
      let shift = 0;
      if (ridden && !partnerRidden) {
        shift = balanceShiftSpeedPixelsPerSecond * frameSeconds;
      } else if (partnerRidden && !ridden) {
        shift = -balanceShiftSpeedPixelsPerSecond * frameSeconds;
      }
      const nextOffset = runtime.balanceOffsetY + shift;
      // Past the rope limit both platforms detach and plummet.
      const partnerOffset = partner?.balanceOffsetY ?? 0;
      const detached =
        Math.abs(nextOffset) > balanceRopeLimitPixels ||
        Math.abs(partnerOffset) > balanceRopeLimitPixels;
      return {
        ...runtime,
        balanceOffsetY: nextOffset,
        detached,
      };
    }

    return runtime;
  });

  const nextState: PlatformsState = { platforms: nextPlatforms };
  const nextPlacements = computePlatformPlacements(
    nextState,
    levelSpec,
    (Number(frameIndex) + 1) as FrameIndex,
  );

  // Settle the player onto the ridden platform's new top, carried by its
  // horizontal motion.
  let adjustedPlayer = player;
  let playerRiding = false;
  for (const placement of nextPlacements) {
    const previous = previousPlacements.find(
      (candidate) => candidate.platformId === placement.platformId,
    );
    if (previous === undefined) {
      continue;
    }
    const wasRiding = riddenIds.has(placement.platformId);
    const landsNow = playerRidesPlacement(player, placement);
    if (!wasRiding && !landsNow) {
      continue;
    }
    const deltaX = placement.x - previous.x;
    playerRiding = true;
    adjustedPlayer = {
      ...player,
      position: {
        x: requireSimulationPixelPosition(
          player.position.x + deltaX,
          "player.position.x",
        ),
        y: requireSimulationPixelPosition(
          placement.y - player.collider.height,
          "player.position.y",
        ),
      },
      velocity: {
        x: player.velocity.x,
        y: requireSimulationVelocity(0, "player.velocity.y"),
      },
      movement: {
        ...player.movement,
        vertical: VerticalMovementState.Grounded,
      },
    };
    break;
  }

  return { state: nextState, player: adjustedPlayer, playerRiding };
}
