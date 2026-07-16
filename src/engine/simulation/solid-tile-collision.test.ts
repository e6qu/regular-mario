import { TileCollisionKind, ActorRole } from "../domain/level-spec";
import {
  HorizontalMovementState,
  initialMovementConstants,
  VerticalMovementState,
} from "./movement-model";
import { describe, expect, it } from "vitest";

import { makeLevelSpec, type LevelSpec } from "../domain/level-spec";
import { firstAuthoredLevelInput } from "../levels/first-authored-level";
import {
  solidHazardBlockLevelSpec,
  springBlockLevelSpec,
} from "./level-test-support";
import { playerWithTestState } from "./movement-test-support";
import {
  resolveSolidTileCollision,
  resolveSolidTileCollisionWithBlockBumps,
} from "./solid-tile-collision";
import { makeEmptyBreakableBlockState } from "./breakable-block-state";
import { hiddenBlockPositionKey } from "./tile-collision-support";
import type { PlayerSimulationState } from "./player-state";

function firstAuthoredLevelSpec() {
  const result = makeLevelSpec(firstAuthoredLevelInput);

  if (!result.ok) {
    throw new Error("Expected first authored level to validate.");
  }

  return result.value;
}

function explicitBlockInteractionLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 8,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: [
      {
        tileId: "sky",
        collision: TileCollisionKind.Empty,
      },
      {
        tileId: "stone",
        collision: TileCollisionKind.Solid,
      },
    ],
    actorDefinitions: [
      {
        actorId: "runner-start",
        role: ActorRole.PlayerStart,
      },
      {
        actorId: "open-gate",
        role: ActorRole.Exit,
      },
    ],
    tiles: [
      ["sky", "sky", "sky", "sky", "sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "stone", "sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "sky", "sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "sky", "stone", "stone", "sky", "sky"],
      ["sky", "sky", "sky", "sky", "sky", "sky", "sky", "sky"],
      ["stone", "stone", "stone", "stone", "stone", "stone", "stone", "stone"],
    ],
    actors: [
      {
        entityId: "runner-1",
        actorId: "runner-start",
        x: 1,
        y: 4,
      },
      {
        entityId: "gate-1",
        actorId: "open-gate",
        x: 7,
        y: 4,
      },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected explicit block interaction level to validate.");
  }

  return result.value;
}

function horizontallyMovingPlayer(input: {
  readonly positionX: number;
  readonly velocityX: number;
}) {
  return playerWithTestState({
    position: {
      x: input.positionX,
      y: 40,
    },
    velocity: {
      x: input.velocityX,
      y: 0,
    },
    movement: {
      horizontal: HorizontalMovementState.Running,
      vertical: VerticalMovementState.Falling,
    },
  });
}

function upwardMovingPlayer(position: {
  readonly x: number;
  readonly y: number;
}) {
  return playerWithTestState({
    position,
    velocity: {
      x: 0,
      y: -120,
    },
    movement: {
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Jumping,
    },
  });
}

function fallingPlayerPair(input: {
  readonly previousPosition: { readonly x: number; readonly y: number };
  readonly movedPosition: { readonly x: number; readonly y: number };
  readonly velocityY?: number;
}): {
  readonly previous: PlayerSimulationState;
  readonly moved: PlayerSimulationState;
} {
  const velocity = {
    x: 0,
    y: input.velocityY ?? 120,
  };
  const movement = {
    horizontal: HorizontalMovementState.Idle,
    vertical: VerticalMovementState.Falling,
  };

  return {
    previous: playerWithTestState({
      position: input.previousPosition,
      velocity,
      movement,
    }),
    moved: playerWithTestState({
      position: input.movedPosition,
      velocity,
      movement,
    }),
  };
}

// A tall level with a single hidden block ("secret") at row 3, column 3, with
// open space above and below it (floor at row 7) so the player can jump into its
// underside and also land on its top once revealed.
function hiddenBlockLevelSpec(): LevelSpec {
  const sky8 = ["sky", "sky", "sky", "sky", "sky", "sky", "sky", "sky"];
  const result = makeLevelSpec({
    widthTiles: 8,
    heightTiles: 8,
    tileSizePixels: 16,
    tileDefinitions: [
      { tileId: "sky", collision: TileCollisionKind.Empty },
      { tileId: "stone", collision: TileCollisionKind.Solid },
      { tileId: "secret", collision: TileCollisionKind.Hidden },
    ],
    actorDefinitions: [
      { actorId: "runner-start", role: ActorRole.PlayerStart },
      { actorId: "open-gate", role: ActorRole.Exit },
    ],
    tiles: [
      [...sky8],
      [...sky8],
      [...sky8],
      ["sky", "sky", "sky", "secret", "sky", "sky", "sky", "sky"],
      [...sky8],
      [...sky8],
      [...sky8],
      ["stone", "stone", "stone", "stone", "stone", "stone", "stone", "stone"],
    ],
    actors: [
      { entityId: "runner-1", actorId: "runner-start", x: 1, y: 6 },
      { entityId: "gate-1", actorId: "open-gate", x: 7, y: 6 },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected hidden block level to validate.");
  }

  return result.value;
}

describe("hidden block collision", () => {
  const noneRevealed = new Set<string>();

  it("falls straight through an unrevealed hidden block", () => {
    // Falling down through the secret tile's cell (column 3, row 3).
    const { previous, moved } = fallingPlayerPair({
      previousPosition: { x: 48, y: 28 },
      movedPosition: { x: 48, y: 36 },
    });
    const levelSpec = hiddenBlockLevelSpec();
    expect(levelSpec.tiles[3]?.[3]).toBe("secret");

    const result = resolveSolidTileCollisionWithBlockBumps(
      previous,
      moved,
      levelSpec,
      makeEmptyBreakableBlockState(),
      initialMovementConstants.springLaunchSpeed,
      noneRevealed,
    );
    // Intangible: the player keeps falling and nothing is bumped.
    expect(result.player.position.y).toBe(36);
    expect(result.bumpedInteractiveBlocks).toEqual([]);
  });

  it("stops and reveals a hidden block on an upward head-bump", () => {
    // Rising into the secret tile's underside (row 3 bottom = 64) from below.
    const previousPlayer = upwardMovingPlayer({ x: 48, y: 70 });
    const movedPlayer = upwardMovingPlayer({ x: 48, y: 63 });
    const levelSpec = hiddenBlockLevelSpec();

    const result = resolveSolidTileCollisionWithBlockBumps(
      previousPlayer,
      movedPlayer,
      levelSpec,
      makeEmptyBreakableBlockState(),
      initialMovementConstants.springLaunchSpeed,
      noneRevealed,
    );
    // Stopped at the tile underside (row 3 bottom = 64) and knocked downward.
    expect(result.player.position.y).toBe(64);
    expect(result.player.velocity.y).toBe(0);
    // Revealed through the interactive-block path so its contents can spawn.
    expect(result.bumpedInteractiveBlocks).toEqual([{ x: 3, y: 3 }]);
  });

  it("is solid to land on once revealed", () => {
    const { previous, moved } = fallingPlayerPair({
      previousPosition: { x: 48, y: 28 },
      movedPosition: { x: 48, y: 36 },
    });
    const levelSpec = hiddenBlockLevelSpec();
    const revealed = new Set<string>([hiddenBlockPositionKey(3, 3)]);

    const result = resolveSolidTileCollisionWithBlockBumps(
      previous,
      moved,
      levelSpec,
      makeEmptyBreakableBlockState(),
      initialMovementConstants.springLaunchSpeed,
      revealed,
    );
    // Now solid: the player lands on the revealed block's top (row 3 top = 48,
    // minus the player collider height).
    expect(result.player.position.y).toBe(48 - moved.collider.height);
    expect(result.player.velocity.y).toBe(0);
  });
});

describe("solid tile collision", () => {
  it("lands on a crossed solid tile from above", () => {
    const { previous: previousPlayer, moved: movedPlayer } = fallingPlayerPair({
      previousPosition: { x: 16, y: 61 },
      movedPosition: { x: 16, y: 65 },
    });

    expect(
      resolveSolidTileCollision(
        previousPlayer,
        movedPlayer,
        firstAuthoredLevelSpec(),
      ),
    ).toEqual({
      ...movedPlayer,
      position: {
        x: 16,
        y: 64,
      },
      velocity: {
        x: movedPlayer.velocity.x,
        y: 0,
      },
      movement: {
        horizontal: HorizontalMovementState.Idle,
        vertical: VerticalMovementState.Grounded,
      },
    });
  });

  it("launches upward from a crossed spring tile top", () => {
    const { previous: previousPlayer, moved: movedPlayer } = fallingPlayerPair({
      previousPosition: { x: 32, y: 45 },
      movedPosition: { x: 32, y: 49 },
    });

    expect(
      resolveSolidTileCollision(
        previousPlayer,
        movedPlayer,
        springBlockLevelSpec(),
      ),
    ).toEqual({
      ...movedPlayer,
      position: {
        x: 32,
        y: 48,
      },
      velocity: {
        x: movedPlayer.velocity.x,
        y: 0 - initialMovementConstants.springLaunchSpeed,
      },
      movement: {
        horizontal: HorizontalMovementState.Idle,
        vertical: VerticalMovementState.Jumping,
      },
    });
  });

  it("does not collide with empty tiles", () => {
    const { previous: previousPlayer, moved: movedPlayer } = fallingPlayerPair({
      previousPosition: { x: 16, y: 0 },
      movedPosition: { x: 16, y: 20 },
    });

    expect(
      resolveSolidTileCollision(
        previousPlayer,
        movedPlayer,
        firstAuthoredLevelSpec(),
      ),
    ).toBe(movedPlayer);
  });

  it("ignores upward movement", () => {
    const previousPlayer = upwardMovingPlayer({
      x: 16,
      y: 57,
    });
    const movedPlayer = upwardMovingPlayer({
      x: 16,
      y: 53,
    });

    expect(
      resolveSolidTileCollision(
        previousPlayer,
        movedPlayer,
        firstAuthoredLevelSpec(),
      ),
    ).toBe(movedPlayer);
  });

  it("stops upward movement at a crossed solid tile underside", () => {
    const previousPlayer = upwardMovingPlayer({
      x: 48,
      y: 38,
    });
    const movedPlayer = upwardMovingPlayer({
      x: 48,
      y: 31,
    });
    const levelSpec = explicitBlockInteractionLevelSpec();

    expect(levelSpec.tiles[1]?.[3]).toBe("stone");

    expect(
      resolveSolidTileCollision(previousPlayer, movedPlayer, levelSpec),
    ).toEqual({
      ...movedPlayer,
      position: {
        x: 48,
        y: 32,
      },
      velocity: {
        x: 0,
        y: 0,
      },
      movement: {
        horizontal: HorizontalMovementState.Idle,
        vertical: VerticalMovementState.Falling,
      },
    });
  });

  it("stops upward movement at a crossed solid hazard tile underside", () => {
    const previousPlayer = upwardMovingPlayer({
      x: 32,
      y: 80,
    });
    const movedPlayer = upwardMovingPlayer({
      x: 32,
      y: 64,
    });

    expect(
      resolveSolidTileCollision(
        previousPlayer,
        movedPlayer,
        solidHazardBlockLevelSpec(),
      ).position.y,
    ).toBe(80);
  });

  it("does not stop upward movement when no solid tile is overhead", () => {
    const previousPlayer = upwardMovingPlayer({
      x: 80,
      y: 38,
    });
    const movedPlayer = upwardMovingPlayer({
      x: 80,
      y: 31,
    });
    const levelSpec = explicitBlockInteractionLevelSpec();

    expect(
      resolveSolidTileCollision(previousPlayer, movedPlayer, levelSpec),
    ).toBe(movedPlayer);
  });

  it("stops rightward movement at a crossed solid tile side", () => {
    const previousPlayer = horizontallyMovingPlayer({
      positionX: 113,
      velocityX: 120,
    });
    const movedPlayer = horizontallyMovingPlayer({
      positionX: 116,
      velocityX: 120,
    });

    expect(
      resolveSolidTileCollision(
        previousPlayer,
        movedPlayer,
        firstAuthoredLevelSpec(),
      ),
    ).toEqual({
      ...movedPlayer,
      position: {
        x: 114,
        y: 40,
      },
      velocity: {
        x: 0,
        y: movedPlayer.velocity.y,
      },
    });
  });

  it("stops rightward movement at the first crossed solid tile side", () => {
    const previousPlayer = horizontallyMovingPlayer({
      positionX: 49,
      velocityX: 600,
    });
    const movedPlayer = horizontallyMovingPlayer({
      positionX: 122,
      velocityX: 600,
    });
    const levelSpec = explicitBlockInteractionLevelSpec();

    expect(levelSpec.tiles[3]?.[4]).toBe("stone");
    expect(levelSpec.tiles[3]?.[5]).toBe("stone");

    expect(
      resolveSolidTileCollision(previousPlayer, movedPlayer, levelSpec),
    ).toEqual({
      ...movedPlayer,
      position: {
        x: 50,
        y: 40,
      },
      velocity: {
        x: 0,
        y: movedPlayer.velocity.y,
      },
    });
  });

  it("does not treat the landing floor row as a crossed rightward wall", () => {
    const previousPlayer = playerWithTestState({
      position: {
        x: 16,
        y: 64,
      },
      velocity: {
        x: 120,
        y: 0,
      },
      movement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Grounded,
      },
    });
    const movedPlayer = playerWithTestState({
      position: {
        x: 18,
        y: 64.2,
      },
      velocity: {
        x: 120,
        y: 12,
      },
      movement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Falling,
      },
    });

    expect(
      resolveSolidTileCollision(
        previousPlayer,
        movedPlayer,
        firstAuthoredLevelSpec(),
      ),
    ).toEqual({
      ...movedPlayer,
      position: {
        x: 18,
        y: 64,
      },
      velocity: {
        x: 120,
        y: 0,
      },
      movement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Grounded,
      },
    });
  });

  it("stops upward diagonal rightward movement against a newly overlapped solid side row", () => {
    const previousPlayer = playerWithTestState({
      position: {
        x: 50,
        y: 48,
      },
      velocity: {
        x: 180,
        y: -60,
      },
      movement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Jumping,
      },
    });
    const movedPlayer = playerWithTestState({
      position: {
        x: 51,
        y: 47,
      },
      velocity: {
        x: 180,
        y: -60,
      },
      movement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Jumping,
      },
    });

    expect(
      resolveSolidTileCollision(
        previousPlayer,
        movedPlayer,
        firstAuthoredLevelSpec(),
      ),
    ).toEqual({
      ...movedPlayer,
      position: {
        x: 50,
        y: 47,
      },
      velocity: {
        x: 0,
        y: movedPlayer.velocity.y,
      },
    });
  });

  it("stops leftward movement at a crossed solid tile side", () => {
    const previousPlayer = horizontallyMovingPlayer({
      positionX: 177,
      velocityX: -120,
    });
    const movedPlayer = horizontallyMovingPlayer({
      positionX: 173,
      velocityX: -120,
    });

    expect(
      resolveSolidTileCollision(
        previousPlayer,
        movedPlayer,
        firstAuthoredLevelSpec(),
      ),
    ).toEqual({
      ...movedPlayer,
      position: {
        x: 176,
        y: 40,
      },
      velocity: {
        x: 0,
        y: movedPlayer.velocity.y,
      },
    });
  });
});
