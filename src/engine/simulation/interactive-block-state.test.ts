import type { TilePoint } from "../domain/units";
import {
  ActorRole,
  makeLevelSpec,
  TileCollisionKind,
  type SpawnedPowerUpMovement,
} from "../domain/level-spec";
import { describe, expect, it } from "vitest";
import type { LevelSpec } from "../domain/level-spec";

import {
  assertValidInteractiveBlockInteractionState,
  assertValidSpawnedActorsState,
  makeEmptyInteractiveBlockInteractionState,
  makeEmptySpawnedActorsState,
  resolveInteractiveBlockInteractionState,
  resolveSpawnedActorsState,
  SpawnedActorCollectionMode,
  type SpawnedActorsState,
  stepSpawnedActorsState,
} from "./interactive-block-state";
import {
  interactiveCoinBlockLevelSpec,
  interactiveClimbableBlockLevelSpec,
  interactiveExtraLifeBlockLevelSpec,
  interactiveInvincibilityBlockLevelSpec,
  interactivePowerUpBlockLevelSpec,
  interactiveBlockLevelSpec,
  repeatableCoinBlockLevelSpec,
  cooldownCoinBlockLevelSpec,
  solidHazardBlockLevelSpec,
  makeExitActor,
  makeExitDefinition,
  makeRunnerStartActor,
  makeRunnerStartDefinition,
  makeSkyGrassTileDefinitions,
  makeUpwardMovingPlayerAt,
  playerAt,
} from "./level-test-support";
import { nominalSixtyHertzFrameDurationMilliseconds } from "./simulation-units";
import { resolveSolidTileCollisionWithInteractiveBumps } from "./solid-tile-collision";
import { makeEmptyBreakableBlockState } from "./breakable-block-state";

function tilePoint(x: number, y: number): TilePoint {
  return {
    x: x as unknown as TilePoint["x"],
    y: y as unknown as TilePoint["y"],
  };
}

// A spawned-actor literal missing its trailing validity fields, for the
// malformed-state rejection tests to build on.
function malformedSpawnedActorBase() {
  return {
    entityId: "spawned-1",
    actorId: "star-shard",
    role: ActorRole.Item,
    velocityX: 0,
    velocityY: 0,
    collectionMode: SpawnedActorCollectionMode.PlayerOverlap,
    remainingPopupFrames: 0,
    sourceBlockTilePosition: tilePoint(2, 4),
    position: { x: 0, y: 0 },
  };
}

function spawnedEmergedActorAt(
  levelSpec: ReturnType<typeof interactivePowerUpBlockLevelSpec>,
  position: {
    readonly x: number;
    readonly y: number;
  },
  velocityY?: number,
): SpawnedActorsState {
  const spawned = resolveSpawnedActorsState(
    makeEmptySpawnedActorsState(),
    levelSpec,
    [tilePoint(2, 4)],
  );

  return {
    spawnedActors: [
      {
        ...spawned.spawnedActors[0]!,
        // Past the emerge phase, so movement-phase behaviour is under test.
        remainingPopupFrames:
          0 as (typeof spawned.spawnedActors)[0]["remainingPopupFrames"],
        ...(velocityY === undefined
          ? {}
          : {
              velocityY:
                velocityY as (typeof spawned.spawnedActors)[0]["velocityY"],
            }),
        position,
      },
    ],
    lastSpawnFrameIndexByBlockKey: spawned.lastSpawnFrameIndexByBlockKey,
  };
}

function spawnedPowerUpAt(position: {
  readonly x: number;
  readonly y: number;
}): SpawnedActorsState {
  return spawnedEmergedActorAt(interactivePowerUpBlockLevelSpec(), position);
}

function expectedSpawnedActor(params: {
  readonly actorId: string;
  readonly role: ActorRole;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly collectionMode: SpawnedActorCollectionMode;
  readonly remainingPopupFrames: number;
  readonly position?: { readonly x: number; readonly y: number };
}) {
  return {
    entityId: "spawned-2-4",
    actorId: params.actorId,
    role: params.role,
    velocityX: params.velocityX,
    velocityY: params.velocityY,
    collectionMode: params.collectionMode,
    remainingPopupFrames: params.remainingPopupFrames,
    sourceBlockTilePosition: tilePoint(2, 4),
    position: params.position ?? {
      x: 32,
      y: 48,
    },
    heightPixels: 16,
    active: true,
  };
}

describe("interactive block state", () => {
  it("creates an explicit empty interactive block state", () => {
    expect(makeEmptyInteractiveBlockInteractionState()).toEqual({
      bumpedBlockTilePositions: [],
    });
  });

  it("records a bumped interactive block tile position", () => {
    expect(
      resolveInteractiveBlockInteractionState(
        makeEmptyInteractiveBlockInteractionState(),
        [tilePoint(2, 4)],
      ),
    ).toEqual({
      bumpedBlockTilePositions: [tilePoint(2, 4)],
    });
  });

  it("does not duplicate the same bumped block position", () => {
    const firstState = resolveInteractiveBlockInteractionState(
      makeEmptyInteractiveBlockInteractionState(),
      [tilePoint(2, 4)],
    );

    expect(
      resolveInteractiveBlockInteractionState(firstState, [tilePoint(2, 4)]),
    ).toEqual({
      bumpedBlockTilePositions: [tilePoint(2, 4)],
    });
  });

  it("rejects a malformed interactive block state", () => {
    expect(() =>
      assertValidInteractiveBlockInteractionState({
        bumpedBlockTilePositions: [{ x: "2", y: 4 }],
      }),
    ).toThrow(
      "Interactive block bumped position at index 0 must have numeric x and y.",
    );
  });
});

function makeCooldownBlockFirstState() {
  const levelSpec = cooldownCoinBlockLevelSpec(16);
  return {
    levelSpec,
    firstState: resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
      10,
    ),
  };
}

describe("spawned actors state", () => {
  it("creates an explicit empty spawned actors state", () => {
    expect(makeEmptySpawnedActorsState()).toEqual({
      spawnedActors: [],
      lastSpawnFrameIndexByBlockKey: {},
    });
  });

  it("spawns an item actor above a bumped interactive block", () => {
    const levelSpec = interactiveBlockLevelSpec();

    expect(
      resolveSpawnedActorsState(makeEmptySpawnedActorsState(), levelSpec, [
        tilePoint(2, 4),
      ]),
    ).toEqual({
      spawnedActors: [
        expectedSpawnedActor({
          actorId: "star-shard",
          role: ActorRole.Item,
          velocityX: 0,
          velocityY: 0,
          collectionMode: SpawnedActorCollectionMode.PlayerOverlap,
          remainingPopupFrames: 0,
        }),
      ],
      lastSpawnFrameIndexByBlockKey: { "2,4": 0 },
    });
  });

  const expectEmergerSpawn = (
    levelSpec: ReturnType<typeof interactivePowerUpBlockLevelSpec>,
    actorId: string,
    role: ActorRole,
    velocityX: number,
  ): void => {
    expect(
      resolveSpawnedActorsState(makeEmptySpawnedActorsState(), levelSpec, [
        tilePoint(2, 4),
      ]),
    ).toEqual({
      spawnedActors: [
        expectedSpawnedActor({
          actorId,
          role,
          velocityX,
          velocityY: 0,
          collectionMode: SpawnedActorCollectionMode.PlayerOverlap,
          remainingPopupFrames: 16,
          position: { x: 32, y: 64 },
        }),
      ],
      lastSpawnFrameIndexByBlockKey: { "2,4": 0 },
    });
  };

  it("spawns a moving power-up actor emerging from a bumped block", () => {
    expectEmergerSpawn(
      interactivePowerUpBlockLevelSpec(),
      "spark-cap",
      ActorRole.PowerUp,
      40,
    );
  });

  it("spawns an extra-life actor walking like the super mushroom", () => {
    expectEmergerSpawn(
      interactiveExtraLifeBlockLevelSpec(),
      "extra-life",
      ActorRole.ExtraLife,
      40,
    );
  });

  it("spawns an invincibility power-up actor moving away from the bump", () => {
    expectEmergerSpawn(
      interactiveInvincibilityBlockLevelSpec(),
      "invincibility",
      ActorRole.InvincibilityPowerUp,
      60,
    );
  });

  it("spawns a climbable actor above a bumped interactive block", () => {
    const levelSpec = interactiveClimbableBlockLevelSpec();

    expect(
      resolveSpawnedActorsState(makeEmptySpawnedActorsState(), levelSpec, [
        tilePoint(2, 4),
      ]),
    ).toEqual({
      spawnedActors: [
        expectedSpawnedActor({
          actorId: "climbable-vine",
          role: ActorRole.Climbable,
          velocityX: 0,
          velocityY: 0,
          collectionMode: SpawnedActorCollectionMode.None,
          remainingPopupFrames: 0,
        }),
      ],
      lastSpawnFrameIndexByBlockKey: { "2,4": 0 },
    });
  });

  it("steps a state holding a spawned climbable (vine blocks must not crash the next frame)", () => {
    const levelSpec = interactiveClimbableBlockLevelSpec();
    const spawned = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
    );

    // The climbable's collection mode is None; validation and the next
    // frame's step must both accept it.
    expect(() => assertValidSpawnedActorsState(spawned)).not.toThrow();
    const stepped = stepSpawnedActorsState(
      spawned,
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      makeEmptyBreakableBlockState(),
    );
    expect(stepped.spawnedActors).toHaveLength(1);
  });

  it("rejects a spawned actor without a positive heightPixels", () => {
    expect(() =>
      assertValidSpawnedActorsState({
        lastSpawnFrameIndexByBlockKey: {},
        spawnedActors: [
          { ...malformedSpawnedActorBase(), active: true, heightPixels: 0 },
        ],
      }),
    ).toThrow(
      "Spawned actor at index 0 must have a positive numeric heightPixels.",
    );
  });

  it("uses profile-backed movement constants for spawned power-up actors", () => {
    const spawnedPowerUpMovement: SpawnedPowerUpMovement = {
      velocityX: 48 as SpawnedPowerUpMovement["velocityX"],
      gravity: 960 as SpawnedPowerUpMovement["gravity"],
      terminalFallVelocityY:
        320 as SpawnedPowerUpMovement["terminalFallVelocityY"],
    };
    const levelSpec = {
      ...interactivePowerUpBlockLevelSpec(),
      spawnedPowerUpMovement,
    };
    const spawned = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
    );
    const airborneSpawned: SpawnedActorsState = {
      spawnedActors: [
        {
          ...spawned.spawnedActors[0]!,
          remainingPopupFrames:
            0 as (typeof spawned.spawnedActors)[0]["remainingPopupFrames"],
          position: {
            x: 32,
            y: 32,
          },
        },
      ],
      lastSpawnFrameIndexByBlockKey: spawned.lastSpawnFrameIndexByBlockKey,
    };
    const stepped = stepSpawnedActorsState(
      airborneSpawned,
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      makeEmptyBreakableBlockState(),
    );

    expect(spawned.spawnedActors[0]?.velocityX).toBe(48);
    expect(stepped.spawnedActors[0]?.velocityY).toBeCloseTo(16);
    expect(stepped.spawnedActors[0]?.position.x).toBeCloseTo(32 + 48 / 60);
  });

  it("spawns a rising coin popup actor above a bumped interactive block", () => {
    const levelSpec = interactiveCoinBlockLevelSpec();

    expect(
      resolveSpawnedActorsState(makeEmptySpawnedActorsState(), levelSpec, [
        tilePoint(2, 4),
      ]),
    ).toEqual({
      spawnedActors: [
        expectedSpawnedActor({
          actorId: "coin",
          role: ActorRole.Coin,
          velocityX: 0,
          velocityY: -240,
          collectionMode: SpawnedActorCollectionMode.OnSpawn,
          remainingPopupFrames: 24,
        }),
      ],
      lastSpawnFrameIndexByBlockKey: { "2,4": 0 },
    });
  });

  it("emerges a freshly spawned power-up straight up before it moves", () => {
    const levelSpec = interactivePowerUpBlockLevelSpec();
    const spawned = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
    );
    const stepped = stepSpawnedActorsState(
      spawned,
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      makeEmptyBreakableBlockState(),
    ).spawnedActors[0];
    // Emerging: rises straight up, no horizontal drift yet.
    expect(stepped?.position.x).toBeCloseTo(32);
    expect(stepped?.position.y).toBeCloseTo(64 - 60 / 60);
  });

  it("moves spawned power-up actors horizontally at deterministic frame rate", () => {
    const levelSpec = interactivePowerUpBlockLevelSpec();

    expect(
      stepSpawnedActorsState(
        spawnedPowerUpAt({ x: 32, y: 48 }),
        nominalSixtyHertzFrameDurationMilliseconds,
        levelSpec,
        makeEmptyBreakableBlockState(),
      ).spawnedActors[0]?.position.x,
    ).toBeCloseTo(32 + 40 / 60);
  });

  it("applies deterministic gravity to spawned power-up actors", () => {
    const levelSpec = interactivePowerUpBlockLevelSpec();
    const stepped = stepSpawnedActorsState(
      spawnedPowerUpAt({ x: 48, y: 48 }),
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      makeEmptyBreakableBlockState(),
    );

    expect(stepped.spawnedActors[0]?.velocityY).toBeCloseTo(15);
    expect(stepped.spawnedActors[0]?.position.y).toBeCloseTo(48 + 15 / 60);
  });

  it("lands spawned power-up actors on solid tiles", () => {
    const levelSpec = interactivePowerUpBlockLevelSpec();
    let stepped = spawnedPowerUpAt({ x: 48, y: 48 });

    for (let frame = 0; frame < 40; frame += 1) {
      stepped = stepSpawnedActorsState(
        stepped,
        nominalSixtyHertzFrameDurationMilliseconds,
        levelSpec,
        makeEmptyBreakableBlockState(),
      );
    }

    expect(stepped.spawnedActors[0]?.position.y).toBe(64);
    expect(stepped.spawnedActors[0]?.velocityY).toBe(0);
  });

  it("walks the spawned extra-life with super-mushroom physics", () => {
    const levelSpec = interactiveExtraLifeBlockLevelSpec();
    const stepped = stepSpawnedActorsState(
      spawnedEmergedActorAt(levelSpec, { x: 48, y: 48 }),
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      makeEmptyBreakableBlockState(),
    );

    // Same walking speed and gravity as the super mushroom.
    expect(stepped.spawnedActors[0]?.position.x).toBeCloseTo(48 + 40 / 60);
    expect(stepped.spawnedActors[0]?.velocityY).toBeCloseTo(15);
  });

  // One landing step for a spawned actor dropped just above the floor.
  function landingStepFor(levelSpec: LevelSpec) {
    return stepSpawnedActorsState(
      spawnedEmergedActorAt(levelSpec, { x: 40, y: 63.9 }, 240),
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      makeEmptyBreakableBlockState(),
    );
  }

  it("lands the spawned extra-life without bouncing", () => {
    const stepped = landingStepFor(interactiveExtraLifeBlockLevelSpec());

    expect(stepped.spawnedActors[0]?.position.y).toBe(64);
    expect(stepped.spawnedActors[0]?.velocityY).toBe(0);
  });

  it("bounces the invincibility star back up whenever it lands", () => {
    const stepped = landingStepFor(interactiveInvincibilityBlockLevelSpec());

    // The star lands on the floor and relaunches upward while still moving
    // horizontally away from the bumped block.
    expect(stepped.spawnedActors[0]?.position.y).toBe(64);
    expect(stepped.spawnedActors[0]?.velocityY).toBe(-240);
    expect(stepped.spawnedActors[0]?.position.x).toBeCloseTo(40 + 60 / 60);
  });

  it("keeps the invincibility star bouncing across repeated landings", () => {
    const levelSpec = interactiveInvincibilityBlockLevelSpec();
    let state = spawnedEmergedActorAt(levelSpec, { x: 48, y: 48 });
    let bounceCount = 0;

    for (let frame = 0; frame < 240; frame += 1) {
      const previousVelocityY = state.spawnedActors[0]!.velocityY;
      state = stepSpawnedActorsState(
        state,
        nominalSixtyHertzFrameDurationMilliseconds,
        levelSpec,
        makeEmptyBreakableBlockState(),
      );

      if (previousVelocityY > 0 && state.spawnedActors[0]!.velocityY < 0) {
        bounceCount += 1;
      }
    }

    // The star must never come to rest: repeated ground contacts each launch
    // it upward again.
    expect(bounceCount).toBeGreaterThanOrEqual(2);
    expect(state.spawnedActors[0]!.velocityY).not.toBe(0);
  });

  it("reverses spawned power-up actors at solid walls", () => {
    const levelSpec = solidHazardBlockLevelSpec();
    const source = spawnedPowerUpAt({ x: 48, y: 48 });
    const nearWall: SpawnedActorsState = {
      spawnedActors: [
        {
          ...source.spawnedActors[0]!,
          position: {
            x: 15.5,
            y: 64,
          },
        },
      ],
      lastSpawnFrameIndexByBlockKey: source.lastSpawnFrameIndexByBlockKey,
    };
    const stepped = stepSpawnedActorsState(
      nearWall,
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      makeEmptyBreakableBlockState(),
    );

    expect(stepped.spawnedActors[0]?.position.x).toBe(16);
    expect(stepped.spawnedActors[0]?.velocityX).toBe(-40);
  });

  it("moves spawned block coins through a full up-and-down arc before vanishing", () => {
    const levelSpec = interactiveCoinBlockLevelSpec();
    const spawned = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
    );
    const step = (state: SpawnedActorsState): SpawnedActorsState =>
      stepSpawnedActorsState(
        state,
        nominalSixtyHertzFrameDurationMilliseconds,
        levelSpec,
        makeEmptyBreakableBlockState(),
      );
    const firstFrame = step(spawned);

    expect(firstFrame.spawnedActors[0]?.position.y).toBeCloseTo(48 - 240 / 60);
    expect(firstFrame.spawnedActors[0]?.remainingPopupFrames).toBe(23);
    expect(firstFrame.spawnedActors[0]?.active).toBe(true);

    let apexFrame = firstFrame;
    for (let frame = 0; frame < 11; frame += 1) {
      apexFrame = step(apexFrame);
    }

    // Apex after half the popup lifetime: 48 pixels above the block top.
    expect(apexFrame.spawnedActors[0]?.position.y).toBeCloseTo(48 - 48);
    expect(apexFrame.spawnedActors[0]?.active).toBe(true);

    let finalFrame = apexFrame;
    for (let frame = 0; frame < 12; frame += 1) {
      finalFrame = step(finalFrame);
    }

    // The descent retraces the rise back to the block top, then the coin
    // vanishes.
    expect(finalFrame.spawnedActors[0]?.position.y).toBeCloseTo(48);
    expect(finalFrame.spawnedActors[0]?.remainingPopupFrames).toBe(0);
    expect(finalFrame.spawnedActors[0]?.active).toBe(false);
  });

  it("does not spawn an actor for a block without contents", () => {
    const levelSpec = interactiveBlockLevelSpec();

    expect(
      resolveSpawnedActorsState(makeEmptySpawnedActorsState(), levelSpec, [
        tilePoint(1, 4),
      ]),
    ).toEqual({
      spawnedActors: [],
      lastSpawnFrameIndexByBlockKey: {},
    });
  });

  it("does not spawn the same actor twice", () => {
    const levelSpec = interactiveBlockLevelSpec();
    const firstState = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
    );

    expect(
      resolveSpawnedActorsState(firstState, levelSpec, [tilePoint(2, 4)]),
    ).toEqual(firstState);
  });

  it("spawns repeated coin popups up to an explicit block content limit", () => {
    const levelSpec = repeatableCoinBlockLevelSpec();
    const firstState = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
    );
    const secondState = resolveSpawnedActorsState(firstState, levelSpec, [
      tilePoint(2, 4),
    ]);
    const thirdState = resolveSpawnedActorsState(secondState, levelSpec, [
      tilePoint(2, 4),
    ]);
    const cappedState = resolveSpawnedActorsState(thirdState, levelSpec, [
      tilePoint(2, 4),
    ]);

    expect(thirdState.spawnedActors.map((actor) => actor.entityId)).toEqual([
      "spawned-2-4",
      "spawned-2-4-2",
      "spawned-2-4-3",
    ]);
    expect(
      thirdState.spawnedActors.map((actor) => actor.sourceBlockTilePosition),
    ).toEqual([tilePoint(2, 4), tilePoint(2, 4), tilePoint(2, 4)]);
    expect(cappedState).toEqual(thirdState);
  });

  it("suppresses a second spawn on the same frame when a cooldown is set", () => {
    const { levelSpec, firstState } = makeCooldownBlockFirstState();
    const secondState = resolveSpawnedActorsState(
      firstState,
      levelSpec,
      [tilePoint(2, 4)],
      10,
    );

    expect(firstState.spawnedActors).toHaveLength(1);
    expect(secondState.spawnedActors).toHaveLength(1);
    expect(secondState.lastSpawnFrameIndexByBlockKey["2,4"]).toBe(10);
  });

  it("allows a second spawn after the cooldown has elapsed", () => {
    const { levelSpec, firstState } = makeCooldownBlockFirstState();
    const secondState = resolveSpawnedActorsState(
      firstState,
      levelSpec,
      [tilePoint(2, 4)],
      26,
    );

    expect(firstState.spawnedActors).toHaveLength(1);
    expect(secondState.spawnedActors).toHaveLength(2);
    expect(secondState.lastSpawnFrameIndexByBlockKey["2,4"]).toBe(26);
  });

  it("suppresses spawn on the frame before the cooldown expires", () => {
    const { levelSpec, firstState } = makeCooldownBlockFirstState();
    const blockedState = resolveSpawnedActorsState(
      firstState,
      levelSpec,
      [tilePoint(2, 4)],
      25,
    );

    expect(blockedState.spawnedActors).toHaveLength(1);
    expect(blockedState.lastSpawnFrameIndexByBlockKey["2,4"]).toBe(10);
  });

  it("rejects a malformed spawned actors state", () => {
    expect(() =>
      assertValidSpawnedActorsState({
        lastSpawnFrameIndexByBlockKey: {},
        spawnedActors: [malformedSpawnedActorBase()],
      }),
    ).toThrow("Spawned actor at index 0 must have an active boolean.");
  });

  it("rejects a spawned actor without numeric velocity", () => {
    expect(() =>
      assertValidSpawnedActorsState({
        lastSpawnFrameIndexByBlockKey: {},
        spawnedActors: [
          {
            entityId: "spawned-1",
            actorId: "star-shard",
            role: ActorRole.Item,
            position: { x: 0, y: 0 },
            velocityY: 0,
            collectionMode: SpawnedActorCollectionMode.PlayerOverlap,
            remainingPopupFrames: 0,
            active: true,
          },
        ],
      }),
    ).toThrow("Spawned actor at index 0 must have a numeric velocityX.");
  });
});

// A taller level whose beanstalk block sits low enough (row 12) that the
// eight-tile growth cap binds before the row-2 HUD clamp does.
function tallClimbableBlockLevelSpec(): LevelSpec {
  const skyRowCount = 12;
  const result = makeLevelSpec({
    widthTiles: 6,
    heightTiles: 14,
    tileSizePixels: 16,
    tileDefinitions: [
      ...makeSkyGrassTileDefinitions(),
      {
        tileId: "beanstalk-block",
        collision: TileCollisionKind.Interactive,
        contentsActorId: "climbable-vine",
      },
    ],
    actorDefinitions: [
      makeRunnerStartDefinition(),
      { actorId: "climbable-vine", role: ActorRole.Climbable },
      makeExitDefinition(),
    ],
    tiles: [
      ...Array.from({ length: skyRowCount }, () => [
        "sky",
        "sky",
        "sky",
        "sky",
        "sky",
        "sky",
      ]),
      ["sky", "grass", "beanstalk-block", "sky", "sky", "sky"],
      ["grass", "grass", "grass", "grass", "grass", "grass"],
    ],
    actors: [makeRunnerStartActor(), makeExitActor(5)],
  });

  if (!result.ok) {
    throw new Error("Expected tall climbable block level to validate.");
  }

  return result.value;
}

describe("spawned climbable growth", () => {
  const step = (
    state: SpawnedActorsState,
    levelSpec: LevelSpec,
  ): SpawnedActorsState =>
    stepSpawnedActorsState(
      state,
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      makeEmptyBreakableBlockState(),
    );

  it("grows the vine top upward half a pixel per frame with the bottom anchored to the block", () => {
    const levelSpec = interactiveClimbableBlockLevelSpec();
    const spawned = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
    );

    const once = step(spawned, levelSpec).spawnedActors[0]!;
    // The original raises the vine top one pixel on two frames out of every
    // four: half a pixel per 60 Hz frame.
    expect(once.position.y).toBeCloseTo(47.5);
    expect(once.heightPixels).toBeCloseTo(16.5);
    // The bottom stays anchored to the bumped block's top edge.
    expect(once.position.y + once.heightPixels).toBeCloseTo(64);

    const twice = step(step(spawned, levelSpec), levelSpec).spawnedActors[0]!;
    expect(twice.position.y).toBeCloseTo(47);
    expect(twice.heightPixels).toBeCloseTo(17);

    // Stepping must not mutate the previous frame's state.
    expect(spawned.spawnedActors[0]!.position.y).toBe(48);
    expect(spawned.spawnedActors[0]!.heightPixels).toBe(16);
  });

  it("stops growing once the vine top is eight tiles above the block top", () => {
    const levelSpec = tallClimbableBlockLevelSpec();
    let state = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 12)],
    );

    // 224 frames grow the remaining 112 pixels; run past that to prove the
    // cap holds.
    for (let frame = 0; frame < 300; frame += 1) {
      state = step(state, levelSpec);
    }

    const grown = state.spawnedActors[0]!;
    // Top at (12 - 8) * 16, i.e. eight tiles above the block top at 192.
    expect(grown.position.y).toBe(64);
    expect(grown.heightPixels).toBe(128);

    const afterCap = step(state, levelSpec).spawnedActors[0]!;
    expect(afterCap.position.y).toBe(64);
    expect(afterCap.heightPixels).toBe(128);
  });

  it("clamps growth at the level's row 2 so the vine never enters the HUD band", () => {
    // The default fixture's block sits at row 4, so eight tiles of growth
    // would overshoot the level top; the row-2 clamp must bind instead.
    const levelSpec = interactiveClimbableBlockLevelSpec();
    let state = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
    );

    for (let frame = 0; frame < 100; frame += 1) {
      state = step(state, levelSpec);
      expect(state.spawnedActors[0]!.position.y).toBeGreaterThanOrEqual(32);
    }

    const grown = state.spawnedActors[0]!;
    expect(grown.position.y).toBe(32);
    expect(grown.heightPixels).toBe(32);
  });

  it("keeps every grown frame valid and replay-deterministic", () => {
    const levelSpec = interactiveClimbableBlockLevelSpec();
    const spawned = resolveSpawnedActorsState(
      makeEmptySpawnedActorsState(),
      levelSpec,
      [tilePoint(2, 4)],
    );

    const runFrames = (frameCount: number): SpawnedActorsState => {
      let state = spawned;
      for (let frame = 0; frame < frameCount; frame += 1) {
        state = step(state, levelSpec);
        assertValidSpawnedActorsState(state);
      }
      return state;
    };

    // Two identical runs from the same spawn state land on identical states.
    expect(runFrames(40)).toEqual(runFrames(40));
  });
});

describe("interactive block solid collision", () => {
  it("reports an interactive block bump when the player hits it from below", () => {
    const levelSpec = interactiveBlockLevelSpec();
    const previousPlayer = playerAt({
      x: 32,
      y: 80,
    });
    const movedPlayer = makeUpwardMovingPlayerAt({ x: 32, y: 80 });

    const result = resolveSolidTileCollisionWithInteractiveBumps(
      previousPlayer,
      movedPlayer,
      levelSpec,
    );

    expect(result.player.position.y).toBe(80);
    expect(result.bumpedInteractiveBlocks).toEqual([tilePoint(2, 4)]);
  });

  it("does not report a bump for a non-interactive solid tile", () => {
    const levelSpec = interactiveBlockLevelSpec();
    const previousPlayer = playerAt({
      x: 16,
      y: 80,
    });
    const movedPlayer = makeUpwardMovingPlayerAt({ x: 16, y: 80 });

    const result = resolveSolidTileCollisionWithInteractiveBumps(
      previousPlayer,
      movedPlayer,
      levelSpec,
    );

    expect(result.player.position.y).toBe(80);
    expect(result.bumpedInteractiveBlocks).toEqual([]);
  });
});
