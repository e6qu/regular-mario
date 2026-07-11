import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import type { LevelSpecInput, PlatformInput } from "../domain/level-spec";
import type { FrameIndex, PixelPosition } from "../domain/units";
import { VerticalMovementState } from "./movement-model";
import {
  computePlatformPlacements,
  makeEmptyPlatformsState,
  resolvePlatformsState,
} from "./platform-state";
import { makeInitialPlayerSimulationState } from "./player-state";

const frame = (value: number): FrameIndex => value as FrameIndex;
const nominalFrameMilliseconds = 1000 / 60;

function makePlatformLevelInput(
  platforms: readonly PlatformInput[],
): LevelSpecInput {
  const width = 32;
  const height = 15;
  const rows = Array.from({ length: height }, (_, rowIndex) =>
    Array.from({ length: width }, () => (rowIndex >= 13 ? "ground" : "empty")),
  );
  return {
    widthTiles: width,
    heightTiles: height,
    tileSizePixels: 16,
    tileDefinitions: [
      { tileId: "empty", collision: "empty" },
      { tileId: "ground", collision: "solid" },
    ],
    actorDefinitions: [
      { actorId: "player", role: "player-start" },
      { actorId: "gate", role: "exit" },
    ],
    tiles: rows,
    actors: [
      { entityId: "player-1", actorId: "player", x: 1, y: 12 },
      { entityId: "exit-1", actorId: "gate", x: 30, y: 12 },
    ],
    platforms,
  };
}

function requireLevelSpec(input: LevelSpecInput) {
  const result = makeLevelSpec(input);
  if (!result.ok) {
    throw new Error(
      `expected level spec: ${result.errors.map((error) => error.message).join(", ")}`,
    );
  }
  return result.value;
}

function playerAt(x: number, y: number) {
  const player = makeInitialPlayerSimulationState();
  return {
    ...player,
    position: { x: x as PixelPosition, y: y as PixelPosition },
  };
}

describe("platform state", () => {
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

  it("settles a falling player onto a platform and carries them", () => {
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
    const state = makeEmptyPlatformsState(levelSpec);
    // Platform top at frame 0 is y=96 at x=128..176; drop the player onto it.
    const falling = playerAt(140, 96 - 22);
    const resolution = resolvePlatformsState(
      state,
      levelSpec,
      falling,
      nominalFrameMilliseconds,
      frame(0),
    );
    expect(resolution.playerRiding).toBe(true);
    expect(resolution.player.movement.vertical).toBe(
      VerticalMovementState.Grounded,
    );
    expect(resolution.player.velocity.y).toBe(0);
    // Carried horizontally by the platform's motion between frames 0 and 1.
    expect(resolution.player.position.x).not.toBe(falling.position.x);
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
      bystander,
      nominalFrameMilliseconds,
      frame(0),
    ).state;
    expect(state.platforms[0]?.fallOffsetY).toBe(0);

    const rider = playerAt(140, 96 - 22);
    for (let i = 0; i < 30; i += 1) {
      state = resolvePlatformsState(
        state,
        levelSpec,
        rider,
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
    // Ride the left platform (top y=96, x=96..128).
    for (let i = 0; i < 60; i += 1) {
      const placements = computePlatformPlacements(state, levelSpec, frame(i));
      const leftTop = placements[0]?.y ?? 0;
      const rider = playerAt(100, leftTop - 22);
      state = resolvePlatformsState(
        state,
        levelSpec,
        rider,
        nominalFrameMilliseconds,
        frame(i),
      ).state;
    }
    const left = state.platforms.find((p) => p.platformId === "left");
    const right = state.platforms.find((p) => p.platformId === "right");
    expect(left?.balanceOffsetY ?? 0).toBeGreaterThan(0);
    expect(right?.balanceOffsetY ?? 0).toBeLessThan(0);

    // Keep riding until past the rope limit: both detach and fall.
    for (let i = 60; i < 400; i += 1) {
      const placements = computePlatformPlacements(state, levelSpec, frame(i));
      const leftTop = placements[0]?.y ?? 0;
      const rider = playerAt(100, leftTop - 22);
      state = resolvePlatformsState(
        state,
        levelSpec,
        rider,
        nominalFrameMilliseconds,
        frame(i),
      ).state;
      if (state.platforms.every((p) => p.detached)) {
        break;
      }
    }
    expect(state.platforms.some((p) => p.detached)).toBe(true);
  });
});
