import { ActorRole } from "../domain/level-spec";
import {
  ArmoredEnemyBehavior,
  ChasingEnemyBehavior,
  EnemyPatrolDirection,
} from "./enemy-motion";
import { describe, expect, it } from "vitest";

import { makeLevelSpec, type LevelSpec } from "../domain/level-spec";
import type { EntityId } from "../domain/identifiers";
import {
  assertValidEnemyMotionState,
  makeInitialEnemyMotionState,
  requireArmoredEnemyActorState,
  requireChasingEnemyActorState,
  requireEnemyPatrolActorState,
  requireFlyingEnemyActorState,
  shellReviveShakeOffsetPixels,
  stopDefeatedEnemyMotionState,
  stepEnemyMotionState,
  type EnemyMotionState,
} from "./enemy-motion";
import type { FrameIndex } from "../domain/units";
import {
  makeEmptyEnemyInteractionState,
  type EnemyInteractionState,
} from "./enemy-interaction";
import {
  initialMovementConstants,
  swimmingMovementConstants,
} from "./movement-model";
import { playerAt } from "./level-test-support";
import { testFrameDurationMilliseconds } from "./movement-test-support";
import { makeTileRun } from "../levels/level-builder";
import {
  makeExitActor,
  makeExitDefinition,
  makeRunnerStartActor,
  makeRunnerStartDefinition,
  makeSkyGrassStoneTileDefinitions,
  makeSkyGroundTiles,
} from "./level-test-support";
import type { PlayerSimulationState } from "./player-state";

function makeRouteLevelSpec(input: {
  readonly role: ActorRole;
  readonly actorId: string;
  readonly entityId: string;
  readonly enemyX: number;
  readonly enemyY: number;
  readonly tiles?: readonly (readonly string[])[];
  readonly enemyPatrolSpeed?: number;
}): LevelSpec {
  const tiles = input.tiles ?? makeSkyGroundTiles(6);
  const firstTileRow = tiles[0];

  if (firstTileRow === undefined) {
    throw new Error("Route test level must include at least one tile row.");
  }

  const widthTiles = firstTileRow.length;
  const baseInput = {
    widthTiles,
    heightTiles: tiles.length,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassStoneTileDefinitions(),
    actorDefinitions: [
      makeRunnerStartDefinition(),
      {
        actorId: input.actorId,
        role: input.role,
      },
      makeExitDefinition(),
    ],
    tiles,
    actors: [
      makeRunnerStartActor(),
      {
        entityId: input.entityId,
        actorId: input.actorId,
        x: input.enemyX,
        y: input.enemyY,
      },
      makeExitActor(widthTiles - 1),
    ],
  };
  const result = makeLevelSpec(
    input.enemyPatrolSpeed === undefined
      ? baseInput
      : {
          ...baseInput,
          enemyPatrolSpeedByEntityId: {
            [input.entityId]: input.enemyPatrolSpeed,
          },
        },
  );

  if (!result.ok) {
    throw new Error("Expected route test level to validate.");
  }

  return result.value;
}

function patrolLevelSpec(input: {
  readonly tiles: readonly (readonly string[])[];
  readonly enemyX: number;
  readonly enemyPatrolSpeed?: number;
}): LevelSpec {
  return makeRouteLevelSpec({
    role: ActorRole.Enemy,
    actorId: "beetle",
    entityId: "beetle-1",
    enemyX: input.enemyX,
    enemyY: 4,
    tiles: input.tiles,
    ...(input.enemyPatrolSpeed === undefined
      ? {}
      : { enemyPatrolSpeed: input.enemyPatrolSpeed }),
  });
}

function flatPatrolLevelSpec(enemyX: number): LevelSpec {
  return makeRouteLevelSpec({
    role: ActorRole.Enemy,
    actorId: "beetle",
    entityId: "beetle-1",
    enemyX,
    enemyY: 4,
  });
}

function wideFlatPatrolLevelSpec(enemyX: number): LevelSpec {
  return makeRouteLevelSpec({
    role: ActorRole.Enemy,
    actorId: "beetle",
    entityId: "beetle-1",
    enemyX,
    enemyY: 4,
    tiles: makeSkyGroundTiles(40),
  });
}

function flyingEnemyRouteLevelSpec(
  enemyX: number,
  enemyY: number,
  tiles?: readonly (readonly string[])[],
): LevelSpec {
  return makeRouteLevelSpec({
    role: ActorRole.FlyingEnemy,
    actorId: "glide-wasp",
    entityId: "wasp-1",
    enemyX,
    enemyY,
    ...(tiles === undefined ? {} : { tiles }),
  });
}

function chasingEnemyRouteLevelSpec(
  enemyX: number,
  enemyY: number,
  tiles?: readonly (readonly string[])[],
): LevelSpec {
  return makeRouteLevelSpec({
    role: ActorRole.ChasingEnemy,
    actorId: "spike-hunter",
    entityId: "hunter-1",
    enemyX,
    enemyY,
    ...(tiles === undefined ? {} : { tiles }),
  });
}

function armoredEnemyRouteLevelSpec(
  enemyX: number,
  enemyY: number,
  tiles?: readonly (readonly string[])[],
): LevelSpec {
  return makeRouteLevelSpec({
    role: ActorRole.ArmoredEnemy,
    actorId: "shell-crab",
    entityId: "crab-1",
    enemyX,
    enemyY,
    ...(tiles === undefined ? {} : { tiles }),
  });
}

function throwingEnemyRouteLevelSpec(
  enemyX: number,
  enemyY: number,
): LevelSpec {
  return makeRouteLevelSpec({
    role: ActorRole.ThrowingEnemy,
    actorId: "thrower",
    entityId: "thrower-1",
    enemyX,
    enemyY,
  });
}

function aerialThrowingEnemyRouteLevelSpec(
  enemyX: number,
  enemyY: number,
): LevelSpec {
  return makeRouteLevelSpec({
    role: ActorRole.AerialThrowingEnemy,
    actorId: "aerial-thrower",
    entityId: "aerial-thrower-1",
    enemyX,
    enemyY,
  });
}

function piranhaRouteLevelSpec(enemyX: number, enemyY: number): LevelSpec {
  return makeRouteLevelSpec({
    role: ActorRole.PiranhaPlant,
    actorId: "biter",
    entityId: "biter-1",
    enemyX,
    enemyY,
    tiles: makeSkyGroundTiles(12),
  });
}

function stepPiranha(
  levelSpec: LevelSpec,
  frames: number,
  player: PlayerSimulationState,
): EnemyMotionState {
  let state = enemyMotionFor(levelSpec);
  for (let frame = 0; frame < frames; frame += 1) {
    state = stepEnemyMotionState(
      state,
      levelSpec,
      makeEmptyEnemyInteractionState(),
      testFrameDurationMilliseconds(1_000),
      initialMovementConstants,
      player,
      (frame + 1) as FrameIndex,
    );
  }
  return state;
}

function enemyMotionFor(levelSpec: LevelSpec) {
  return makeInitialEnemyMotionState(levelSpec, initialMovementConstants);
}

function stepFreshRouteEnemy(
  levelSpec: LevelSpec,
  options?: {
    readonly frameDurationMilliseconds?: number;
    readonly player?: PlayerSimulationState;
    readonly frameIndex?: FrameIndex;
    readonly interactionState?: EnemyInteractionState;
  },
): EnemyMotionState {
  return stepEnemyMotionState(
    enemyMotionFor(levelSpec),
    levelSpec,
    options?.interactionState ?? makeEmptyEnemyInteractionState(),
    testFrameDurationMilliseconds(options?.frameDurationMilliseconds ?? 1_000),
    initialMovementConstants,
    options?.player ?? playerAt({ x: 16, y: 56 }),
    options?.frameIndex ?? (1 as FrameIndex),
  );
}

function makeNudgedShellState(levelSpec: LevelSpec): EnemyMotionState {
  return stopDefeatedEnemyMotionState(
    enemyMotionFor(levelSpec),
    levelSpec,
    {
      ...makeEmptyEnemyInteractionState(),
      nudgedShellEnemyEntityIds: ["crab-1" as EntityId],
      nudgedShellDirectionByEntityId: new Map([
        ["crab-1" as EntityId, EnemyPatrolDirection.Right],
      ]),
    },
    initialMovementConstants,
  );
}

function stepNominalMovingShell(
  levelSpec: LevelSpec,
  shelledState: EnemyMotionState = makeNudgedShellState(levelSpec),
): EnemyMotionState {
  return stepEnemyMotionState(
    shelledState,
    levelSpec,
    makeEmptyEnemyInteractionState(),
    testFrameDurationMilliseconds(16.666_666_667),
    initialMovementConstants,
    playerAt({ x: 0, y: 64 }),
    1 as FrameIndex,
  );
}

function restingShellState(levelSpec: LevelSpec): EnemyMotionState {
  return stopDefeatedEnemyMotionState(
    stepFreshRouteEnemy(levelSpec),
    levelSpec,
    {
      ...makeEmptyEnemyInteractionState(),
      shelledEnemyEntityIds: ["crab-1" as EntityId],
    },
    initialMovementConstants,
  );
}

function stepEnemyMotionFrames(
  levelSpec: LevelSpec,
  state: EnemyMotionState,
  frames: number,
): EnemyMotionState {
  let next = state;
  for (let frame = 0; frame < frames; frame += 1) {
    next = stepEnemyMotionState(
      next,
      levelSpec,
      makeEmptyEnemyInteractionState(),
      testFrameDurationMilliseconds(16.666_666_667),
      initialMovementConstants,
      playerAt({ x: 0, y: 64 }),
      (frame + 2) as FrameIndex,
    );
  }
  return next;
}

function wallAtColumn1Tiles(
  widthTiles: number,
): readonly (readonly string[])[] {
  return [
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    ["sky", "stone", ...makeTileRun("sky", widthTiles - 2)],
    makeTileRun("grass", widthTiles),
  ];
}

function wallAtColumn4Tiles(
  widthTiles: number,
): readonly (readonly string[])[] {
  return [
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    [...makeTileRun("sky", 4), "stone", ...makeTileRun("sky", widthTiles - 5)],
    makeTileRun("grass", widthTiles),
  ];
}

function unsupportedFloorAtColumn1Tiles(
  widthTiles: number,
): readonly (readonly string[])[] {
  return [
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    ["grass", "sky", ...makeTileRun("grass", widthTiles - 2)],
  ];
}

function expectPatrolActorStoppedAt(
  state: EnemyMotionState,
  entityId: string,
  position: { readonly x: number; readonly y: number },
  velocityX: number,
  direction: EnemyPatrolDirection,
): void {
  expect(requireEnemyPatrolActorState(state, entityId)).toMatchObject({
    position,
    velocity: {
      x: velocityX,
    },
    direction,
  });
}

function patrolActorSnapshot(input: {
  readonly entityId?: string;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY?: number;
  readonly direction: EnemyPatrolDirection;
}) {
  return {
    entityId: input.entityId ?? "beetle-1",
    position: {
      x: input.x,
      y: input.y,
    },
    velocity: {
      x: input.velocityX,
      y: input.velocityY ?? 0,
    },
    direction: input.direction,
  };
}

function emptyNonPatrolEnemyMotionActors() {
  return {
    flyingActors: [],
    chasingActors: [],
    armoredActors: [],
    throwingActors: [],
    aerialThrowingActors: [],
    piranhaPlantActors: [],
  };
}

function expectPatrolReversesOnLongStep(levelSpec: LevelSpec): void {
  const nextState = stepFreshRouteEnemy(levelSpec, {
    frameDurationMilliseconds: 16.666_666_667,
  });

  expect(requireEnemyPatrolActorState(nextState, "beetle-1")).toMatchObject({
    position: {
      x: 32,
      y: 64,
    },
    velocity: {
      x: 40,
    },
    direction: EnemyPatrolDirection.Right,
  });
}

describe("enemy motion", () => {
  it("creates explicit patrol state from enemy actors", () => {
    expect(enemyMotionFor(flatPatrolLevelSpec(2))).toEqual({
      activeEnemyEntityIds: [],
      patrolActors: [
        patrolActorSnapshot({
          x: 32,
          y: 64,
          velocityX: -40,
          direction: EnemyPatrolDirection.Left,
        }),
      ],
      ...emptyNonPatrolEnemyMotionActors(),
    });
  });

  it("applies an authored per-enemy patrol speed override at initialization", () => {
    const levelSpec = patrolLevelSpec({
      enemyX: 2,
      enemyPatrolSpeed: 5,
      tiles: makeSkyGroundTiles(6),
    });

    expect(enemyMotionFor(levelSpec).patrolActors[0]?.velocity.x).toBe(-5);
  });

  it("moves a patrol actor in its current direction", () => {
    const levelSpec = flatPatrolLevelSpec(3);
    const nextState = stepFreshRouteEnemy(levelSpec);

    expect(nextState.activeEnemyEntityIds).toEqual(["beetle-1"]);
    expect(requireEnemyPatrolActorState(nextState, "beetle-1")).toEqual(
      patrolActorSnapshot({
        x: 8,
        y: 64,
        velocityX: -40,
        direction: EnemyPatrolDirection.Left,
      }),
    );
  });

  it("reverses at the world boundary without moving out of bounds", () => {
    const levelSpec = flatPatrolLevelSpec(0);
    const nextState = stepFreshRouteEnemy(levelSpec);

    expect(requireEnemyPatrolActorState(nextState, "beetle-1")).toMatchObject({
      position: {
        x: 0,
        y: 64,
      },
      velocity: {
        x: 0,
      },
      direction: EnemyPatrolDirection.Left,
    });
  });

  it("reverses before entering a solid wall tile", () => {
    const levelSpec = patrolLevelSpec({
      enemyX: 2,
      tiles: wallAtColumn1Tiles(6),
    });
    expectPatrolReversesOnLongStep(levelSpec);
  });

  it("walks off unsupported floor and falls instead of reversing", () => {
    const levelSpec = patrolLevelSpec({
      enemyX: 2,
      tiles: unsupportedFloorAtColumn1Tiles(6),
    });
    // A 250ms step carries the enemy's centre out over the gap in column 1.
    const nextState = stepFreshRouteEnemy(levelSpec, {
      frameDurationMilliseconds: 250,
    });
    const actor = requireEnemyPatrolActorState(nextState, "beetle-1");

    // Faithful to the original: it keeps walking (does not turn around) and
    // falls off the ledge rather than reversing at the edge.
    expect(actor.direction).toBe(EnemyPatrolDirection.Left);
    expect(actor.position.x).toBeCloseTo(22, 6);
    expect(actor.position.y).toBeGreaterThan(64);
    expect(actor.velocity.y).toBeGreaterThan(0);
  });

  it("stops defeated enemies", () => {
    const levelSpec = flatPatrolLevelSpec(2);
    const nextState = stepFreshRouteEnemy(levelSpec, {
      interactionState: {
        ...makeEmptyEnemyInteractionState(),
        defeatedEnemyEntityIds: ["beetle-1" as EntityId],
      },
    });

    expectPatrolActorStoppedAt(
      nextState,
      "beetle-1",
      { x: 32, y: 64 },
      0,
      EnemyPatrolDirection.Left,
    );
  });

  it("keeps far-offscreen patrol enemies inactive until they enter the activation lead", () => {
    const levelSpec = wideFlatPatrolLevelSpec(30);
    const nextState = stepFreshRouteEnemy(levelSpec, {
      player: playerAt({ x: 16, y: 56 }),
    });

    expect(nextState.activeEnemyEntityIds).toEqual([]);
    expect(requireEnemyPatrolActorState(nextState, "beetle-1")).toEqual(
      patrolActorSnapshot({
        x: 480,
        y: 64,
        velocityX: -40,
        direction: EnemyPatrolDirection.Left,
      }),
    );
  });

  it("activates and moves patrol enemies inside the activation lead", () => {
    const levelSpec = wideFlatPatrolLevelSpec(17);
    const nextState = stepFreshRouteEnemy(levelSpec, {
      player: playerAt({ x: 16, y: 56 }),
    });

    expect(nextState.activeEnemyEntityIds).toEqual(["beetle-1"]);
    expect(requireEnemyPatrolActorState(nextState, "beetle-1")).toMatchObject({
      position: {
        x: 232,
        y: 64,
      },
      velocity: {
        x: -40,
      },
    });
  });

  it("keeps enemies active after they have been activated once", () => {
    const levelSpec = wideFlatPatrolLevelSpec(17);
    const activatedState = stepFreshRouteEnemy(levelSpec, {
      player: playerAt({ x: 16, y: 56 }),
    });
    const nextState = stepEnemyMotionState(
      activatedState,
      levelSpec,
      makeEmptyEnemyInteractionState(),
      testFrameDurationMilliseconds(1_000),
      initialMovementConstants,
      playerAt({ x: -1_000, y: 56 }),
      2 as FrameIndex,
    );

    expect(nextState.activeEnemyEntityIds).toEqual(["beetle-1"]);
    expect(requireEnemyPatrolActorState(nextState, "beetle-1").position.x).toBe(
      192,
    );
  });

  it("rejects missing enemy patrol actors", () => {
    expect(() =>
      assertValidEnemyMotionState(
        {
          activeEnemyEntityIds: [],
          patrolActors: [],
          flyingActors: [],
          chasingActors: [],
          armoredActors: [],
          throwingActors: [],
          aerialThrowingActors: [],
          piranhaPlantActors: [],
        },
        flatPatrolLevelSpec(2),
      ),
    ).toThrow("Enemy actor count must match total enemy actor count.");
  });

  it("rejects malformed patrol directions", () => {
    expect(() =>
      assertValidEnemyMotionState(
        {
          activeEnemyEntityIds: [],
          patrolActors: [
            {
              entityId: "beetle-1",
              position: {
                x: 32,
                y: 64,
              },
              velocity: {
                x: -40,
                y: 0,
              },
              direction: "down",
            },
          ],
          flyingActors: [],
          chasingActors: [],
          armoredActors: [],
          throwingActors: [],
          aerialThrowingActors: [],
          piranhaPlantActors: [],
        },
        flatPatrolLevelSpec(2),
      ),
    ).toThrow("enemyMotion.patrolActors[0].direction must be left or right.");
  });

  it("rejects active ids that do not belong to enemy actors", () => {
    expect(() =>
      assertValidEnemyMotionState(
        {
          activeEnemyEntityIds: ["missing-enemy"],
          patrolActors: [
            patrolActorSnapshot({
              x: 32,
              y: 64,
              velocityX: -40,
              direction: EnemyPatrolDirection.Left,
            }),
          ],
          ...emptyNonPatrolEnemyMotionActors(),
        },
        flatPatrolLevelSpec(2),
      ),
    ).toThrow("Active enemy entity id missing-enemy is not an enemy.");
  });

  describe("flying enemy", () => {
    it("creates explicit flying state from flying enemy actors", () => {
      const levelSpec = flyingEnemyRouteLevelSpec(3, 2);

      expect(enemyMotionFor(levelSpec)).toEqual({
        activeEnemyEntityIds: [],
        patrolActors: [],
        flyingActors: [
          {
            entityId: "wasp-1",
            position: {
              x: 48,
              y: 32,
            },
            velocity: {
              x: -45,
            },
            baseY: 32,
            phase: 0,
          },
        ],
        chasingActors: [],
        armoredActors: [],
        throwingActors: [],
        aerialThrowingActors: [],
        piranhaPlantActors: [],
      });
    });

    it("moves a flying enemy horizontally", () => {
      const levelSpec = flyingEnemyRouteLevelSpec(3, 2);
      const nextState = stepFreshRouteEnemy(levelSpec);

      expect(requireFlyingEnemyActorState(nextState, "wasp-1")).toMatchObject({
        position: {
          x: 3,
        },
        velocity: {
          x: -45,
        },
      });
    });

    it("oscillates a flying enemy vertically", () => {
      const levelSpec = flyingEnemyRouteLevelSpec(3, 2);
      const nextState = stepFreshRouteEnemy(levelSpec, {
        frameIndex: 30 as FrameIndex,
      });

      const flyingActor = requireFlyingEnemyActorState(nextState, "wasp-1");
      const expectedOffset =
        initialMovementConstants.flyingEnemyVerticalAmplitudePixels;

      expect(flyingActor.position.y).toBeCloseTo(32 + expectedOffset, 9);
    });

    it("reverses a flying enemy at solid walls", () => {
      const levelSpec = flyingEnemyRouteLevelSpec(2, 2, [
        makeTileRun("sky", 6),
        makeTileRun("sky", 6),
        ["sky", "stone", ...makeTileRun("sky", 4)],
        makeTileRun("sky", 6),
        makeTileRun("sky", 6),
        makeTileRun("grass", 6),
      ]);
      const nextState = stepFreshRouteEnemy(levelSpec, {
        frameDurationMilliseconds: 16.666_666_667,
        frameIndex: 0 as FrameIndex,
      });

      expect(requireFlyingEnemyActorState(nextState, "wasp-1")).toMatchObject({
        position: {
          x: 32,
          y: 32,
        },
        velocity: {
          x: 45,
        },
      });
    });
  });

  describe("chasing enemy", () => {
    it("creates explicit chasing state from chasing enemy actors", () => {
      const levelSpec = chasingEnemyRouteLevelSpec(3, 4);

      expect(enemyMotionFor(levelSpec)).toEqual({
        activeEnemyEntityIds: [],
        patrolActors: [],
        flyingActors: [],
        chasingActors: [
          {
            entityId: "hunter-1",
            position: {
              x: 48,
              y: 64,
            },
            velocity: {
              x: -40,
            },
            direction: EnemyPatrolDirection.Left,
            behavior: ChasingEnemyBehavior.Patrol,
          },
        ],
        armoredActors: [],
        throwingActors: [],
        aerialThrowingActors: [],
        piranhaPlantActors: [],
      });
    });

    it("patrols when the player is outside the detection window", () => {
      const levelSpec = chasingEnemyRouteLevelSpec(3, 4);
      const nextState = stepFreshRouteEnemy(levelSpec, {
        player: playerAt({ x: 500, y: 500 }),
      });

      expect(
        requireChasingEnemyActorState(nextState, "hunter-1"),
      ).toMatchObject({
        behavior: ChasingEnemyBehavior.Patrol,
        velocity: {
          x: -40,
        },
      });
    });

    it("chases when the player is within the detection window", () => {
      const levelSpec = chasingEnemyRouteLevelSpec(3, 4);
      const nextState = stepFreshRouteEnemy(levelSpec, {
        player: playerAt({ x: 80, y: 64 }),
      });

      expect(
        requireChasingEnemyActorState(nextState, "hunter-1"),
      ).toMatchObject({
        behavior: ChasingEnemyBehavior.Chase,
        velocity: {
          x: 60,
        },
      });
    });

    it("a swimming chaser (Blooper) pursues the player's depth, not just its row", () => {
      const levelSpec = chasingEnemyRouteLevelSpec(3, 4); // enemy at (48, 64)
      const swimming = stepEnemyMotionState(
        enemyMotionFor(levelSpec),
        levelSpec,
        makeEmptyEnemyInteractionState(),
        testFrameDurationMilliseconds(250),
        swimmingMovementConstants,
        playerAt({ x: 72, y: 24 }), // right of + well above the enemy
        1 as FrameIndex,
      );
      const swimmer = requireChasingEnemyActorState(swimming, "hunter-1");
      expect(swimmer.behavior).toBe(ChasingEnemyBehavior.Chase);
      expect(swimmer.position.y).toBeLessThan(64); // rose toward the player

      // On land the same chaser holds its row (no vertical pursuit).
      const land = stepFreshRouteEnemy(levelSpec, {
        player: playerAt({ x: 80, y: 40 }),
      });
      expect(requireChasingEnemyActorState(land, "hunter-1").position.y).toBe(
        64,
      );
    });

    it("chases at the tuned horizontal detection edge", () => {
      const levelSpec = chasingEnemyRouteLevelSpec(5, 4);
      const nextState = stepFreshRouteEnemy(levelSpec, {
        player: playerAt({ x: -32, y: 64 }),
      });

      expect(
        requireChasingEnemyActorState(nextState, "hunter-1"),
      ).toMatchObject({
        behavior: ChasingEnemyBehavior.Chase,
        velocity: {
          x: -60,
        },
      });
    });

    it("ignores players above the tuned vertical detection window", () => {
      const levelSpec = chasingEnemyRouteLevelSpec(3, 4);
      const nextState = stepFreshRouteEnemy(levelSpec, {
        player: playerAt({ x: 48, y: 15 }),
      });

      expect(
        requireChasingEnemyActorState(nextState, "hunter-1"),
      ).toMatchObject({
        behavior: ChasingEnemyBehavior.Patrol,
        velocity: {
          x: -40,
        },
      });
    });

    it("reverses a chasing enemy at solid walls while chasing", () => {
      const levelSpec = chasingEnemyRouteLevelSpec(2, 4, wallAtColumn1Tiles(6));
      const nextState = stepFreshRouteEnemy(levelSpec, {
        frameDurationMilliseconds: 16.666_666_667,
        player: playerAt({ x: 0, y: 64 }),
      });

      expect(
        requireChasingEnemyActorState(nextState, "hunter-1"),
      ).toMatchObject({
        behavior: ChasingEnemyBehavior.Chase,
        position: {
          x: 32,
        },
        velocity: {
          x: 60,
        },
      });
    });
  });

  describe("armored enemy", () => {
    it("creates explicit armored state from armored enemy actors", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);

      expect(enemyMotionFor(levelSpec)).toEqual({
        activeEnemyEntityIds: [],
        patrolActors: [],
        flyingActors: [],
        chasingActors: [],
        armoredActors: [
          {
            entityId: "crab-1",
            position: {
              x: 48,
              y: 64,
            },
            velocity: {
              x: -40,
              y: 0,
            },
            hitPoints: 2,
            behavior: ArmoredEnemyBehavior.Active,
            restingFrames: 0,
            flightBaseY: 64,
          },
        ],
        throwingActors: [],
        aerialThrowingActors: [],
        piranhaPlantActors: [],
      });
    });

    it("patrols an active armored enemy", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);
      const nextState = stepFreshRouteEnemy(levelSpec);

      expect(requireArmoredEnemyActorState(nextState, "crab-1")).toMatchObject({
        behavior: ArmoredEnemyBehavior.Active,
        velocity: {
          x: -40,
        },
      });
    });

    it("stops a shelled armored enemy", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);
      const steppedState = stepFreshRouteEnemy(levelSpec);
      const shelledState = stopDefeatedEnemyMotionState(
        steppedState,
        levelSpec,
        {
          ...makeEmptyEnemyInteractionState(),
          shelledEnemyEntityIds: ["crab-1" as EntityId],
        },
        initialMovementConstants,
      );

      expect(requireArmoredEnemyActorState(shelledState, "crab-1")).toEqual({
        entityId: "crab-1",
        position: {
          x: 8,
          y: 64,
        },
        velocity: {
          x: 0,
          y: 0,
        },
        hitPoints: 1,
        behavior: ArmoredEnemyBehavior.Shell,
        restingFrames: 0,
        flightBaseY: 64,
      });
    });

    it("keeps a resting shell shelled before the revive delay", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);
      const state = stepEnemyMotionFrames(
        levelSpec,
        restingShellState(levelSpec),
        60,
      );

      expect(requireArmoredEnemyActorState(state, "crab-1").behavior).toBe(
        ArmoredEnemyBehavior.Shell,
      );
    });

    it("wakes a resting shell back into a walking koopa after the revive delay", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);
      const state = stepEnemyMotionFrames(
        levelSpec,
        restingShellState(levelSpec),
        320,
      );

      const revived = requireArmoredEnemyActorState(state, "crab-1");
      expect(revived.behavior).toBe(ArmoredEnemyBehavior.Active);
      expect(revived.velocity.x).not.toBe(0);
      expect(revived.restingFrames).toBe(0);
    });

    it("does not wobble a freshly-stomped resting shell", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);
      const actor = requireArmoredEnemyActorState(
        restingShellState(levelSpec),
        "crab-1",
      );

      expect(shellReviveShakeOffsetPixels(actor)).toBe(0);
    });

    it("wobbles a resting shell in the final stretch before it wakes", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);
      const state = stepEnemyMotionFrames(
        levelSpec,
        restingShellState(levelSpec),
        260,
      );
      const actor = requireArmoredEnemyActorState(state, "crab-1");

      expect(actor.behavior).toBe(ArmoredEnemyBehavior.Shell);
      expect(shellReviveShakeOffsetPixels(actor)).not.toBe(0);
    });

    it("kicks a shelled armored enemy at the tuned shell slide speed", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);
      const shelledState = makeNudgedShellState(levelSpec);

      expect(requireArmoredEnemyActorState(shelledState, "crab-1")).toEqual({
        entityId: "crab-1",
        position: {
          x: 48,
          y: 64,
        },
        velocity: {
          x: 180,
          y: 0,
        },
        hitPoints: 2,
        behavior: ArmoredEnemyBehavior.Shell,
        restingFrames: 0,
        flightBaseY: 64,
      });
    });

    it("slides a moving shell three pixels per nominal frame", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);
      const nextState = stepNominalMovingShell(levelSpec);

      const armoredActor = requireArmoredEnemyActorState(nextState, "crab-1");
      expect(armoredActor.position.x).toBeCloseTo(51, 9);
      expect(armoredActor).toMatchObject({
        velocity: {
          x: 180,
        },
        behavior: ArmoredEnemyBehavior.Shell,
      });
    });

    it("reverses a moving shell when it hits a solid wall", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4, wallAtColumn4Tiles(6));
      const nextState = stepNominalMovingShell(levelSpec);

      expect(requireArmoredEnemyActorState(nextState, "crab-1")).toMatchObject({
        position: {
          x: 48,
        },
        velocity: {
          x: -180,
        },
        behavior: ArmoredEnemyBehavior.Shell,
      });
    });

    it("reverses a moving shell at the world boundary", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(0, 4);
      const shelledState = stopDefeatedEnemyMotionState(
        enemyMotionFor(levelSpec),
        levelSpec,
        {
          ...makeEmptyEnemyInteractionState(),
          nudgedShellEnemyEntityIds: ["crab-1" as EntityId],
          nudgedShellDirectionByEntityId: new Map([
            ["crab-1" as EntityId, EnemyPatrolDirection.Left],
          ]),
        },
        initialMovementConstants,
      );
      const nextState = stepNominalMovingShell(levelSpec, shelledState);

      expect(requireArmoredEnemyActorState(nextState, "crab-1")).toMatchObject({
        position: {
          x: 0,
        },
        velocity: {
          x: 180,
        },
        behavior: ArmoredEnemyBehavior.Shell,
      });
    });

    it("stops a defeated armored enemy", () => {
      const levelSpec = armoredEnemyRouteLevelSpec(3, 4);
      const nextState = stepFreshRouteEnemy(levelSpec, {
        interactionState: {
          ...makeEmptyEnemyInteractionState(),
          defeatedEnemyEntityIds: ["crab-1" as EntityId],
        },
      });

      expect(requireArmoredEnemyActorState(nextState, "crab-1")).toMatchObject({
        behavior: ArmoredEnemyBehavior.Active,
        velocity: {
          x: 0,
        },
      });
    });
  });

  describe("throwing enemy", () => {
    it("creates explicit stationary throwing state from throwing enemy actors", () => {
      const levelSpec = throwingEnemyRouteLevelSpec(3, 4);

      expect(enemyMotionFor(levelSpec)).toEqual({
        activeEnemyEntityIds: [],
        patrolActors: [],
        flyingActors: [],
        chasingActors: [],
        armoredActors: [],
        throwingActors: [
          {
            entityId: "thrower-1",
            position: {
              x: 48,
              y: 64,
            },
            velocity: {
              x: 0,
            },
          },
        ],
        aerialThrowingActors: [],
        piranhaPlantActors: [],
      });
    });
  });

  describe("aerial throwing enemy", () => {
    it("creates explicit aerial throwing state from aerial throwing enemy actors", () => {
      const levelSpec = aerialThrowingEnemyRouteLevelSpec(3, 2);

      expect(enemyMotionFor(levelSpec)).toEqual({
        activeEnemyEntityIds: [],
        patrolActors: [],
        flyingActors: [],
        chasingActors: [],
        armoredActors: [],
        throwingActors: [],
        aerialThrowingActors: [
          {
            entityId: "aerial-thrower-1",
            position: {
              x: 48,
              y: 32,
            },
            velocity: {
              x: 0,
            },
          },
        ],
        piranhaPlantActors: [],
      });
    });

    it("tracks the player horizontally after activation", () => {
      const levelSpec = aerialThrowingEnemyRouteLevelSpec(3, 2);
      const nextState = stepFreshRouteEnemy(levelSpec, {
        frameDurationMilliseconds: 1_000,
        player: playerAt({ x: 0, y: 32 }),
      });

      expect(nextState.activeEnemyEntityIds).toContain("aerial-thrower-1");
      expect(nextState.aerialThrowingActors[0]).toMatchObject({
        position: {
          x: 12,
          y: 32,
        },
        velocity: {
          x: 0 - initialMovementConstants.aerialThrowingEnemySpeed,
        },
      });
    });
  });

  describe("piranha plant", () => {
    // baseY = enemyY * 16; the plant sinks 24px into the pipe when retracted
    // and rises 1.4 tiles (22.4px) above baseY when fully emerged.
    const baseY = 4 * 16;
    const sunkenY = baseY + 24;
    const emergedY = baseY - 1.4 * 16;
    const farPlayer = playerAt({ x: 0, y: 56 });

    it("rests sunken inside the pipe during the retracted pause", () => {
      const levelSpec = piranhaRouteLevelSpec(5, 4);
      // Phase 100 lands in the bottom (retracted) pause of the cycle.
      const state = stepPiranha(levelSpec, 100, farPlayer);

      expect(state.piranhaPlantActors[0]?.phase).toBe(100);
      expect(state.piranhaPlantActors[0]?.position.y).toBeCloseTo(sunkenY, 9);
    });

    it("rises above the rim when fully emerged", () => {
      const levelSpec = piranhaRouteLevelSpec(5, 4);
      // Phase 28 is the first frame of the top (fully emerged) pause.
      const state = stepPiranha(levelSpec, 28, farPlayer);

      expect(state.piranhaPlantActors[0]?.phase).toBe(28);
      expect(state.piranhaPlantActors[0]?.position.y).toBeCloseTo(emergedY, 9);
    });

    it("stays hidden and holds its phase while the player stands on the pipe", () => {
      const levelSpec = piranhaRouteLevelSpec(5, 4);
      // The plant sits at x = 80; a player at the same column is within the
      // emerge-hold distance, so the plant must not rise into them.
      const nearPlayer = playerAt({ x: 80, y: 56 });
      const state = stepPiranha(levelSpec, 10, nearPlayer);

      expect(state.piranhaPlantActors[0]?.phase).toBe(0);
      expect(state.piranhaPlantActors[0]?.position.y).toBeCloseTo(sunkenY, 9);
    });
  });
});
