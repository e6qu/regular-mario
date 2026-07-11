import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import type { LevelSpecInput } from "../domain/level-spec";
import type { PixelPosition, VelocityPixelsPerSecond } from "../domain/units";
import {
  AerialFrenzyKind,
  liveAerialFrenzyEntities,
  makeEmptyAerialFrenzyState,
  resolveAerialFrenzyState,
} from "./aerial-frenzy-state";
import { initialMovementConstants } from "./movement-model";
import { makeInitialPlayerSimulationState } from "./player-state";
import { makeInitialPseudoRandomState } from "./pseudo-random";

const nominalFrameSeconds = 1 / 60;

function makeFrenzyLevelInput(
  overrides: Partial<LevelSpecInput> = {},
): LevelSpecInput {
  const width = 64;
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
      { entityId: "exit-1", actorId: "gate", x: 62, y: 12 },
    ],
    ...overrides,
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

describe("aerial frenzy", () => {
  it("spawns leaping cheeps inside the flying-cheep region and arcs them", () => {
    const levelSpec = requireLevelSpec(
      makeFrenzyLevelInput({
        flyingCheepFrenzy: { startTileX: 4, endTileX: 40 },
      }),
    );
    const player = playerAt(10 * 16, 12 * 16);
    let state = makeEmptyAerialFrenzyState();
    let resolution = resolveAerialFrenzyState(
      state,
      levelSpec,
      player,
      player,
      makeInitialPseudoRandomState(),
      initialMovementConstants,
      nominalFrameSeconds,
      0,
    );
    state = resolution.state;
    const spawned = liveAerialFrenzyEntities(state);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.kind).toBe(AerialFrenzyKind.FlyingCheep);
    expect(spawned[0]?.velocity.y ?? 0).toBeLessThan(0);

    // The leap decelerates under gravity across frames.
    for (let i = 1; i <= 30; i += 1) {
      resolution = resolveAerialFrenzyState(
        state,
        levelSpec,
        player,
        player,
        makeInitialPseudoRandomState(),
        initialMovementConstants,
        nominalFrameSeconds,
        i,
      );
      state = resolution.state;
    }
    const arced = liveAerialFrenzyEntities(state);
    expect(arced[0]?.velocity.y ?? -1).toBeGreaterThan(
      spawned[0]?.velocity.y ?? 0,
    );
  });

  it("spawns bullet bills ahead of the player at their height", () => {
    const levelSpec = requireLevelSpec(
      makeFrenzyLevelInput({
        bulletBillFrenzy: { startTileX: 4, endTileX: 40 },
      }),
    );
    const player = playerAt(10 * 16, 12 * 16);
    const resolution = resolveAerialFrenzyState(
      makeEmptyAerialFrenzyState(),
      levelSpec,
      player,
      player,
      makeInitialPseudoRandomState(),
      initialMovementConstants,
      nominalFrameSeconds,
      0,
    );
    const spawned = liveAerialFrenzyEntities(resolution.state);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.kind).toBe(AerialFrenzyKind.BulletBill);
    expect(spawned[0]?.position.x ?? 0).toBeGreaterThan(player.position.x);
    expect(spawned[0]?.velocity.x ?? 0).toBeLessThan(0);
  });

  it("does not spawn outside the region", () => {
    const levelSpec = requireLevelSpec(
      makeFrenzyLevelInput({
        bulletBillFrenzy: { startTileX: 30, endTileX: 40 },
      }),
    );
    const player = playerAt(2 * 16, 12 * 16);
    const resolution = resolveAerialFrenzyState(
      makeEmptyAerialFrenzyState(),
      levelSpec,
      player,
      player,
      makeInitialPseudoRandomState(),
      initialMovementConstants,
      nominalFrameSeconds,
      0,
    );
    expect(liveAerialFrenzyEntities(resolution.state)).toHaveLength(0);
  });

  it("stomping an entity removes it and reports the stomp; side contact harms", () => {
    const levelSpec = requireLevelSpec(
      makeFrenzyLevelInput({
        bulletBillFrenzy: { startTileX: 4, endTileX: 40 },
      }),
    );
    const player = playerAt(10 * 16, 12 * 16);
    let resolution = resolveAerialFrenzyState(
      makeEmptyAerialFrenzyState(),
      levelSpec,
      player,
      player,
      makeInitialPseudoRandomState(),
      initialMovementConstants,
      nominalFrameSeconds,
      0,
    );
    const bullet = liveAerialFrenzyEntities(resolution.state)[0];
    if (bullet === undefined) {
      throw new Error("expected a spawned bullet");
    }

    // A falling player whose feet cross the bullet's top stomps it.
    const above = {
      ...playerAt(bullet.position.x, bullet.position.y - 30),
      velocity: {
        x: 0 as VelocityPixelsPerSecond,
        y: 120 as VelocityPixelsPerSecond,
      },
    };
    const landing = {
      ...above,
      position: {
        x: bullet.position.x as PixelPosition,
        y: (bullet.position.y - above.collider.height + 4) as PixelPosition,
      },
    };
    resolution = resolveAerialFrenzyState(
      resolution.state,
      levelSpec,
      above,
      landing,
      makeInitialPseudoRandomState(),
      initialMovementConstants,
      nominalFrameSeconds,
      1,
    );
    expect(resolution.stompedCount).toBe(1);
    expect(resolution.playerContacted).toBe(false);

    // Side contact (not falling) harms instead.
    const sideState = makeEmptyAerialFrenzyState();
    const sideResolution = resolveAerialFrenzyState(
      sideState,
      levelSpec,
      player,
      player,
      makeInitialPseudoRandomState(),
      initialMovementConstants,
      nominalFrameSeconds,
      0,
    );
    const sideBullet = liveAerialFrenzyEntities(sideResolution.state)[0];
    if (sideBullet === undefined) {
      throw new Error("expected a spawned bullet");
    }
    const touching = playerAt(sideBullet.position.x, sideBullet.position.y);
    const touchedResolution = resolveAerialFrenzyState(
      sideResolution.state,
      levelSpec,
      touching,
      touching,
      makeInitialPseudoRandomState(),
      initialMovementConstants,
      nominalFrameSeconds,
      1,
    );
    expect(touchedResolution.playerContacted).toBe(true);
  });
});
