import { describe, expect, it } from "vitest";

import type { LevelSpecInput, PlatformInput } from "../domain/level-spec";
import type { FrameIndex } from "../domain/units";
import {
  makeFlatLevelInput,
  makePlayerAt,
  requireMechanicsLevelSpec,
} from "./mechanics-test-support";
import { VerticalMovementState } from "./movement-model";
import {
  computePlatformPlacements,
  makeEmptyPlatformsState,
  resolvePlatformsState,
} from "./platform-state";

const frame = (value: number): FrameIndex => value as FrameIndex;
const nominalFrameMilliseconds = 1000 / 60;

function makePlatformLevelInput(
  platforms: readonly PlatformInput[],
): LevelSpecInput {
  return makeFlatLevelInput(32, { platforms });
}

const requireLevelSpec = requireMechanicsLevelSpec;
const playerAt = makePlayerAt;

describe("platform state", () => {
  it("clamps a horizontal lift's sweep so the plank never enters a wall", () => {
    // A wall column at x=12 on the plank's row: the base at x=6 plus the
    // full 48px amplitude would carry the 2-tile plank into it (8-4's lava
    // shuttle did exactly this and shoved its rider inside the wall).
    const input = makePlatformLevelInput([
      { platformId: "lift-0", kind: "horizontal", x: 6, y: 6, widthTiles: 2 },
    ]);
    const walled = {
      ...input,
      tiles: input.tiles.map((row, rowIndex) =>
        rowIndex === 6
          ? row.map((tile, columnIndex) =>
              columnIndex === 12 ? "ground" : tile,
            )
          : row,
      ),
    };
    const levelSpec = requireLevelSpec(walled);
    const state = makeEmptyPlatformsState(levelSpec);
    // The wall at column 12: the 2-tile plank's left edge may reach at most
    // column 10 (x=160). Sample a full period.
    for (let step = 0; step < 330; step += 10) {
      const placement = computePlatformPlacements(
        state,
        levelSpec,
        frame(step),
      )[0];
      expect(
        (placement?.x ?? 0) + (placement?.widthPixels ?? 0),
      ).toBeLessThanOrEqual(192);
    }
  });

  it("oscillates a vertical lift around its start and returns after a period", () => {
    const levelSpec = requireLevelSpec(
      makePlatformLevelInput([
        { platformId: "lift-0", kind: "vertical", x: 8, y: 6, widthTiles: 3 },
      ]),
    );
    const state = makeEmptyPlatformsState(levelSpec);
    const atStart = computePlatformPlacements(state, levelSpec, frame(0));
    expect(atStart[0]).toMatchObject({ x: 128, y: 96, widthPixels: 48 });
    const quarter = computePlatformPlacements(state, levelSpec, frame(83));
    expect(quarter[0]?.y ?? 0).toBeGreaterThan(96 + 40);
    const fullPeriod = computePlatformPlacements(state, levelSpec, frame(330));
    expect(fullPeriod[0]?.y ?? 0).toBeCloseTo(96, 0);
  });

  it("wraps a rising lift around the playfield", () => {
    const levelSpec = requireLevelSpec(
      makePlatformLevelInput([
        { platformId: "lift-0", kind: "lift-up", x: 8, y: 2, widthTiles: 3 },
      ]),
    );
    const state = makeEmptyPlatformsState(levelSpec);
    const early = computePlatformPlacements(state, levelSpec, frame(10));
    const later = computePlatformPlacements(state, levelSpec, frame(30));
    expect(later[0]?.y ?? 0).toBeLessThan(early[0]?.y ?? 0);
    // Far enough along, the lift has wrapped back below its start.
    const wrapped = computePlatformPlacements(state, levelSpec, frame(120));
    expect(wrapped[0]?.y ?? 0).toBeGreaterThan(early[0]?.y ?? 0);
  });

  /** A level with one horizontal lift, and its empty runtime state. */
  function horizontalLiftLevel() {
    const levelSpec = requireLevelSpec(
      makePlatformLevelInput([
        {
          platformId: "lift-0",
          kind: "horizontal",
          x: 8,
          y: 6,
          widthTiles: 3,
        },
      ]),
    );
    return { levelSpec, state: makeEmptyPlatformsState(levelSpec) };
  }

  it("settles a falling player onto a platform and carries them", () => {
    const { levelSpec, state } = horizontalLiftLevel();
    // Platform top at frame 0 is y=96 at x=128..176; drop the player onto it.
    const falling = playerAt(140, 96 - 14);
    const resolution = resolvePlatformsState(
      state,
      levelSpec,
      [falling],
      nominalFrameMilliseconds,
      frame(0),
    );
    expect(resolution.riding[0]).toBe(true);
    const ridden = resolution.players[0];
    if (ridden === undefined) {
      throw new Error("Expected the ridden player to be resolved.");
    }
    expect(ridden.movement.vertical).toBe(VerticalMovementState.Grounded);
    expect(ridden.velocity.y).toBe(0);
    // Carried horizontally by the platform's motion between frames 0 and 1.
    expect(ridden.position.x).not.toBe(falling.position.x);
  });

  // Platforms used to be resolved for slot 0 alone, so a co-op player stood
  // still while the plank slid out from under them. A level built around a lift
  // was unfinishable by anybody but the host.
  it("carries every rider, not only the first", () => {
    const { levelSpec, state } = horizontalLiftLevel();
    // Two friends standing on the same plank, a few pixels apart.
    const first = playerAt(140, 96 - 14);
    const second = playerAt(160, 96 - 14);

    const resolution = resolvePlatformsState(
      state,
      levelSpec,
      [first, second],
      nominalFrameMilliseconds,
      frame(0),
    );

    expect(resolution.riding).toEqual([true, true]);
    const [carriedFirst, carriedSecond] = resolution.players;
    if (carriedFirst === undefined || carriedSecond === undefined) {
      throw new Error("Expected both riders to be resolved.");
    }
    // Both moved with the plank, and by the same amount: one platform, one
    // motion, however many people are standing on it.
    expect(carriedFirst.position.x).not.toBe(first.position.x);
    expect(carriedSecond.position.x).not.toBe(second.position.x);
    expect(Number(carriedFirst.position.x) - Number(first.position.x)).toBe(
      Number(carriedSecond.position.x) - Number(second.position.x),
    );
  });

  it("drops a drop-lift only while ridden", () => {
    const levelSpec = requireLevelSpec(
      makePlatformLevelInput([
        { platformId: "lift-0", kind: "drop", x: 8, y: 6, widthTiles: 3 },
      ]),
    );
    let state = makeEmptyPlatformsState(levelSpec);
    const bystander = playerAt(300, 100);
    state = resolvePlatformsState(
      state,
      levelSpec,
      [bystander],
      nominalFrameMilliseconds,
      frame(0),
    ).state;
    expect(state.platforms[0]?.fallOffsetY).toBe(0);

    const rider = playerAt(140, 96 - 14);
    for (let i = 0; i < 30; i += 1) {
      state = resolvePlatformsState(
        state,
        levelSpec,
        [rider],
        nominalFrameMilliseconds,
        frame(i),
      ).state;
    }
    expect(state.platforms[0]?.fallOffsetY ?? 0).toBeGreaterThan(0);
  });

  it("shifts a ridden balance platform down, its partner up, and detaches past the limit", () => {
    const levelSpec = requireLevelSpec(
      makePlatformLevelInput([
        {
          platformId: "left",
          kind: "balance",
          x: 6,
          y: 6,
          widthTiles: 2,
          balancePartnerId: "right",
        },
        {
          platformId: "right",
          kind: "balance",
          x: 12,
          y: 6,
          widthTiles: 2,
          balancePartnerId: "left",
        },
      ]),
    );
    let state = makeEmptyPlatformsState(levelSpec);
    // Riding the left platform (top y=96, x=96..128) pulls it down and its
    // partner up; past the rope limit both detach and fall.
    const rideLeftPlatform = (fromFrame: number, toFrame: number) => {
      for (let i = fromFrame; i < toFrame; i += 1) {
        const placements = computePlatformPlacements(
          state,
          levelSpec,
          frame(i),
        );
        const leftTop = placements[0]?.y ?? 0;
        const rider = playerAt(100, leftTop - 14);
        state = resolvePlatformsState(
          state,
          levelSpec,
          [rider],
          nominalFrameMilliseconds,
          frame(i),
        ).state;
        if (state.platforms.every((p) => p.detached)) {
          break;
        }
      }
    };
    rideLeftPlatform(0, 60);
    const left = state.platforms.find((p) => p.platformId === "left");
    const right = state.platforms.find((p) => p.platformId === "right");
    expect(left?.balanceOffsetY ?? 0).toBeGreaterThan(0);
    expect(right?.balanceOffsetY ?? 0).toBeLessThan(0);

    rideLeftPlatform(60, 400);
    expect(state.platforms.some((p) => p.detached)).toBe(true);
  });
});
