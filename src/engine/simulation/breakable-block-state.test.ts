import type { TilePoint } from "../domain/units";
import { describe, expect, it } from "vitest";

import {
  assertValidBreakableBlockState,
  isBreakableBlockBroken,
  makeEmptyBreakableBlockState,
  resolveBreakableBlockState,
} from "./breakable-block-state";
import {
  breakableBlockLevelSpec,
  makeUpwardMovingPlayerAt,
  playerAt,
} from "./level-test-support";
import {
  makePoweredPlayerVitalityState,
  PlayerVitalityKind,
} from "./player-vitality";
import { initialMovementConstants } from "./movement-model";
import { resolveSolidTileCollisionWithBlockBumps } from "./solid-tile-collision";

function tilePoint(x: number, y: number): TilePoint {
  return {
    x: x as unknown as TilePoint["x"],
    y: y as unknown as TilePoint["y"],
  };
}

describe("breakable block state", () => {
  it("creates an explicit empty breakable block state", () => {
    expect(makeEmptyBreakableBlockState()).toEqual({
      brokenBlockTilePositions: [],
    });
  });

  it("does not break bumped blocks for a small player", () => {
    expect(
      resolveBreakableBlockState(
        makeEmptyBreakableBlockState(),
        [tilePoint(2, 4)],
        { kind: PlayerVitalityKind.Small },
      ),
    ).toEqual({
      brokenBlockTilePositions: [],
    });
  });

  it("records a powered player breaking a bumped block", () => {
    const state = resolveBreakableBlockState(
      makeEmptyBreakableBlockState(),
      [tilePoint(2, 4)],
      makePoweredPlayerVitalityState(),
    );

    expect(state).toEqual({
      brokenBlockTilePositions: [tilePoint(2, 4)],
    });
    expect(isBreakableBlockBroken(state, tilePoint(2, 4))).toBe(true);
  });

  it("rejects malformed breakable block state", () => {
    expect(() =>
      assertValidBreakableBlockState({
        brokenBlockTilePositions: [{ x: "2", y: 4 }],
      }),
    ).toThrow(
      "Breakable block broken position at index 0 must have numeric x and y.",
    );
  });
});

describe("breakable block collision", () => {
  it("reports a breakable block bump when the player hits it from below", () => {
    const levelSpec = breakableBlockLevelSpec();
    const previousPlayer = playerAt({ x: 32, y: 80 });
    const movedPlayer = makeUpwardMovingPlayerAt({ x: 32, y: 80 });

    const result = resolveSolidTileCollisionWithBlockBumps(
      previousPlayer,
      movedPlayer,
      levelSpec,
      makeEmptyBreakableBlockState(),
      initialMovementConstants.springLaunchSpeed,
    );

    expect(result.player.position.y).toBe(80);
    expect(result.bumpedBreakableBlocks).toEqual([tilePoint(2, 4)]);
  });

  it("does not collide with a block after it is broken", () => {
    const levelSpec = breakableBlockLevelSpec();
    const previousPlayer = playerAt({ x: 32, y: 80 });
    const movedPlayer = makeUpwardMovingPlayerAt({ x: 32, y: 80 });
    const breakableBlocks = resolveBreakableBlockState(
      makeEmptyBreakableBlockState(),
      [tilePoint(2, 4)],
      makePoweredPlayerVitalityState(),
    );

    const result = resolveSolidTileCollisionWithBlockBumps(
      previousPlayer,
      movedPlayer,
      levelSpec,
      breakableBlocks,
      initialMovementConstants.springLaunchSpeed,
    );

    expect(result.player.position.y).toBe(64);
    expect(result.bumpedBreakableBlocks).toEqual([]);
  });
});
