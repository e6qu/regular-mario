import type { TilePoint } from "../domain/units";
import {
  isEnlargedPlayerVitalityKind,
  type PlayerVitalityState,
} from "./player-vitality";
import { assertValidTilePointArray } from "./tile-point-state";

export type BreakableBlockState = {
  readonly brokenBlockTilePositions: readonly TilePoint[];
};

export function makeEmptyBreakableBlockState(): BreakableBlockState {
  return {
    brokenBlockTilePositions: [],
  };
}

export function assertValidBreakableBlockState(
  state: unknown,
): asserts state is BreakableBlockState {
  if (typeof state !== "object" || state === null) {
    throw new Error("Breakable block state must be an object.");
  }

  const candidate = state as Readonly<Record<string, unknown>>;

  assertValidTilePointArray(
    candidate.brokenBlockTilePositions,
    "Breakable block broken positions",
    "Breakable block broken position",
  );
}

export function isBreakableBlockBroken(
  state: BreakableBlockState,
  position: TilePoint,
): boolean {
  assertValidBreakableBlockState(state);

  return state.brokenBlockTilePositions.some(
    (brokenPosition) =>
      brokenPosition.x === position.x && brokenPosition.y === position.y,
  );
}

export function resolveBreakableBlockState(
  previousState: BreakableBlockState,
  bumpedBreakableBlocks: readonly TilePoint[],
  playerVitality: PlayerVitalityState,
): BreakableBlockState {
  assertValidBreakableBlockState(previousState);

  if (!isEnlargedPlayerVitalityKind(playerVitality.kind)) {
    return previousState;
  }

  const brokenBlockTilePositions = [...previousState.brokenBlockTilePositions];

  for (const position of bumpedBreakableBlocks) {
    if (
      !brokenBlockTilePositions.some(
        (brokenPosition) =>
          brokenPosition.x === position.x && brokenPosition.y === position.y,
      )
    ) {
      brokenBlockTilePositions.push(position);
    }
  }

  return {
    brokenBlockTilePositions,
  };
}
