import type { EntityId } from "../domain/identifiers";
import { HorizontalInput } from "./input-command";
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
  inputCommand: {
    readonly downHeld: boolean;
    readonly horizontal: HorizontalInput;
  },
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

function findEnteredPipe(
  inputCommand: {
    readonly downHeld: boolean;
    readonly horizontal: HorizontalInput;
  },
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
  // A sideways mouth is solid, so a walking/swimming player rests flush
  // against it and the centre never enters the mouth tile. Probe one pixel
  // past the leading edge instead — the ROM triggers on side collision with
  // the mouth tile the same way.
  const leadingRightTileX = Math.floor(
    (player.position.x + player.collider.width + 1) / levelSpec.tileSizePixels,
  );
  const leadingLeftTileX = Math.floor(
    (player.position.x - 1) / levelSpec.tileSizePixels,
  );

  for (const pipe of levelSpec.pipes) {
    const columnMatches =
      pipe.entryDirection === "right"
        ? pipe.position.x === leadingRightTileX
        : pipe.entryDirection === "left"
          ? pipe.position.x === leadingLeftTileX
          : pipe.position.x === playerTileX;
    // Down pipes have a solid mouth: a player standing ON it has their
    // centre one row above the mouth tile — accept both rows (overlap for
    // non-solid editor mouths, standing for the decoded solid ones).
    const rowMatches =
      pipe.entryDirection === "right" || pipe.entryDirection === "left"
        ? pipe.position.y === playerTileY
        : pipe.position.y === playerTileY ||
          pipe.position.y === playerTileY + 1;
    if (!columnMatches || !rowMatches) {
      continue;
    }
    if (
      pipe.targetLevelName !== undefined &&
      pipe.targetLevelName === currentLevelName
    ) {
      continue;
    }

    // Down pipes are pressed into from on top; sideways pipes are walked
    // into. Collision resolution zeroes velocity against the solid mouth, so
    // the walk-in gate is the input direction (the ROM gates its $6c side
    // rule on the facing direction the same way).
    const entered =
      pipe.entryDirection === "right"
        ? inputCommand.horizontal === HorizontalInput.Right
        : pipe.entryDirection === "left"
          ? inputCommand.horizontal === HorizontalInput.Left
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
  // Feet-anchored: the collider's bottom sits on the target tile's bottom
  // edge. For the small (one-tile) player this is exactly the target tile;
  // a taller player stands with his head above it instead of poking one
  // tile down into the floor (big Mario used to exit pipes half-buried).
  const pixelY =
    (targetTilePosition.y + 1) * levelSpec.tileSizePixels -
    player.collider.height;

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
