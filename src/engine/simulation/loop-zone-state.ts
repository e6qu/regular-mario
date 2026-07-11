// Castle maze loop checkpoints, ported from Super Mario Bros. (4-4, 7-4 and
// 8-4's water maze). Crossing a checkpoint column on the wrong row — or with
// any member of a multi-part group failed — sends the player back four pages
// to retry the maze. 8-4's checkpoints use an unreachable row band, so only
// entering the correct pipe (whose transition lands past the checkpoint)
// gets through.

import type { LevelSpec } from "../domain/level-spec";
import type { PlayerSimulationState } from "./player-state";
import { requireSimulationPixelPosition } from "./simulation-units";

// ExecGameLoopback sends everything back four pages (a page is 16 tiles).
const loopbackPages = 4;
const pageTiles = 16;
const minimumReturnPixelX = 32;

export type LoopZoneRuntimeState = {
  // Per-group evaluation progress: parts evaluated so far and whether any of
  // them failed. Reset after the group's last member resolves.
  readonly groupProgress: Readonly<
    Record<string, { readonly evaluated: number; readonly failed: boolean }>
  >;
};

export type LoopZonesResolution = {
  readonly state: LoopZoneRuntimeState;
  readonly player: PlayerSimulationState;
  readonly loopedBack: boolean;
};

export function makeEmptyLoopZoneState(): LoopZoneRuntimeState {
  return { groupProgress: {} };
}

export function assertValidLoopZoneState(
  candidate: unknown,
): asserts candidate is LoopZoneRuntimeState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("Loop zone state must be an object.");
  }
  const state = candidate as { groupProgress?: unknown };
  if (typeof state.groupProgress !== "object" || state.groupProgress === null) {
    throw new Error("Loop zone state must have a groupProgress record.");
  }
}

export function resolveLoopZones(
  previousState: LoopZoneRuntimeState,
  levelSpec: LevelSpec,
  previousPlayer: PlayerSimulationState,
  player: PlayerSimulationState,
): LoopZonesResolution {
  if (levelSpec.loopZones.length === 0) {
    return { state: previousState, player, loopedBack: false };
  }

  const tileSize = levelSpec.tileSizePixels;
  const groupProgress: Record<string, { evaluated: number; failed: boolean }> =
    Object.fromEntries(
      Object.entries(previousState.groupProgress).map(([key, value]) => [
        key,
        { evaluated: value.evaluated, failed: value.failed },
      ]),
    );

  let adjustedPlayer = player;
  let loopedBack = false;

  for (const zone of levelSpec.loopZones) {
    const checkPixelX = zone.checkTileX * tileSize;
    const crossed =
      previousPlayer.position.x < checkPixelX &&
      adjustedPlayer.position.x >= checkPixelX;
    if (!crossed) {
      continue;
    }

    const playerRow = Math.floor(adjustedPlayer.position.y / tileSize);
    const onCorrectRow =
      playerRow >= zone.requiredRowMin && playerRow <= zone.requiredRowMax;

    const progress = groupProgress[zone.groupId] ?? {
      evaluated: 0,
      failed: false,
    };
    progress.evaluated += 1;
    progress.failed = progress.failed || !onCorrectRow;
    groupProgress[zone.groupId] = progress;

    if (progress.evaluated < zone.groupSize) {
      continue;
    }

    // The group's last member resolves it: loop back on any failure.
    const failed = progress.failed;
    delete groupProgress[zone.groupId];
    if (!failed) {
      continue;
    }

    const returnPixelX = Math.max(
      minimumReturnPixelX,
      adjustedPlayer.position.x - loopbackPages * pageTiles * tileSize,
    );
    adjustedPlayer = {
      ...adjustedPlayer,
      position: {
        x: requireSimulationPixelPosition(returnPixelX, "player.position.x"),
        y: adjustedPlayer.position.y,
      },
    };
    loopedBack = true;
    break;
  }

  return {
    state: { groupProgress },
    player: adjustedPlayer,
    loopedBack,
  };
}
