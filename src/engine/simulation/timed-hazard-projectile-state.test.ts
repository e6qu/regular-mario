import { describe, expect, it } from "vitest";

import { makeLevelSpec, TileCollisionKind } from "../domain/level-spec";
import type { EntityId } from "../domain/identifiers";
import { makeFrameIndex } from "../domain/units";
import { makeInitialEnemyMotionState } from "./enemy-motion";
import { playerWithTestState } from "./movement-test-support";
import {
  HorizontalMovementState,
  initialMovementConstants,
  VerticalMovementState,
} from "./movement-model";
import { nominalSixtyHertzFrameDurationMilliseconds } from "./simulation-units";
import { makeEmptyEnemyInteractionState } from "./enemy-interaction";
import {
  makeEmptyTimedHazardProjectilesState,
  resolveTimedHazardProjectilesState,
} from "./timed-hazard-projectile-state";

// The two-tile sky/ground palette every fixture level here uses.
function skyGroundTileDefinitions() {
  return [
    { tileId: "sky", collision: TileCollisionKind.Empty },
    { tileId: "ground", collision: TileCollisionKind.Solid },
  ];
}

function testFrameIndex(value: number) {
  const result = makeFrameIndex(value, "test.frameIndex");

  if (!result.ok) {
    throw new Error("Expected test frame index to validate.");
  }

  return result.value;
}

// A 6-wide level with a ground floor, a player + exit, and one cannon spawner.
function hazardLevelSpec(options: {
  readonly heightTiles: number;
  readonly actorY: number;
  readonly spawnerY: number;
  readonly spawnerX?: number;
  readonly stompable?: boolean;
}) {
  const groundRowIndex = options.heightTiles - 1;
  const tiles = Array.from({ length: options.heightTiles }, (_row, y) =>
    y === groundRowIndex
      ? ["ground", "ground", "ground", "ground", "ground", "ground"]
      : ["sky", "sky", "sky", "sky", "sky", "sky"],
  );
  const result = makeLevelSpec({
    widthTiles: 6,
    heightTiles: options.heightTiles,
    tileSizePixels: 16,
    tileDefinitions: skyGroundTileDefinitions(),
    actorDefinitions: [
      { actorId: "player", role: "player-start" },
      { actorId: "exit", role: "exit" },
    ],
    tiles,
    actors: [
      { entityId: "player-1", actorId: "player", x: 1, y: options.actorY },
      { entityId: "exit-1", actorId: "exit", x: 5, y: options.actorY },
    ],
    timedHazardProjectileSpawners: [
      {
        spawnerId: "cannon-1",
        x: options.spawnerX ?? 1,
        y: options.spawnerY,
        direction: "right",
        intervalFrames: 2,
        initialDelayFrames: 1,
        speedPixelsPerSecond: 96,
        widthPixels: 8,
        heightPixels: 8,
        lifetimeFrames: 10,
        ...(options.stompable !== undefined
          ? { stompable: options.stompable }
          : {}),
      },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected hazard test level to validate.");
  }

  return result.value;
}

function timedHazardLevelSpec() {
  return hazardLevelSpec({ heightTiles: 3, actorY: 1, spawnerY: 1 });
}

// A 6-wide level with an aerial throwing enemy (Lakitu) hovering at tile
// (3, 1) and no cannon spawners, for pinning dropped-egg behavior.
function aerialThrowerLevelSpec() {
  const tiles = Array.from({ length: 5 }, (_row, y) =>
    y === 4
      ? ["ground", "ground", "ground", "ground", "ground", "ground"]
      : ["sky", "sky", "sky", "sky", "sky", "sky"],
  );
  const result = makeLevelSpec({
    widthTiles: 6,
    heightTiles: 5,
    tileSizePixels: 16,
    tileDefinitions: skyGroundTileDefinitions(),
    actorDefinitions: [
      { actorId: "player", role: "player-start" },
      { actorId: "exit", role: "exit" },
      { actorId: "aerial-thrower", role: "aerial-throwing-enemy" },
    ],
    tiles,
    actors: [
      { entityId: "player-1", actorId: "player", x: 1, y: 3 },
      { entityId: "exit-1", actorId: "exit", x: 5, y: 3 },
      { entityId: "aerial-thrower-1", actorId: "aerial-thrower", x: 3, y: 1 },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected aerial thrower test level to validate.");
  }

  return result.value;
}

function testPlayerAt(x: number, y: number) {
  return playerWithTestState({
    position: { x, y },
    velocity: { x: 0, y: 0 },
    movement: {
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Grounded,
    },
  });
}

function fallingPlayerAt(x: number, y: number) {
  return playerWithTestState({
    position: { x, y },
    velocity: { x: 0, y: 120 },
    movement: {
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Falling,
    },
  });
}

// A cannon whose projectile spawns at pixel (16, 48) — high enough above the
// floor that the player can fall onto it. `stompable` toggles Bullet Bill mode.
function stompCannonLevelSpec(stompable: boolean) {
  return hazardLevelSpec({ heightTiles: 5, actorY: 3, spawnerY: 3, stompable });
}

function emptyEnemyMotionState() {
  return {
    activeEnemyEntityIds: [],
    patrolActors: [],
    flyingActors: [],
    chasingActors: [],
    armoredActors: [],
    throwingActors: [],
    aerialThrowingActors: [],
    piranhaPlantActors: [],
  };
}

function emptyEnemyInteractionState() {
  return makeEmptyEnemyInteractionState();
}

// Run one frame of the timed-hazard resolver with the standard empty context.
function resolveHazard(
  previousState: ReturnType<typeof makeEmptyTimedHazardProjectilesState>,
  levelSpec: ReturnType<typeof hazardLevelSpec>,
  player: ReturnType<typeof testPlayerAt>,
  frame: number,
  previousPlayer: ReturnType<typeof testPlayerAt> = player,
) {
  return resolveTimedHazardProjectilesState(
    previousState,
    levelSpec,
    { brokenBlockTilePositions: [] },
    player,
    emptyEnemyMotionState(),
    emptyEnemyInteractionState(),
    initialMovementConstants,
    nominalSixtyHertzFrameDurationMilliseconds,
    testFrameIndex(frame),
    previousPlayer,
  );
}

describe("timed-hazard-projectile-state", () => {
  it("creates an empty timed hazard projectile state", () => {
    expect(makeEmptyTimedHazardProjectilesState()).toEqual({
      projectiles: [],
      playerContact: false,
      stompedProjectileCount: 0,
      hatchedPositions: [],
    });
  });

  it("spawns timed hazard projectiles from validated level spawners", () => {
    const result = resolveHazard(
      makeEmptyTimedHazardProjectilesState(),
      timedHazardLevelSpec(),
      testPlayerAt(16, 16),
      1,
    );

    expect(result.projectiles).toHaveLength(1);
    expect(result.projectiles[0]).toMatchObject({
      id: "timed-hazard-cannon-1-1",
      // A flame's flight row tracks the player's row (clamped to the 3-11
      // band), not the authored spawner row.
      position: { x: 16, y: 16 },
      velocity: { x: 96, y: 0 },
      width: 8,
      height: 8,
      active: true,
      remainingLifetimeFrames: 10,
    });
  });

  it("moves spawned hazard projectiles and reports player contact", () => {
    const levelSpec = timedHazardLevelSpec();
    // The flame spawns on the player-tracked row (the 3-row fixture clamps
    // it to row 1, y=16); place the player so its hurtbox overlaps that row.
    const first = resolveHazard(
      makeEmptyTimedHazardProjectilesState(),
      levelSpec,
      testPlayerAt(16, 8),
      1,
    );
    const second = resolveHazard(first, levelSpec, testPlayerAt(17, 8), 2);

    expect(second.projectiles[0]?.position.x).toBeGreaterThan(16);
    expect(second.playerContact).toBe(true);
  });

  it("defeats a stompable Bullet Bill the player lands on", () => {
    const levelSpec = stompCannonLevelSpec(true);
    // Frame 1: spawn the projectile at (16, 48) with the player far away (a
    // cannon won't fire a point-blank Bullet Bill).
    const spawned = resolveHazard(
      makeEmptyTimedHazardProjectilesState(),
      levelSpec,
      testPlayerAt(200, 0),
      1,
    );
    expect(spawned.projectiles).toHaveLength(1);

    // Frame 2: the player falls onto the projectile's top (y = 48).
    const stomped = resolveHazard(
      spawned,
      levelSpec,
      fallingPlayerAt(16, 34),
      2,
      fallingPlayerAt(16, 28),
    );
    // Defeated: removed, counted, and no longer a hazard.
    expect(stomped.stompedProjectileCount).toBe(1);
    expect(stomped.projectiles).toEqual([]);
    expect(stomped.playerContact).toBe(false);
  });

  it("does not fire a cannon Bullet Bill point-blank at the player", () => {
    const levelSpec = stompCannonLevelSpec(true);
    // The spawner sits at tile x=1 (16px); a player right on it gets no bill.
    const nearResult = resolveHazard(
      makeEmptyTimedHazardProjectilesState(),
      levelSpec,
      testPlayerAt(20, 0),
      1,
    );
    expect(nearResult.projectiles).toHaveLength(0);
  });

  it("fires a flame (non-stompable) even point-blank at the player", () => {
    // Bowser's flames follow the ROM: only cannon Bullet Bills hold fire when
    // the player is nearly on top of the spawner — flames always fire.
    const levelSpec = stompCannonLevelSpec(false);
    const nearResult = resolveHazard(
      makeEmptyTimedHazardProjectilesState(),
      levelSpec,
      testPlayerAt(20, 0),
      1,
    );
    expect(nearResult.projectiles).toHaveLength(1);
  });

  it("fires a cannon Bullet Bill toward the player's side of the cannon", () => {
    // The cannon is authored facing right, but the ROM's BulletBillHandler
    // aims at the player: a player left of the cannon gets a leftward bill.
    const leftLevelSpec = hazardLevelSpec({
      heightTiles: 5,
      actorY: 3,
      spawnerY: 3,
      spawnerX: 4,
      stompable: true,
    });
    const leftResult = resolveHazard(
      makeEmptyTimedHazardProjectilesState(),
      leftLevelSpec,
      testPlayerAt(0, 0),
      1,
    );
    expect(leftResult.projectiles).toHaveLength(1);
    expect(leftResult.projectiles[0]?.velocity.x).toBe(-96);

    // A player right of the cannon gets a rightward bill.
    const rightResult = resolveHazard(
      makeEmptyTimedHazardProjectilesState(),
      stompCannonLevelSpec(true),
      testPlayerAt(200, 0),
      1,
    );
    expect(rightResult.projectiles).toHaveLength(1);
    expect(rightResult.projectiles[0]?.velocity.x).toBe(96);
  });

  it("keeps a flame's authored direction regardless of the player's side", () => {
    // Flames are not aimed: an authored rightward flame fires right even with
    // the player on its left.
    const levelSpec = hazardLevelSpec({
      heightTiles: 5,
      actorY: 3,
      spawnerY: 3,
      spawnerX: 4,
      stompable: false,
    });
    const result = resolveHazard(
      makeEmptyTimedHazardProjectilesState(),
      levelSpec,
      testPlayerAt(0, 0),
      1,
    );
    expect(result.projectiles).toHaveLength(1);
    expect(result.projectiles[0]?.velocity.x).toBe(96);
  });

  it("lobs a dropped egg toward the player's side", () => {
    const levelSpec = aerialThrowerLevelSpec();
    const enemyMotion = {
      ...makeInitialEnemyMotionState(levelSpec, initialMovementConstants),
      activeEnemyEntityIds: ["aerial-thrower-1" as EntityId],
    };
    const resolveEggs = (player: ReturnType<typeof testPlayerAt>) =>
      resolveTimedHazardProjectilesState(
        makeEmptyTimedHazardProjectilesState(),
        levelSpec,
        { brokenBlockTilePositions: [] },
        player,
        enemyMotion,
        emptyEnemyInteractionState(),
        initialMovementConstants,
        nominalSixtyHertzFrameDurationMilliseconds,
        // The aerial thrower releases on its 120-frame interval.
        testFrameIndex(120),
      );

    // The thrower hovers at x=48; a player on its left gets a leftward push...
    const leftResult = resolveEggs(testPlayerAt(16, 48));
    expect(leftResult.projectiles).toHaveLength(1);
    expect(leftResult.projectiles[0]?.velocity).toEqual({
      x: -40,
      y: initialMovementConstants.aerialThrowingEnemyProjectileSpeed,
    });

    // ...and a player on its right gets a rightward push.
    const rightResult = resolveEggs(testPlayerAt(200, 48));
    expect(rightResult.projectiles[0]?.velocity).toEqual({
      x: 40,
      y: initialMovementConstants.aerialThrowingEnemyProjectileSpeed,
    });
  });

  it("leaves a non-stompable projectile as a hazard when landed on", () => {
    const levelSpec = stompCannonLevelSpec(false);
    const spawned = resolveHazard(
      makeEmptyTimedHazardProjectilesState(),
      levelSpec,
      testPlayerAt(16, 0),
      1,
    );

    const landed = resolveHazard(
      spawned,
      levelSpec,
      fallingPlayerAt(16, 34),
      2,
      fallingPlayerAt(16, 28),
    );
    // Not stompable: it survives and still harms the player.
    expect(landed.stompedProjectileCount).toBe(0);
    expect(landed.projectiles).toHaveLength(1);
    expect(landed.playerContact).toBe(true);
  });
});
