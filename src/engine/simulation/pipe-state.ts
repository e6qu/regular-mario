import type { EntityId } from "../domain/identifiers";
import type { LevelSpec } from "../domain/level-spec";
import type { TilePoint } from "../domain/units";
import type { MovementConstants, ProjectileFrameCount } from "./movement-model";
import type { PlayerSimulationState } from "./player-state";
import {
  requireSimulationPixelPosition,
  requireSimulationVelocity,
} from "./simulation-units";

type PipeEntryFrameCount = ProjectileFrameCount;
type PipeEntryCooldownFrameCount = ProjectileFrameCount;

export enum PipeEntryPhase {
  None = "none",
  Entering = "entering",
  Clearing = "clearing",
}

export type PipeEntryState =
  | {
      readonly phase: PipeEntryPhase.None;
    }
  | {
      readonly phase: PipeEntryPhase.Entering;
      readonly pipeEntityId: EntityId;
      readonly sourceLevelName: string | undefined;
      readonly targetLevelName: string | undefined;
      readonly targetTilePosition: TilePoint;
      readonly remainingFrames: PipeEntryFrameCount;
    }
  | {
      readonly phase: PipeEntryPhase.Clearing;
      readonly remainingFrames: PipeEntryCooldownFrameCount;
    };

export type ResolvedPipeState = {
  readonly pipeEntry: PipeEntryState;
  readonly teleport: PipeTeleportResult;
  readonly pipeWarpSound: boolean;
};

type PipeTeleportResult =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "same-level";
      readonly targetTilePosition: TilePoint;
    }
  | {
      readonly kind: "level-advance";
      readonly targetLevelName: string;
    };

export function makeInitialPipeEntryState(): PipeEntryState {
  return {
    phase: PipeEntryPhase.None,
  };
}

export function assertValidPipeEntryState(
  pipeEntry: unknown,
): asserts pipeEntry is PipeEntryState {
  if (typeof pipeEntry !== "object" || pipeEntry === null) {
    throw new Error("pipeEntry must be an object.");
  }

  const candidate = pipeEntry as Readonly<Record<string, unknown>>;

  switch (candidate.phase) {
    case PipeEntryPhase.None:
      return;
    case PipeEntryPhase.Entering:
      if (typeof candidate.pipeEntityId !== "string") {
        throw new Error("pipeEntry.pipeEntityId must be a string.");
      }

      if (
        candidate.targetLevelName !== undefined &&
        typeof candidate.targetLevelName !== "string"
      ) {
        throw new Error(
          "pipeEntry.targetLevelName must be a string or undefined.",
        );
      }

      if (
        typeof candidate.targetTilePosition !== "object" ||
        candidate.targetTilePosition === null
      ) {
        throw new Error("pipeEntry.targetTilePosition must be an object.");
      }

      if (
        typeof (candidate.targetTilePosition as Record<string, unknown>).x !==
          "number" ||
        typeof (candidate.targetTilePosition as Record<string, unknown>).y !==
          "number"
      ) {
        throw new Error(
          "pipeEntry.targetTilePosition must have numeric x and y.",
        );
      }

      if (typeof candidate.remainingFrames !== "number") {
        throw new Error("pipeEntry.remainingFrames must be a number.");
      }

      return;
    case PipeEntryPhase.Clearing:
      if (typeof candidate.remainingFrames !== "number") {
        throw new Error("pipeEntry.remainingFrames must be a number.");
      }

      return;
    default:
      throw new Error(`Invalid pipe entry phase: ${String(candidate.phase)}.`);
  }
}

export function resolvePipeState(
  inputCommand: { readonly downHeld: boolean },
  player: PlayerSimulationState,
  previousPipeEntry: PipeEntryState,
  movementConstants: MovementConstants,
  levelSpec: LevelSpec,
  currentLevelName: string | undefined,
): ResolvedPipeState {
  assertValidPipeEntryState(previousPipeEntry);

  const nextPipeEntry = stepPipeEntry(previousPipeEntry, movementConstants);
  const teleport = resolvePipeTeleport(previousPipeEntry, nextPipeEntry);

  if (teleport.kind !== "none") {
    return {
      pipeEntry: nextPipeEntry,
      teleport,
      pipeWarpSound: false,
    };
  }

  if (nextPipeEntry.phase !== PipeEntryPhase.None) {
    return {
      pipeEntry: nextPipeEntry,
      teleport: { kind: "none" },
      pipeWarpSound: false,
    };
  }

  const enteredPipe = findEnteredPipe(
    inputCommand,
    player,
    levelSpec,
    currentLevelName,
  );

  if (enteredPipe === undefined) {
    return {
      pipeEntry: nextPipeEntry,
      teleport: { kind: "none" },
      pipeWarpSound: false,
    };
  }

  return {
    pipeEntry: {
      phase: PipeEntryPhase.Entering,
      pipeEntityId: enteredPipe.pipeEntityId,
      sourceLevelName: currentLevelName,
      targetLevelName: enteredPipe.targetLevelName,
      targetTilePosition: enteredPipe.targetTilePosition,
      remainingFrames: movementConstants.pipeEntryFrameCount,
    },
    teleport: { kind: "none" },
    pipeWarpSound: true,
  };
}

function resolvePipeTeleport(
  previousPipeEntry: PipeEntryState,
  nextPipeEntry: PipeEntryState,
): PipeTeleportResult {
  if (previousPipeEntry.phase !== PipeEntryPhase.Entering) {
    return { kind: "none" };
  }

  if (
    previousPipeEntry.targetLevelName !== undefined &&
    nextPipeEntry.phase === PipeEntryPhase.None
  ) {
    return {
      kind: "level-advance",
      targetLevelName: previousPipeEntry.targetLevelName,
    };
  }

  if (
    previousPipeEntry.targetLevelName === undefined &&
    nextPipeEntry.phase === PipeEntryPhase.Clearing
  ) {
    return {
      kind: "same-level",
      targetTilePosition: previousPipeEntry.targetTilePosition,
    };
  }

  return { kind: "none" };
}

function stepPipeEntry(
  pipeEntry: PipeEntryState,
  movementConstants: MovementConstants,
): PipeEntryState {
  switch (pipeEntry.phase) {
    case PipeEntryPhase.None:
      return pipeEntry;
    case PipeEntryPhase.Entering: {
      const remainingFrames = decrementPipeFrameCount(
        pipeEntry.remainingFrames,
      );

      if (remainingFrames > 0) {
        return {
          ...pipeEntry,
          remainingFrames,
        };
      }

      if (pipeEntry.targetLevelName !== undefined) {
        return {
          phase: PipeEntryPhase.None,
        };
      }

      return {
        phase: PipeEntryPhase.Clearing,
        remainingFrames: movementConstants.pipeExitCooldownFrameCount,
      };
    }
    case PipeEntryPhase.Clearing: {
      const remainingFrames = decrementPipeFrameCount(
        pipeEntry.remainingFrames,
      );

      if (remainingFrames > 0) {
        return {
          ...pipeEntry,
          remainingFrames,
        };
      }

      return {
        phase: PipeEntryPhase.None,
      };
    }
    default: {
      const invalidPhase: never = pipeEntry;
      throw new Error(`Invalid pipe entry phase: ${String(invalidPhase)}`);
    }
  }
}

// A walk-in pipe is entered by moving into its mouth at a meaningful pace, so a
// stray touch while standing still doesn't trigger it.
const pipeWalkInSpeedThreshold = 20;

function findEnteredPipe(
  inputCommand: { readonly downHeld: boolean },
  player: PlayerSimulationState,
  levelSpec: LevelSpec,
  currentLevelName: string | undefined,
):
  | {
      readonly pipeEntityId: EntityId;
      readonly targetLevelName: string | undefined;
      readonly targetTilePosition: TilePoint;
    }
  | undefined {
  const playerCenterX = player.position.x + player.collider.width / 2;
  const playerCenterY = player.position.y + player.collider.height / 2;
  const playerTileX = Math.floor(playerCenterX / levelSpec.tileSizePixels);
  const playerTileY = Math.floor(playerCenterY / levelSpec.tileSizePixels);

  for (const pipe of levelSpec.pipes) {
    if (pipe.position.x !== playerTileX || pipe.position.y !== playerTileY) {
      continue;
    }
    if (
      pipe.targetLevelName !== undefined &&
      pipe.targetLevelName === currentLevelName
    ) {
      continue;
    }

    // Down pipes are pressed into from on top; sideways pipes are walked into.
    const entered =
      pipe.entryDirection === "right"
        ? player.velocity.x >= pipeWalkInSpeedThreshold
        : pipe.entryDirection === "left"
          ? player.velocity.x <= -pipeWalkInSpeedThreshold
          : inputCommand.downHeld;

    if (entered) {
      return {
        pipeEntityId: pipe.entityId,
        targetLevelName: pipe.targetLevelName,
        targetTilePosition: pipe.targetTilePosition,
      };
    }
  }

  return undefined;
}

function decrementPipeFrameCount(
  frameCount: ProjectileFrameCount,
): ProjectileFrameCount {
  if (frameCount <= 0) {
    return 0 as ProjectileFrameCount;
  }

  return (frameCount - 1) as ProjectileFrameCount;
}

export function teleportPlayerToTilePosition(
  player: PlayerSimulationState,
  targetTilePosition: TilePoint,
  levelSpec: LevelSpec,
): PlayerSimulationState {
  const pixelX = targetTilePosition.x * levelSpec.tileSizePixels;
  const pixelY = targetTilePosition.y * levelSpec.tileSizePixels;

  return {
    ...player,
    position: {
      x: requireSimulationPixelPosition(pixelX, "player.position.x"),
      y: requireSimulationPixelPosition(pixelY, "player.position.y"),
    },
    velocity: {
      x: requireSimulationVelocity(0, "player.velocity.x"),
      y: requireSimulationVelocity(0, "player.velocity.y"),
    },
  };
}

export function isPlayerFrozenByPipeEntry(pipeEntry: PipeEntryState): boolean {
  return pipeEntry.phase === PipeEntryPhase.Entering;
}
