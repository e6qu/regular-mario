import { describe, expect, it } from "vitest";

import { ActorRole, makeLevelSpec, type LevelSpec } from "../domain/level-spec";
import {
  makeExitActor,
  makeExitDefinition,
  makeRunnerStartActor,
  makeRunnerStartDefinition,
  makeSkyGrassTileDefinitions,
  makeSkyGroundTiles,
} from "./level-test-support";
import { HorizontalInput } from "./input-command";
import {
  HorizontalMovementState,
  initialMovementConstants,
  VerticalMovementState,
} from "./movement-model";
import { playerWithTestState } from "./movement-test-support";
import {
  makeInitialPipeEntryState,
  PipeEntryPhase,
  resolvePipeState,
  teleportPlayerToTilePosition,
} from "./pipe-state";
import { poweredPlayerColliderDimensions } from "./player-state";

// An 8x6 level whose warp pipe sits on tile (4, 4) and enters as `direction`.
function pipeLevelSpec(direction: string): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 8,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [
      makeRunnerStartDefinition(),
      { actorId: "warp-pipe", role: ActorRole.Pipe },
      makeExitDefinition(),
    ],
    tiles: makeSkyGroundTiles(8),
    actors: [
      makeRunnerStartActor(),
      {
        entityId: "pipe-1",
        actorId: "warp-pipe",
        x: 4,
        y: 4,
        targetLevelName: "sub-area",
        targetTileX: 1,
        targetTileY: 1,
        pipeEntryDirection: direction,
      },
      makeExitActor(7),
    ],
  });

  if (!result.ok) {
    throw new Error(
      `Expected pipe level to validate: ${JSON.stringify(result.errors)}`,
    );
  }

  return result.value;
}

// Sideways mouths are solid, so a walking player rests flush against tile
// (4, 4) — approaching from the left puts the right edge at pixel 64,
// approaching from the right puts the left edge at pixel 80. Down pipes are
// entered standing centred over the mouth tile.
function playerAgainstPipe(velocityX: number, playerX: number) {
  return playerWithTestState({
    position: { x: playerX, y: 60 },
    velocity: { x: velocityX, y: 0 },
    movement: {
      horizontal: HorizontalMovementState.Walking,
      vertical: VerticalMovementState.Grounded,
    },
  });
}

function resolveAt(
  level: LevelSpec,
  downHeld: boolean,
  horizontal: HorizontalInput,
  playerX = 65,
): ReturnType<typeof resolvePipeState> {
  return resolvePipeState(
    { downHeld, horizontal },
    playerAgainstPipe(0, playerX),
    makeInitialPipeEntryState(),
    initialMovementConstants,
    level,
    undefined,
  );
}

// Flush against the mouth from the left (collider width 14: right edge 64).
const flushLeftX = 50;
// Flush against the mouth from the right (left edge at pixel 80).
const flushRightX = 80;

describe("pipe entry direction", () => {
  it("enters a right walk-in pipe when pressed flush against its mouth", () => {
    const result = resolveAt(
      pipeLevelSpec("right"),
      false,
      HorizontalInput.Right,
      flushLeftX,
    );
    expect(result.pipeEntry.phase).toBe(PipeEntryPhase.Entering);
    if (result.pipeEntry.phase === PipeEntryPhase.Entering) {
      expect(result.pipeEntry.targetLevelName).toBe("sub-area");
    }
  });

  it("does not enter a walk-in pipe while standing still or pressing down", () => {
    const level = pipeLevelSpec("right");
    expect(
      resolveAt(level, false, HorizontalInput.Neutral, flushLeftX).pipeEntry
        .phase,
    ).toBe(PipeEntryPhase.None);
    expect(
      resolveAt(level, true, HorizontalInput.Neutral, flushLeftX).pipeEntry
        .phase,
    ).toBe(PipeEntryPhase.None);
    // Pressing the wrong way (left) doesn't enter a right pipe either.
    expect(
      resolveAt(level, false, HorizontalInput.Left, flushLeftX).pipeEntry.phase,
    ).toBe(PipeEntryPhase.None);
  });

  it("enters a left walk-in pipe only when moving left", () => {
    const level = pipeLevelSpec("left");
    expect(
      resolveAt(level, false, HorizontalInput.Left, flushRightX).pipeEntry
        .phase,
    ).toBe(PipeEntryPhase.Entering);
    expect(
      resolveAt(level, false, HorizontalInput.Right, flushRightX).pipeEntry
        .phase,
    ).toBe(PipeEntryPhase.None);
  });

  it("treats a pipe naming its own level as a same-level warp, not a skip", () => {
    // 8-4's maze pipes all carry targetLevelName "smb-8-4"; refusing them
    // left the checkpoint loop as the only path — the level was unwinnable.
    const result = resolvePipeState(
      { downHeld: true, horizontal: HorizontalInput.Neutral },
      playerAgainstPipe(0, 65),
      makeInitialPipeEntryState(),
      initialMovementConstants,
      pipeLevelSpec("down"),
      "sub-area",
    );
    expect(result.pipeEntry.phase).toBe(PipeEntryPhase.Entering);
    if (result.pipeEntry.phase === PipeEntryPhase.Entering) {
      expect(result.pipeEntry.targetLevelName).toBeUndefined();
      expect(result.pipeEntry.targetTilePosition).toEqual({ x: 1, y: 1 });
    }
  });

  it("keeps down pipes press-to-enter (not walk-in)", () => {
    const level = pipeLevelSpec("down");
    expect(
      resolveAt(level, true, HorizontalInput.Neutral).pipeEntry.phase,
    ).toBe(PipeEntryPhase.Entering);
    expect(resolveAt(level, false, HorizontalInput.Right).pipeEntry.phase).toBe(
      PipeEntryPhase.None,
    );
  });
});

describe("teleportPlayerToTilePosition", () => {
  it("anchors the player's feet on the target tile's bottom edge", () => {
    const level = pipeLevelSpec("down");
    const small = playerAgainstPipe(0, 65);
    const big = {
      ...small,
      collider: poweredPlayerColliderDimensions,
    };
    const target = { x: 2, y: 3 } as unknown as Parameters<
      typeof teleportPlayerToTilePosition
    >[1];

    // Small (one-tile) player fills exactly the target tile.
    const smallMoved = teleportPlayerToTilePosition(small, target, level);
    expect(smallMoved.position).toEqual({ x: 32, y: 48 });
    // A big player stands with his head above the tile instead of poking one
    // tile down into the floor (big Mario used to exit pipes half-buried).
    const bigMoved = teleportPlayerToTilePosition(big, target, level);
    expect(bigMoved.position).toEqual({ x: 32, y: 32 });
    expect(bigMoved.position.y + bigMoved.collider.height).toBe(
      smallMoved.position.y + smallMoved.collider.height,
    );
  });
});
