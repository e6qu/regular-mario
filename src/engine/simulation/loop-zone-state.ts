// Castle maze loop checkpoints, ported from Super Mario Bros. (4-4, 7-4 and
// 8-4's water maze). Crossing a checkpoint column on the wrong row — or with
// any member of a multi-part group failed — sends the player back four pages
// to retry the maze. 8-4's checkpoints use an unreachable row band, so only
// entering the correct pipe (whose transition lands past the checkpoint)
// gets through.

import { VerticalMovementState } from "./movement-model";
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
  // Checkpoints the player has moved beyond. The ROM's scroll lock makes a
  // passed checkpoint impossible to approach again; with free backtracking,
  // wandering left past one (e.g. after a warp arrival beyond it) and walking
  // right again used to re-arm it and throw the player to the start.
  readonly passedZoneKeys: readonly string[];
};

export type LoopZonesResolution = {
  readonly state: LoopZoneRuntimeState;
  readonly player: PlayerSimulationState;
  readonly loopedBack: boolean;
};

export function makeEmptyLoopZoneState(): LoopZoneRuntimeState {
  return { groupProgress: {}, passedZoneKeys: [] };
}

export function assertValidLoopZoneState(
  candidate: unknown,
): asserts candidate is LoopZoneRuntimeState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("Loop zone state must be an object.");
  }
  const state = candidate as {
    groupProgress?: unknown;
    passedZoneKeys?: unknown;
  };
  if (typeof state.groupProgress !== "object" || state.groupProgress === null) {
    throw new Error("Loop zone state must have a groupProgress record.");
  }
  if (!Array.isArray(state.passedZoneKeys)) {
    throw new Error("Loop zone state must have a passedZoneKeys array.");
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
  const passedZoneKeys = new Set(previousState.passedZoneKeys);
  const zoneKey = (zone: LevelSpec["loopZones"][number]): string =>
    `${zone.groupId}:${String(zone.checkTileX)}`;

  for (const zone of levelSpec.loopZones) {
    if (passedZoneKeys.has(zoneKey(zone))) {
      continue;
    }
    const checkPixelX = zone.checkTileX * tileSize;
    const crossed =
      previousPlayer.position.x < checkPixelX &&
      adjustedPlayer.position.x >= checkPixelX;
    if (!crossed) {
      continue;
    }

    // The ROM compares Player_Y_Position (the player's top) and requires
    // solid ground — an airborne crossing always fails the check.
    const playerRow = Math.floor(adjustedPlayer.position.y / tileSize);
    const grounded =
      adjustedPlayer.movement.vertical === VerticalMovementState.Grounded;
    const onCorrectRow =
      grounded &&
      playerRow >= zone.requiredRowMin &&
      playerRow <= zone.requiredRowMax;

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

  // A checkpoint left a full tile behind is spent for the rest of the run —
  // the ROM's scroll lock equivalent.
  if (!loopedBack) {
    for (const zone of levelSpec.loopZones) {
      if (adjustedPlayer.position.x >= (zone.checkTileX + 1) * tileSize) {
        passedZoneKeys.add(zoneKey(zone));
      }
    }
  }

  return {
    state: { groupProgress, passedZoneKeys: [...passedZoneKeys] },
    player: adjustedPlayer,
    loopedBack,
  };
}
