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
} from "./pipe-state";

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

// Player centred inside pipe tile (4, 4) — centre pixel (72, 72).
function playerOnPipe(velocityX: number) {
  return playerWithTestState({
    position: { x: 65, y: 60 },
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
  velocityX: number,
): ReturnType<typeof resolvePipeState> {
  return resolvePipeState(
    { downHeld },
    playerOnPipe(velocityX),
    makeInitialPipeEntryState(),
    initialMovementConstants,
    level,
    undefined,
  );
}

describe("pipe entry direction", () => {
  it("enters a right walk-in pipe when moving right into its mouth", () => {
    const result = resolveAt(pipeLevelSpec("right"), false, 90);
    expect(result.pipeEntry.phase).toBe(PipeEntryPhase.Entering);
    if (result.pipeEntry.phase === PipeEntryPhase.Entering) {
      expect(result.pipeEntry.targetLevelName).toBe("sub-area");
    }
  });

  it("does not enter a walk-in pipe while standing still or pressing down", () => {
    const level = pipeLevelSpec("right");
    expect(resolveAt(level, false, 0).pipeEntry.phase).toBe(
      PipeEntryPhase.None,
    );
    expect(resolveAt(level, true, 0).pipeEntry.phase).toBe(PipeEntryPhase.None);
    // Walking the wrong way (left) doesn't enter a right pipe either.
    expect(resolveAt(level, false, -90).pipeEntry.phase).toBe(
      PipeEntryPhase.None,
    );
  });

  it("enters a left walk-in pipe only when moving left", () => {
    const level = pipeLevelSpec("left");
    expect(resolveAt(level, false, -90).pipeEntry.phase).toBe(
      PipeEntryPhase.Entering,
    );
    expect(resolveAt(level, false, 90).pipeEntry.phase).toBe(
      PipeEntryPhase.None,
    );
  });

  it("keeps down pipes press-to-enter (not walk-in)", () => {
    const level = pipeLevelSpec("down");
    expect(resolveAt(level, true, 0).pipeEntry.phase).toBe(
      PipeEntryPhase.Entering,
    );
    expect(resolveAt(level, false, 90).pipeEntry.phase).toBe(
      PipeEntryPhase.None,
    );
  });
});
