import { describe, expect, it } from "vitest";

import type { EntityId } from "../domain/identifiers";
import {
  ActorRole,
  makeLevelSpec,
  TileCollisionKind,
  type LevelSpec,
} from "../domain/level-spec";
import {
  makeFrameDurationMilliseconds,
  makeFrameIndex,
  type FrameIndex,
} from "../domain/units";
import { firstAuthoredLevelInput } from "../levels/first-authored-level";
import { coinsPerExtraLife } from "./game-score";
import { EnemySideContactSide } from "./enemy-contact-response";
import {
  makeEmptyEnemyInteractionState,
  resolveEnemyInteractionState,
} from "./enemy-interaction";
import {
  EnemyPatrolDirection,
  ArmoredEnemyBehavior,
  type EnemyMotionState,
  makeInitialEnemyMotionState,
  requireEnemyPatrolActorState,
} from "./enemy-motion";
import {
  HorizontalInput,
  makeSimulationInputCommand,
  type SimulationInputCommand,
} from "./input-command";
import {
  HorizontalMovementState,
  VerticalMovementState,
  initialMovementConstants,
  swimmingMovementConstants,
} from "./movement-model";
import { playerWithTestState } from "./movement-test-support";
import { ValidationErrorCode } from "../domain/validation-error";
import {
  PlayerDefeatReason,
  PlayerFinishReason,
  PlayerOutcomeKind,
} from "./player-outcome";
import { PlayerReactionKind } from "./player-reaction";
import { expectedInitialPlayerSimulationState } from "./player-state-test-support";
import {
  initialLivesCount,
  makeInitialSimulationState,
  type SimulationState,
} from "./simulation-state";
import { makeEmptySpawnedActorsState } from "./interactive-block-state";
import {
  nominalSixtyHertzFrameDurationMilliseconds,
  requireSimulationVelocity,
} from "./simulation-units";
import { stepSimulation } from "./step-simulation";
import { runtimeLevelTimerId } from "./level-timer-state";
import type { PlayerVitalityState } from "./player-vitality";
import { PlayerVitalityKind, makeRecoveryFrameCount } from "./player-vitality";
import { makeInvincibilityFrameCount } from "./player-invincibility";
import {
  aerialThrowingEnemyLevelSpec,
  exitActorWithoutGoalTileLevelSpec,
  breakableBlockLevelSpec,
  enemyClusterRunupLevelSpec,
  finishWithEnemyLevelSpec,
  interactiveCoinBlockLevelSpec,
  powerUpRouteLevelSpec,
  repeatableCoinBlockLevelSpec,
  throwingEnemyLevelSpec,
  twoTileGapLevelSpec,
} from "./level-test-support";

function validInitialState(): SimulationState {
  const result = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
  );

  if (!result.ok) {
    throw new Error("Expected valid initial simulation state.");
  }

  return result.value;
}

// Apply primary-player-slice overrides (using the historical field names) onto
// the players[0] runtime, leaving co-op players untouched.
function withPlayerOverrides(
  state: SimulationState,
  overrides: {
    readonly player?: SimulationState["players"][0]["player"];
    readonly playerVitality?: SimulationState["players"][0]["vitality"];
    readonly playerInvincibility?: SimulationState["players"][0]["invincibility"];
    readonly playerOutcome?: SimulationState["players"][0]["outcome"];
    readonly playerReaction?: SimulationState["players"][0]["reaction"];
  },
): SimulationState {
  const primary = state.players[0];
  return {
    ...state,
    players: [
      {
        player: overrides.player ?? primary.player,
        vitality: overrides.playerVitality ?? primary.vitality,
        invincibility: overrides.playerInvincibility ?? primary.invincibility,
        outcome: overrides.playerOutcome ?? primary.outcome,
        reaction: overrides.playerReaction ?? primary.reaction,
      },
      ...state.players.slice(1),
    ],
  };
}

// Build a deliberately-invalid simulation state for validation tests: the
// primary player's outcome (and optionally vitality) is corrupted, plus any
// top-level interaction fields, all cast past the type system on purpose.
function corruptedSimulationState(
  outcome: unknown,
  extra?: {
    readonly vitality?: unknown;
    readonly top?: Readonly<Record<string, unknown>>;
  },
): SimulationState {
  const base = validInitialState();
  const primary = base.players[0];
  return {
    ...base,
    ...(extra?.top ?? {}),
    players: [
      {
        ...primary,
        outcome,
        ...(extra?.vitality === undefined ? {} : { vitality: extra.vitality }),
      },
      ...base.players.slice(1),
    ],
  } as unknown as SimulationState;
}

function testEnemyEntityId(value: string): EntityId {
  return value as EntityId;
}

function testFrameIndex(value: number): FrameIndex {
  const result = makeFrameIndex(value, "test.frameIndex");

  if (!result.ok) {
    throw new Error("Expected test frame index to validate.");
  }

  return result.value;
}

function testRecoveryFrameCount(value: number) {
  const result = makeRecoveryFrameCount(value, "test.recoveryFrameCount");

  if (!result.ok) {
    throw new Error("Expected test recovery frame count to validate.");
  }

  return result.value;
}

function testInvincibilityFrameCount(value: number) {
  const result = makeInvincibilityFrameCount(
    value,
    "test.invincibilityFrameCount",
  );

  if (!result.ok) {
    throw new Error("Expected test invincibility frame count to validate.");
  }

  return result.value;
}

function recoveringVitalityState(
  contactSide: EnemySideContactSide,
  remainingKnockbackFrames: number,
  remainingInvulnerabilityFrames: number,
): PlayerVitalityState {
  return {
    kind: PlayerVitalityKind.Recovering,
    sourceEnemyEntityId: testEnemyEntityId("beetle-1"),
    contactSide,
    startFrameIndex: testFrameIndex(1),
    remainingKnockbackFrames: testRecoveryFrameCount(remainingKnockbackFrames),
    remainingInvulnerabilityFrames: testRecoveryFrameCount(
      remainingInvulnerabilityFrames,
    ),
  };
}

function initialStateForLevel(levelSpec: LevelSpec, failureMessage: string) {
  const initialStateResult = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    levelSpec,
    initialMovementConstants,
  );

  if (!initialStateResult.ok) {
    throw new Error(failureMessage);
  }

  return initialStateResult.value;
}

function upwardBlockHitPlayer() {
  return playerWithTestState({
    position: { x: 32, y: 80 },
    velocity: { x: 0, y: -120 },
    movement: {
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Jumping,
    },
  });
}

function stompPlayerSimulationState(
  playerVitality?: PlayerVitalityState,
): SimulationState {
  return withPlayerOverrides(validInitialState(), {
    player: playerWithTestState({
      position: {
        x: 96,
        y: 48,
      },
      velocity: {
        x: 0,
        y: 600,
      },
      movement: {
        horizontal: HorizontalMovementState.Idle,
        vertical: VerticalMovementState.Falling,
      },
    }),
    ...(playerVitality === undefined ? {} : { playerVitality }),
  });
}

function testSkyGroundTileDefinitions() {
  return [
    { tileId: "sky", collision: TileCollisionKind.Empty },
    { tileId: "grass", collision: TileCollisionKind.Solid },
  ];
}

function testSkyGroundRows(widthTiles: number): readonly (readonly string[])[] {
  return [
    Array.from({ length: widthTiles }, () => "sky"),
    Array.from({ length: widthTiles }, () => "sky"),
    Array.from({ length: widthTiles }, () => "sky"),
    Array.from({ length: widthTiles }, () => "sky"),
    Array.from({ length: widthTiles }, () => "sky"),
    Array.from({ length: widthTiles }, () => "grass"),
  ];
}

function shellCollisionLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 8,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: testSkyGroundTileDefinitions(),
    actorDefinitions: [
      {
        actorId: "runner-start",
        role: ActorRole.PlayerStart,
      },
      {
        actorId: "shell-crab",
        role: ActorRole.ArmoredEnemy,
      },
      {
        actorId: "beetle",
        role: ActorRole.Enemy,
      },
      {
        actorId: "open-gate",
        role: ActorRole.Exit,
      },
    ],
    tiles: testSkyGroundRows(8),
    actors: [
      { entityId: "runner-1", actorId: "runner-start", x: 1, y: 4 },
      { entityId: "crab-1", actorId: "shell-crab", x: 2, y: 4 },
      { entityId: "beetle-1", actorId: "beetle", x: 3, y: 4 },
      { entityId: "gate-1", actorId: "open-gate", x: 7, y: 4 },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected shell collision level to validate.");
  }

  return result.value;
}

function twoEnemyShellLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 10,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: testSkyGroundTileDefinitions(),
    actorDefinitions: [
      { actorId: "runner-start", role: ActorRole.PlayerStart },
      { actorId: "shell-crab", role: ActorRole.ArmoredEnemy },
      { actorId: "beetle", role: ActorRole.Enemy },
      { actorId: "open-gate", role: ActorRole.Exit },
    ],
    tiles: testSkyGroundRows(10),
    actors: [
      { entityId: "runner-1", actorId: "runner-start", x: 1, y: 4 },
      { entityId: "crab-1", actorId: "shell-crab", x: 2, y: 4 },
      { entityId: "beetle-1", actorId: "beetle", x: 4, y: 4 },
      { entityId: "beetle-2", actorId: "beetle", x: 6, y: 4 },
      { entityId: "gate-1", actorId: "open-gate", x: 9, y: 4 },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected two-enemy shell level to validate.");
  }

  return result.value;
}

function climbableLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 5,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: testSkyGroundTileDefinitions(),
    actorDefinitions: [
      { actorId: "runner-start", role: ActorRole.PlayerStart },
      { actorId: "climbable-vine", role: ActorRole.Climbable },
      { actorId: "open-gate", role: ActorRole.Exit },
    ],
    tiles: testSkyGroundRows(5),
    actors: [
      { entityId: "runner-1", actorId: "runner-start", x: 1, y: 4 },
      { entityId: "vine-1", actorId: "climbable-vine", x: 1, y: 4 },
      { entityId: "gate-1", actorId: "open-gate", x: 4, y: 4 },
    ],
  });

  if (!result.ok) {
    throw new Error("Expected climbable level to validate.");
  }

  return result.value;
}

function expectBeetleStompDefeatedWithRebound(state: SimulationState): void {
  expect(state.enemies).toEqual({
    contactedEnemyEntityIds: [],
    defeatedEnemyEntityIds: ["beetle-1"],
    shelledEnemyEntityIds: [],
    nudgedShellEnemyEntityIds: [],
    nudgedShellDirectionByEntityId: new Map(),
    currentStompChainCount: 1,
    cumulativeStompScore: 100,
    cumulativeStompChainExtraLives: 0,
    cumulativeInvincibilityScore: 0,
    cumulativeShellKillScore: 0,
    currentShellKillChainCount: 0,
    cumulativeShellKillExtraLives: 0,
    cumulativeProjectileKillScore: 0,
  });
  expect(state.enemyContactResponse).toEqual({
    kind: "none",
  });
  expect(state.players[0].player.velocity.y).toBe(
    0 - initialMovementConstants.enemyStompReboundSpeed,
  );
  expect(state.players[0].outcome).toEqual({
    kind: "active",
  });
}

function stepRecoveringVitalityState(
  position: { readonly x: number; readonly y: number },
  remainingKnockbackFrames: number,
  remainingInvulnerabilityFrames: number,
): SimulationState {
  return stepSimulation(
    withPlayerOverrides(stateWithPlayerAt(position), {
      playerVitality: recoveringVitalityState(
        EnemySideContactSide.Right,
        remainingKnockbackFrames,
        remainingInvulnerabilityFrames,
      ),
    }),
    validInputCommand(),
    initialMovementConstants,
    firstAuthoredLevelWithoutHazardSpec(),
  );
}

// Step a recovering player one frame with invulnerability about to expire and
// assert its vitality collapses back to small, returning the stepped state so
// callers can further assert on the resulting outcome.
function stepRecoveringVitalityToSmall(
  position: { readonly x: number; readonly y: number },
  remainingKnockbackFrames: number,
  remainingInvulnerabilityFrames: number,
): SimulationState {
  const nextState = stepRecoveringVitalityState(
    position,
    remainingKnockbackFrames,
    remainingInvulnerabilityFrames,
  );
  expect(nextState.players[0].vitality).toEqual({
    kind: "small",
  });
  return nextState;
}

function slideShell(
  armoredActors: EnemyMotionState["armoredActors"],
  entityId: string,
): EnemyMotionState["armoredActors"] {
  return armoredActors.map((actor) =>
    actor.entityId === entityId
      ? {
          ...actor,
          behavior: ArmoredEnemyBehavior.Shell,
          velocity: {
            x: initialMovementConstants.shellSlideSpeed,
            y: actor.velocity.y,
          },
        }
      : actor,
  );
}

function validInputCommand(): SimulationInputCommand {
  const result = makeSimulationInputCommand(
    HorizontalInput.Neutral,
    false,
    false,
    false,
    false,
    false,
  );

  if (!result.ok) {
    throw new Error("Expected valid simulation input command.");
  }

  return result.value;
}

function runningRightInputCommand(
  jumpPressed: boolean,
): SimulationInputCommand {
  const result = makeSimulationInputCommand(
    HorizontalInput.Right,
    jumpPressed,
    true,
    false,
    false,
    false,
  );

  if (!result.ok) {
    throw new Error("Expected valid running-right input command.");
  }

  return result.value;
}

function climbingInputCommand(params: {
  readonly upHeld: boolean;
  readonly downHeld: boolean;
}): SimulationInputCommand {
  const result = makeSimulationInputCommand(
    HorizontalInput.Neutral,
    false,
    false,
    false,
    params.upHeld,
    params.downHeld,
  );

  if (!result.ok) {
    throw new Error("Expected valid climbing input command.");
  }

  return result.value;
}

function stepWithInitialMovementConstants(
  state: SimulationState,
  inputCommand: SimulationInputCommand,
): SimulationState {
  return stepSimulation(
    state,
    inputCommand,
    initialMovementConstants,
    firstAuthoredLevelSpec(),
  );
}

function expectActiveStateWithoutInteractions(state: SimulationState): void {
  expect(state.levelContacts).toEqual({
    hazard: false,
    goal: false,
  });
  expect(state.players[0].outcome).toEqual({
    kind: "active",
  });
  expect(state.collectibles).toEqual({
    collectedCoinEntityIds: [],
    collectedItemEntityIds: [],
    collectedExtraLifeEntityIds: [],
  });
  expect(state.enemies).toEqual(makeEmptyEnemyInteractionState());
}

function expectRightSideBeetleContactResponse(state: SimulationState): void {
  const expectedResponseVelocity =
    0 - initialMovementConstants.enemySideContactKnockbackSpeed;

  expect(state.enemyContactResponse).toEqual({
    kind: "side-contact",
    enemyEntityId: "beetle-1",
    contactSide: EnemySideContactSide.Right,
    frameIndex: 1,
    velocity: {
      x: expectedResponseVelocity,
    },
  });
  expect(state.players[0].player.velocity.x).toBe(expectedResponseVelocity);
}

function expectBeetleSideContactEnemyState(state: SimulationState): void {
  expect(state.enemies).toEqual({
    ...makeEmptyEnemyInteractionState(),
    contactedEnemyEntityIds: ["beetle-1"],
  });
}

function expectRightSideEnemyContactWithoutHazard(
  state: SimulationState,
): void {
  expect(state.levelContacts).toEqual({
    hazard: false,
    goal: false,
  });
  expectBeetleSideContactEnemyState(state);
  expectRightSideBeetleContactResponse(state);
}

function expectBeetleDefeatedEnemyState(
  state: SimulationState,
  cumulativeInvincibilityScore: number,
  cumulativeShellKillScore: number,
  cumulativeProjectileKillScore: number,
  currentShellKillChainCount = 0,
): void {
  expect(state.enemies).toEqual({
    ...makeEmptyEnemyInteractionState(),
    defeatedEnemyEntityIds: ["beetle-1"],
    currentShellKillChainCount,
    cumulativeInvincibilityScore,
    cumulativeShellKillScore,
    cumulativeProjectileKillScore,
  });
}

function expectBeetleInvincibilityDefeatedEnemyState(
  state: SimulationState,
): void {
  expectBeetleDefeatedEnemyState(state, 100, 0, 0);
}

function expectBeetleShellDefeatedEnemyState(state: SimulationState): void {
  // A single kill by a still-sliding shell: chain of 1 → 100 points.
  expectBeetleDefeatedEnemyState(state, 0, 100, 0, 1);
}

function firstAuthoredLevelSpec(): LevelSpec {
  const result = makeLevelSpec(firstAuthoredLevelInput);

  if (!result.ok) {
    throw new Error("Expected first authored level to validate.");
  }

  return result.value;
}

function firstAuthoredLevelWithoutHazardSpec(): LevelSpec {
  const hazardTileRowIndex = 4;
  const hazardTileColumnIndex = 6;
  const tiles = firstAuthoredLevelInput.tiles.map((row, rowIndex) =>
    rowIndex === hazardTileRowIndex
      ? row.map((tileId, columnIndex) =>
          columnIndex === hazardTileColumnIndex ? "sky" : tileId,
        )
      : row,
  );
  const result = makeLevelSpec({
    ...firstAuthoredLevelInput,
    tiles,
  });

  if (!result.ok) {
    throw new Error("Expected no-hazard authored level to validate.");
  }

  return result.value;
}

function stateWithPlayerAt(position: {
  readonly x: number;
  readonly y: number;
}): SimulationState {
  return withPlayerOverrides(validInitialState(), {
    player: playerWithTestState({
      position,
      velocity: {
        x: 0,
        y: 0,
      },
      movement: {
        horizontal: HorizontalMovementState.Idle,
        vertical: VerticalMovementState.Grounded,
      },
    }),
  });
}

function stepRightSideEnemyContactWithoutHazard(
  state: SimulationState,
): SimulationState {
  return stepSimulation(
    state,
    validInputCommand(),
    initialMovementConstants,
    firstAuthoredLevelWithoutHazardSpec(),
  );
}

describe("simulation primitives", () => {
  it("creates explicit input commands", () => {
    expect(
      makeSimulationInputCommand(
        HorizontalInput.Right,
        true,
        false,
        false,
        false,
        false,
      ),
    ).toEqual({
      ok: true,
      value: {
        horizontal: HorizontalInput.Right,
        jumpPressed: true,
        runHeld: false,
        firePressed: false,
        upHeld: false,
        downHeld: false,
      },
    });
  });

  it("rejects malformed input commands", () => {
    expect(makeSimulationInputCommand("up", "yes", 1, 0, 0, 0)).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.HorizontalInputInvalid,
          message: "input.horizontal must be one of: left, neutral, right.",
          path: "input.horizontal",
        },
        {
          code: ValidationErrorCode.BooleanInputInvalid,
          message: "input.jumpPressed must be a boolean.",
          path: "input.jumpPressed",
        },
        {
          code: ValidationErrorCode.BooleanInputInvalid,
          message: "input.runHeld must be a boolean.",
          path: "input.runHeld",
        },
        {
          code: ValidationErrorCode.BooleanInputInvalid,
          message: "input.firePressed must be a boolean.",
          path: "input.firePressed",
        },
        {
          code: ValidationErrorCode.BooleanInputInvalid,
          message: "input.downHeld must be a boolean.",
          path: "input.downHeld",
        },
        {
          code: ValidationErrorCode.BooleanInputInvalid,
          message: "input.upHeld must be a boolean.",
          path: "input.upHeld",
        },
      ],
    });
  });

  it("creates initial simulation state", () => {
    expect(
      makeInitialSimulationState(
        nominalSixtyHertzFrameDurationMilliseconds,
        firstAuthoredLevelSpec(),
        initialMovementConstants,
      ),
    ).toEqual({
      ok: true,
      value: {
        clock: {
          frameIndex: 0,
          frameDurationMilliseconds: nominalSixtyHertzFrameDurationMilliseconds,
        },
        players: [
          {
            player: expectedInitialPlayerSimulationState,
            vitality: { kind: "small" },
            invincibility: {
              collectedInvincibilityEntityIds: [],
              remainingFrames: 0,
            },
            outcome: { kind: "active" },
            reaction: { kind: PlayerReactionKind.None, remainingFrames: 0 },
          },
        ],
        levelContacts: {
          hazard: false,
          goal: false,
        },
        interactiveBlocks: {
          bumpedBlockTilePositions: [],
        },
        breakableBlocks: {
          brokenBlockTilePositions: [],
        },
        collectibles: {
          collectedCoinEntityIds: [],
          collectedItemEntityIds: [],
          collectedExtraLifeEntityIds: [],
        },
        powerUps: {
          collectedPowerUpEntityIds: [],
        },
        spawnedActors: makeEmptySpawnedActorsState(),
        projectiles: {
          projectiles: [],
          cooldownRemainingFrames: 0,
          fireballHitsByEntityId: {},
        },
        pipeEntry: {
          phase: "none",
        },
        levelTimer: {
          remainingFrames: undefined,
        },
        timedHazardProjectiles: {
          projectiles: [],
          playerContact: false,
          stompedProjectileCount: 0,
          hatchedPositions: [],
        },
        enemies: makeEmptyEnemyInteractionState(),
        enemyDamageContactFrameByEntityId: new Map(),
        enemyContactResponse: {
          kind: "none",
        },
        enemyMotion: {
          activeEnemyEntityIds: [],
          patrolActors: [
            {
              entityId: "beetle-1",
              position: {
                x: 96,
                y: 64,
              },
              velocity: {
                x: -40,
                y: 0,
              },
              direction: EnemyPatrolDirection.Left,
            },
            {
              entityId: "beetle-2",
              position: {
                x: 0,
                y: 64,
              },
              velocity: {
                x: -60,
                y: 0,
              },
              direction: EnemyPatrolDirection.Left,
            },
          ],
          flyingActors: [],
          chasingActors: [],
          armoredActors: [],
          throwingActors: [],
          aerialThrowingActors: [],
          piranhaPlantActors: [],
        },
        timeBonusScore: 0,
        breakableBlockScore: 0,
        bulletBillStompScore: 0,
        goalHeightScore: 0,
        livesRemaining: initialLivesCount,
        sessionCoinBase: 0,
        enemyStompReaction: {
          active: false,
          remainingFrames: 0,
          x: 0,
          y: 0,
        },
        bloodiness: 0,
        pseudoRandom: { register: [0xa5, 0, 0, 0, 0, 0, 0] },
        cheepFrenzy: {
          slots: [null, null, null],
          respawnTimerFrames: 0,
          usedYBands: 0,
        },
        aerialFrenzy: {
          slots: [null, null, null],
          respawnTimerFrames: 0,
        },
        platforms: { platforms: [] },
        loopZones: { groupProgress: {} },
        hatchedSpinies: { spinies: [] },
      },
    });
  });

  it("rejects invalid initial frame durations", () => {
    expect(
      makeInitialSimulationState(
        0,
        firstAuthoredLevelSpec(),
        initialMovementConstants,
      ),
    ).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.FrameDurationInvalid,
          message:
            "clock.frameDurationMilliseconds must be a positive finite number.",
          path: "clock.frameDurationMilliseconds",
        },
      ],
    });
  });

  it("advances the simulation by exactly one frame", () => {
    const nextState = stepWithInitialMovementConstants(
      validInitialState(),
      validInputCommand(),
    );

    expect(nextState.clock).toEqual({
      frameIndex: 1,
      frameDurationMilliseconds: nominalSixtyHertzFrameDurationMilliseconds,
    });
    expect(nextState.players[0].player.position.x).toBe(16);
    expect(nextState.players[0].player.position.y).toBe(64);
    expect(nextState.players[0].player.velocity).toEqual({
      ...validInitialState().players[0].player.velocity,
      y: 0,
    });
    expect(nextState.players[0].player.movement).toEqual({
      ...validInitialState().players[0].player.movement,
      vertical: VerticalMovementState.Grounded,
    });
    expectActiveStateWithoutInteractions(nextState);
  });

  it("records a powered player breaking an upward-hit breakable block", () => {
    const levelSpec = breakableBlockLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected breakable block initial state to validate.",
    );

    const nextState = stepSimulation(
      withPlayerOverrides(initialState, {
        player: upwardBlockHitPlayer(),
        playerVitality: {
          kind: PlayerVitalityKind.Powered,
        },
      }),
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.breakableBlocks.brokenBlockTilePositions).toEqual([
      { x: 2, y: 4 },
    ]);
    expect(nextState.breakableBlockScore).toBe(50);
  });

  it("does not score breakable block points when a small player bumps a brick", () => {
    const levelSpec = breakableBlockLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected breakable block initial state to validate.",
    );

    const nextState = stepSimulation(
      withPlayerOverrides(initialState, {
        player: upwardBlockHitPlayer(),
      }),
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.breakableBlocks.brokenBlockTilePositions).toEqual([]);
    expect(nextState.breakableBlockScore).toBe(0);
  });

  it("starts with the initial lives count", () => {
    expect(validInitialState().livesRemaining).toBe(initialLivesCount);
  });

  it("decrements lives when the player is defeated", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const nextState = stepSimulation(
      stateWithPlayerAt({ x: 96, y: 64 }),
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.players[0].outcome.kind).toBe(PlayerOutcomeKind.Defeated);
    expect(nextState.livesRemaining).toBe(2);
  });

  it("does not decrement lives below zero", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const nextState = stepSimulation(
      {
        ...stateWithPlayerAt({ x: 96, y: 64 }),
        livesRemaining: 0,
      },
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.players[0].outcome.kind).toBe(PlayerOutcomeKind.Defeated);
    expect(nextState.livesRemaining).toBe(0);
  });

  it("triggers a head-bonk reaction when the player bonks a block from below", () => {
    const levelSpec = interactiveCoinBlockLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected coin block initial state to validate.",
    );

    const bonkedState = stepSimulation(
      withPlayerOverrides(initialState, {
        player: upwardBlockHitPlayer(),
      }),
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(bonkedState.players[0].reaction.kind).toBe(
      PlayerReactionKind.HeadBonk,
    );
    expect(bonkedState.players[0].reaction.remainingFrames).toBeGreaterThan(0);

    // With no further bonk, the reaction counts down.
    const laterState = stepSimulation(
      bonkedState,
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );
    expect(laterState.players[0].reaction.remainingFrames).toBeLessThan(
      bonkedState.players[0].reaction.remainingFrames,
    );
  });

  it("bloodies the player on a shabby-mode head-bonk but never in original mode", () => {
    const levelSpec = interactiveCoinBlockLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected coin block initial state to validate.",
    );
    const fastBonkPlayer = playerWithTestState({
      position: { x: 32, y: 80 },
      velocity: { x: 150, y: -120 },
      movement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Jumping,
      },
    });

    // Original (faithful) mode: a bonk happens but never draws blood.
    const original = stepSimulation(
      withPlayerOverrides(initialState, {
        player: fastBonkPlayer,
      }),
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );
    expect(original.players[0].reaction.kind).toBe(PlayerReactionKind.HeadBonk);
    expect(original.bloodiness).toBe(0);

    // Shabby mechanics: the same fast bonk bloodies the player.
    const shabby = stepSimulation(
      withPlayerOverrides(initialState, {
        player: fastBonkPlayer,
      }),
      validInputCommand(),
      { ...initialMovementConstants, bloodyBonks: true },
      levelSpec,
    );
    expect(shabby.bloodiness).toBeGreaterThan(0);
  });

  it("auto-collects a coin while showing its popup after an upward-hit coin block", () => {
    const levelSpec = interactiveCoinBlockLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected coin block initial state to validate.",
    );

    const nextState = stepSimulation(
      withPlayerOverrides(initialState, {
        player: upwardBlockHitPlayer(),
      }),
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.collectibles.collectedCoinEntityIds).toEqual([
      "spawned-2-4",
    ]);
    expect(nextState.spawnedActors.spawnedActors[0]).toMatchObject({
      entityId: "spawned-2-4",
      active: true,
      remainingPopupFrames: 23,
    });

    const followingState = stepSimulation(
      nextState,
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(followingState.collectibles.collectedCoinEntityIds).toEqual([
      "spawned-2-4",
    ]);
    expect(followingState.spawnedActors.spawnedActors[0]).toMatchObject({
      entityId: "spawned-2-4",
      active: true,
      remainingPopupFrames: 22,
    });
  });

  it("auto-collects repeated coins from an explicit repeatable coin block", () => {
    const levelSpec = repeatableCoinBlockLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected repeatable coin block initial state to validate.",
    );
    const firstCoinState = stepSimulation(
      withPlayerOverrides(initialState, {
        player: upwardBlockHitPlayer(),
      }),
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );
    const secondCoinState = stepSimulation(
      withPlayerOverrides(firstCoinState, {
        player: upwardBlockHitPlayer(),
      }),
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(secondCoinState.collectibles.collectedCoinEntityIds).toEqual([
      "spawned-2-4",
      "spawned-2-4-2",
    ]);
  });

  it("carries the session coin base through a step unchanged", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const nextState = stepSimulation(
      { ...stateWithPlayerAt({ x: 32, y: 56 }), sessionCoinBase: 42 },
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.sessionCoinBase).toBe(42);
  });

  it("awards a 1-Up when the session coin total crosses a 100 boundary", () => {
    // With 99 coins already banked from prior levels, collecting one more coin
    // crosses the 100th coin and grants an extra life — the cross-level 1-Up.
    const levelSpec = repeatableCoinBlockLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected repeatable coin block initial state to validate.",
    );

    const beforeState = withPlayerOverrides(
      { ...initialState, sessionCoinBase: coinsPerExtraLife - 1 },
      { player: upwardBlockHitPlayer() },
    );
    const afterState = stepSimulation(
      beforeState,
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(afterState.collectibles.collectedCoinEntityIds.length).toBe(1);
    expect(afterState.livesRemaining).toBe(beforeState.livesRemaining + 1);
  });

  it("integrates horizontal movement for each frame", () => {
    const rightInputResult = makeSimulationInputCommand(
      HorizontalInput.Right,
      false,
      false,
      false,
      false,
      false,
    );

    if (!rightInputResult.ok) {
      throw new Error("Expected valid right input command.");
    }

    const nextState = stepWithInitialMovementConstants(
      validInitialState(),
      rightInputResult.value,
    );

    expect(nextState.players[0].player.velocity.x).toBeCloseTo(
      initialMovementConstants.walkAcceleration *
        (nominalSixtyHertzFrameDurationMilliseconds / 1000),
      9,
    );
    expect(nextState.players[0].player.movement.horizontal).toBe(
      HorizontalMovementState.Walking,
    );
  });

  it("integrates vertical movement for each frame", () => {
    const jumpInputResult = makeSimulationInputCommand(
      HorizontalInput.Neutral,
      true,
      false,
      false,
      false,
      false,
    );

    if (!jumpInputResult.ok) {
      throw new Error("Expected valid jump input command.");
    }

    const nextState = stepWithInitialMovementConstants(
      validInitialState(),
      jumpInputResult.value,
    );

    expect(nextState.players[0].player.velocity.y).toBe(
      0 - initialMovementConstants.jumpLaunchSpeed,
    );
    expect(nextState.players[0].player.position.y).toBeCloseTo(
      64 -
        initialMovementConstants.jumpLaunchSpeed *
          (nominalSixtyHertzFrameDurationMilliseconds / 1000),
      9,
    );
    expect(nextState.players[0].player.movement.vertical).toBe(
      VerticalMovementState.Jumping,
    );
  });

  it("spawns a projectile when fire is pressed while in fire form", () => {
    const poweredState: SimulationState = withPlayerOverrides(
      validInitialState(),
      {
        playerVitality: {
          kind: PlayerVitalityKind.Fire,
        },
      },
    );
    const fireInputResult = makeSimulationInputCommand(
      HorizontalInput.Right,
      false,
      false,
      true,
      false,
      false,
    );

    if (!fireInputResult.ok) {
      throw new Error("Expected valid fire input command.");
    }

    const nextState = stepWithInitialMovementConstants(
      poweredState,
      fireInputResult.value,
    );

    expect(nextState.projectiles.projectiles).toHaveLength(1);
    expect(nextState.projectiles.cooldownRemainingFrames).toBe(
      initialMovementConstants.projectileCooldownFrameCount,
    );
    expect(nextState.projectiles.projectiles[0]?.velocity.x).toBe(
      initialMovementConstants.projectileSpeed,
    );
  });

  it("resolves landing on crossed solid tiles after position integration", () => {
    const fallingState: SimulationState = withPlayerOverrides(
      validInitialState(),
      {
        player: playerWithTestState({
          position: {
            x: 16,
            y: 62,
          },
          velocity: {
            x: 0,
            y: 120,
          },
          movement: {
            horizontal: HorizontalMovementState.Idle,
            vertical: VerticalMovementState.Falling,
          },
        }),
      },
    );

    const nextState = stepWithInitialMovementConstants(
      fallingState,
      validInputCommand(),
    );

    expect(nextState.players[0].player.position.y).toBe(64);
    expect(nextState.players[0].player.velocity.y).toBe(0);
    expect(nextState.players[0].player.movement.vertical).toBe(
      VerticalMovementState.Grounded,
    );
  });

  it("resolves horizontal solid collision after position integration", () => {
    const rightRunInputResult = makeSimulationInputCommand(
      HorizontalInput.Right,
      false,
      true,
      false,
      false,
      false,
    );

    if (!rightRunInputResult.ok) {
      throw new Error("Expected valid right run input command.");
    }

    const rightwardState: SimulationState = withPlayerOverrides(
      validInitialState(),
      {
        player: playerWithTestState({
          position: {
            x: 113,
            y: 40,
          },
          velocity: {
            x: 160,
            y: 0,
          },
          movement: {
            horizontal: HorizontalMovementState.Running,
            vertical: VerticalMovementState.Falling,
          },
        }),
      },
    );

    const nextState = stepWithInitialMovementConstants(
      rightwardState,
      rightRunInputResult.value,
    );

    expect(nextState.players[0].player.position.x).toBe(114);
    expect(nextState.players[0].player.velocity.x).toBe(0);
    expect(nextState.players[0].player.movement.horizontal).toBe(
      HorizontalMovementState.Running,
    );
    expect(nextState.clock.frameIndex).toBe(1);
    expectActiveStateWithoutInteractions(nextState);
  });

  it("resolves upward underside solid collision after position integration", () => {
    const jumpingState: SimulationState = withPlayerOverrides(
      validInitialState(),
      {
        player: playerWithTestState({
          position: {
            x: 66,
            y: 49,
          },
          velocity: {
            x: 0,
            y: -600,
          },
          movement: {
            horizontal: HorizontalMovementState.Idle,
            vertical: VerticalMovementState.Jumping,
          },
        }),
      },
    );

    const nextState = stepWithInitialMovementConstants(
      jumpingState,
      validInputCommand(),
    );

    expect(nextState.players[0].player.position.y).toBe(48);
    expect(nextState.players[0].player.velocity.y).toBe(0);
    expect(nextState.players[0].player.movement.vertical).toBe(
      VerticalMovementState.Falling,
    );
    expect(nextState.clock.frameIndex).toBe(1);
    expectActiveStateWithoutInteractions(nextState);
  });

  it("defeats the player with a pit-contact outcome when they fall below the level bottom", () => {
    const fallingBelowLevel: SimulationState = withPlayerOverrides(
      stateWithPlayerAt({
        x: 16,
        y: 96,
      }),
      {
        player: playerWithTestState({
          position: {
            x: 16,
            y: 96,
          },
          velocity: {
            x: 0,
            y: 600,
          },
          movement: {
            horizontal: HorizontalMovementState.Idle,
            vertical: VerticalMovementState.Falling,
          },
        }),
      },
    );

    const nextState = stepWithInitialMovementConstants(
      fallingBelowLevel,
      validInputCommand(),
    );

    expect(nextState.players[0].outcome).toEqual({
      kind: PlayerOutcomeKind.Defeated,
      reason: PlayerDefeatReason.PitContact,
    });
  });

  it("can clear a two-tile ground gap with a running jump", () => {
    const levelSpec = twoTileGapLevelSpec();
    const initialStateResult = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      initialMovementConstants,
    );

    if (!initialStateResult.ok) {
      throw new Error("Expected two-tile-gap initial state to validate.");
    }

    let state = initialStateResult.value;

    // ROM-rate acceleration takes ~45 frames to reach full run speed, so the
    // route runs a little longer than it used to.
    for (let frame = 0; frame < 110; frame += 1) {
      const playerNearGap =
        state.players[0].player.position.x >= 112 &&
        state.players[0].player.position.x <= 148;
      state = stepSimulation(
        state,
        runningRightInputCommand(playerNearGap),
        initialMovementConstants,
        levelSpec,
      );
    }

    expect(state.players[0].outcome.kind).toBe(PlayerOutcomeKind.Active);
    expect(state.players[0].player.position.x).toBeGreaterThan(
      12 * levelSpec.tileSizePixels,
    );
    expect(state.players[0].player.position.y).toBeLessThanOrEqual(64);
  });

  it("can survive a running jump into a basic enemy cluster after a flat runup", () => {
    const levelSpec = enemyClusterRunupLevelSpec();
    let successfulState: SimulationState | undefined;

    for (let jumpStartFrame = 1; jumpStartFrame <= 90; jumpStartFrame += 1) {
      for (let jumpHoldFrames = 4; jumpHoldFrames <= 28; jumpHoldFrames += 1) {
        let state = initialStateForLevel(
          levelSpec,
          "Expected enemy-cluster initial state to validate.",
        );

        for (let frame = 0; frame < 130; frame += 1) {
          const jumpHeld =
            frame >= jumpStartFrame && frame < jumpStartFrame + jumpHoldFrames;
          state = stepSimulation(
            state,
            runningRightInputCommand(jumpHeld),
            initialMovementConstants,
            levelSpec,
          );

          if (state.players[0].outcome.kind !== PlayerOutcomeKind.Active) {
            break;
          }

          if (
            state.enemies.defeatedEnemyEntityIds.includes(
              testEnemyEntityId("beetle-a"),
            )
          ) {
            successfulState = state;
            break;
          }
        }

        if (successfulState !== undefined) {
          break;
        }
      }

      if (successfulState !== undefined) {
        break;
      }
    }

    if (successfulState === undefined) {
      throw new Error("Expected a timed running jump to stomp the lead enemy.");
    }

    expect(successfulState.players[0].outcome.kind).toBe(
      PlayerOutcomeKind.Active,
    );
    expect(successfulState.enemies.contactedEnemyEntityIds).toEqual([]);
    expect(successfulState.enemies.defeatedEnemyEntityIds).toContain(
      testEnemyEntityId("beetle-a"),
    );
    expect(successfulState.players[0].player.velocity.y).toBeLessThan(0);
  });

  it("defeats the player with a time-up outcome when the level timer expires", () => {
    const levelSpecResult = makeLevelSpec({
      ...firstAuthoredLevelInput,
      levelTimers: [
        {
          timerId: runtimeLevelTimerId,
          frames: 1,
        },
      ],
    });

    if (!levelSpecResult.ok) {
      throw new Error("Expected timed level to validate.");
    }

    const initialStateResult = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpecResult.value,
      initialMovementConstants,
    );

    if (!initialStateResult.ok) {
      throw new Error("Expected timed initial state to validate.");
    }

    const nextState = stepSimulation(
      initialStateResult.value,
      validInputCommand(),
      initialMovementConstants,
      levelSpecResult.value,
    );

    expect(nextState.levelTimer).toEqual({
      remainingFrames: 0,
    });
    expect(nextState.players[0].outcome).toEqual({
      kind: PlayerOutcomeKind.Defeated,
      reason: PlayerDefeatReason.TimeUp,
    });
  });

  it("defeats the player with hazard contact from a timed hazard projectile", () => {
    const levelSpecResult = makeLevelSpec({
      ...firstAuthoredLevelInput,
      timedHazardProjectileSpawners: [
        {
          // Fire at the player's grounded body height so the projectile meets
          // the feet-anchored hurtbox (the lower part of the collider).
          spawnerId: "test-cannon",
          x: 1,
          y: 4,
          direction: "right",
          intervalFrames: 60,
          initialDelayFrames: 1,
          speedPixelsPerSecond: 80,
          widthPixels: 8,
          heightPixels: 16,
          lifetimeFrames: 120,
        },
      ],
    });

    if (!levelSpecResult.ok) {
      throw new Error("Expected timed hazard projectile level to validate.");
    }

    const initialStateResult = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpecResult.value,
      initialMovementConstants,
    );

    if (!initialStateResult.ok) {
      throw new Error(
        "Expected timed hazard projectile initial state to validate.",
      );
    }

    const nextState = stepSimulation(
      initialStateResult.value,
      validInputCommand(),
      initialMovementConstants,
      levelSpecResult.value,
    );

    expect(nextState.timedHazardProjectiles.playerContact).toBe(true);
    expect(nextState.players[0].outcome).toEqual({
      kind: PlayerOutcomeKind.Defeated,
      reason: PlayerDefeatReason.HazardContact,
    });
  });

  it("does not mutate the previous state", () => {
    const initialState = validInitialState();

    stepWithInitialMovementConstants(initialState, validInputCommand());

    expect(initialState).toEqual(validInitialState());
  });

  it("updates level contacts after movement and collision resolution", () => {
    const hazardState: SimulationState = {
      ...stateWithPlayerAt({
        x: 90,
        y: 64,
      }),
    };

    const nextState = stepWithInitialMovementConstants(
      hazardState,
      validInputCommand(),
    );

    expect(nextState.levelContacts).toEqual({
      hazard: true,
      goal: false,
    });
    expect(nextState.players[0].outcome).toEqual({
      kind: "defeated",
      reason: PlayerDefeatReason.HazardAndEnemyContact,
    });
    expect(nextState.collectibles).toEqual({
      collectedCoinEntityIds: [],
      collectedItemEntityIds: [],
      collectedExtraLifeEntityIds: [],
    });
    expectBeetleSideContactEnemyState(nextState);
    expectRightSideBeetleContactResponse(nextState);
  });

  it("updates collectible interactions after movement and collision resolution", () => {
    const itemState: SimulationState = {
      ...stateWithPlayerAt({
        x: 64,
        y: 16,
      }),
    };

    const nextState = stepWithInitialMovementConstants(
      itemState,
      validInputCommand(),
    );

    expect(nextState.collectibles).toEqual({
      collectedCoinEntityIds: [],
      collectedItemEntityIds: ["shard-1"],
      collectedExtraLifeEntityIds: [],
    });
    expect(nextState.players[0].outcome).toEqual({
      kind: "active",
    });
  });

  it("updates enemy interactions after movement and collision resolution", () => {
    const enemyState: SimulationState = {
      ...stateWithPlayerAt({
        x: 96,
        y: 64,
      }),
    };

    const nextState = stepWithInitialMovementConstants(
      enemyState,
      validInputCommand(),
    );

    expectBeetleSideContactEnemyState(nextState);
  });

  it("defeats side-contact enemies while invincibility is active", () => {
    const enemyState: SimulationState = withPlayerOverrides(
      stateWithPlayerAt({
        x: 96,
        y: 64,
      }),
      {
        playerInvincibility: {
          collectedInvincibilityEntityIds: [],
          remainingFrames: testInvincibilityFrameCount(2),
        },
      },
    );

    const nextState = stepWithInitialMovementConstants(
      enemyState,
      validInputCommand(),
    );

    expect(nextState.players[0].invincibility.remainingFrames).toBe(1);
    expectBeetleInvincibilityDefeatedEnemyState(nextState);
    expect(nextState.enemyContactResponse).toEqual({
      kind: "none",
    });
    expect(nextState.players[0].outcome).toEqual({
      kind: "active",
    });
  });

  it("climbs upward while overlapping a climbable actor and holding up", () => {
    const nextState = stepSimulation(
      withPlayerOverrides(
        initialStateForLevel(
          climbableLevelSpec(),
          "Expected climbable initial state.",
        ),
        {
          player: playerWithTestState({
            position: { x: 16, y: 64 },
            velocity: { x: 0, y: 0 },
            movement: {
              horizontal: HorizontalMovementState.Idle,
              vertical: VerticalMovementState.Falling,
            },
          }),
        },
      ),
      climbingInputCommand({ upHeld: true, downHeld: false }),
      initialMovementConstants,
      climbableLevelSpec(),
    );

    expect(nextState.players[0].player.velocity).toEqual({
      x: 0,
      y: 0 - initialMovementConstants.climbSpeed,
    });
    expect(nextState.players[0].player.movement).toEqual({
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Climbing,
    });
    expect(nextState.players[0].player.position.y).toBeCloseTo(
      64 -
        initialMovementConstants.climbSpeed *
          (nominalSixtyHertzFrameDurationMilliseconds / 1000),
      9,
    );
  });

  it("climbs downward while overlapping a climbable actor and holding down", () => {
    const nextState = stepSimulation(
      withPlayerOverrides(
        initialStateForLevel(
          climbableLevelSpec(),
          "Expected climbable initial state.",
        ),
        {
          player: playerWithTestState({
            position: { x: 16, y: 56 },
            velocity: { x: 0, y: 0 },
            movement: {
              horizontal: HorizontalMovementState.Idle,
              vertical: VerticalMovementState.Climbing,
            },
          }),
        },
      ),
      climbingInputCommand({ upHeld: false, downHeld: true }),
      initialMovementConstants,
      climbableLevelSpec(),
    );

    expect(nextState.players[0].player.velocity).toEqual({
      x: 0,
      y: initialMovementConstants.climbSpeed,
    });
    expect(nextState.players[0].player.movement.vertical).toBe(
      VerticalMovementState.Climbing,
    );
  });

  it("preserves previous enemy contacts while adding newly contacted enemies", () => {
    const levelSpec = firstAuthoredLevelSpec();
    const firstEnemyPlayer = playerWithTestState({
      position: {
        x: 0,
        y: 64,
      },
      velocity: {
        x: 0,
        y: 0,
      },
      movement: {
        horizontal: HorizontalMovementState.Idle,
        vertical: VerticalMovementState.Grounded,
      },
    });
    const priorEnemyState = resolveEnemyInteractionState(
      firstEnemyPlayer,
      firstEnemyPlayer,
      levelSpec,
      makeInitialEnemyMotionState(levelSpec, initialMovementConstants),
      initialMovementConstants,
      makeEmptyEnemyInteractionState(),
    );
    const enemyState: SimulationState = {
      ...stateWithPlayerAt({
        x: 96,
        y: 64,
      }),
      enemies: priorEnemyState,
    };

    const nextState = stepSimulation(
      enemyState,
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.enemies).toEqual({
      contactedEnemyEntityIds: ["beetle-2", "beetle-1"],
      defeatedEnemyEntityIds: [],
      shelledEnemyEntityIds: [],
      nudgedShellEnemyEntityIds: [],
      nudgedShellDirectionByEntityId: new Map(),
      currentStompChainCount: 0,
      cumulativeStompScore: 0,
      cumulativeStompChainExtraLives: 0,
      cumulativeInvincibilityScore: 0,
      cumulativeShellKillScore: 0,
      currentShellKillChainCount: 0,
      cumulativeShellKillExtraLives: 0,
      cumulativeProjectileKillScore: 0,
    });
    expect(nextState.players[0].outcome).toEqual({
      kind: "defeated",
      reason: PlayerDefeatReason.EnemyContact,
    });
  });

  it("updates player outcome after enemy-only contact", () => {
    const enemyState: SimulationState = {
      ...stateWithPlayerAt({
        x: 96,
        y: 64,
      }),
    };

    const nextState = stepRightSideEnemyContactWithoutHazard(enemyState);

    expectRightSideEnemyContactWithoutHazard(nextState);
    expect(nextState.players[0].outcome).toEqual({
      kind: "defeated",
      reason: PlayerDefeatReason.EnemyContact,
    });
  });

  it("starts recovery instead of defeat after powered enemy side contact", () => {
    const enemyState: SimulationState = withPlayerOverrides(
      stateWithPlayerAt({
        x: 96,
        y: 64,
      }),
      {
        playerVitality: {
          kind: PlayerVitalityKind.Powered,
        },
      },
    );

    const nextState = stepRightSideEnemyContactWithoutHazard(enemyState);

    expectRightSideEnemyContactWithoutHazard(nextState);
    expect(nextState.players[0].vitality).toEqual({
      kind: "recovering",
      sourceEnemyEntityId: testEnemyEntityId("beetle-1"),
      contactSide: EnemySideContactSide.Right,
      startFrameIndex: testFrameIndex(1),
      remainingKnockbackFrames:
        initialMovementConstants.damageRecoveryKnockbackFrameCount,
      remainingInvulnerabilityFrames:
        initialMovementConstants.damageRecoveryInvulnerabilityFrameCount,
    });
    expect(nextState.players[0].outcome).toEqual({
      kind: "active",
    });
  });

  it("continues recovery knockback while ignoring horizontal input", () => {
    const recoveringState: SimulationState = withPlayerOverrides(
      stateWithPlayerAt({
        x: 32,
        y: 56,
      }),
      {
        playerVitality: recoveringVitalityState(
          EnemySideContactSide.Left,
          2,
          3,
        ),
      },
    );
    const rightInputResult = makeSimulationInputCommand(
      HorizontalInput.Right,
      false,
      true,
      false,
      false,
      false,
    );

    if (!rightInputResult.ok) {
      throw new Error("Expected valid right input command.");
    }

    const nextState = stepSimulation(
      recoveringState,
      rightInputResult.value,
      initialMovementConstants,
      firstAuthoredLevelWithoutHazardSpec(),
    );

    expect(nextState.players[0].vitality).toEqual(
      recoveringVitalityState(EnemySideContactSide.Left, 1, 2),
    );
    expect(nextState.players[0].player.velocity.x).toBe(
      initialMovementConstants.enemySideContactKnockbackSpeed,
    );
    expect(nextState.players[0].outcome).toEqual({
      kind: "active",
    });
  });

  it("keeps recovering enemy body contact active while invulnerable", () => {
    const recoveringState: SimulationState = withPlayerOverrides(
      stateWithPlayerAt({
        x: 96,
        y: 64,
      }),
      {
        playerVitality: recoveringVitalityState(
          EnemySideContactSide.Right,
          0,
          3,
        ),
      },
    );

    const nextState = stepSimulation(
      recoveringState,
      validInputCommand(),
      initialMovementConstants,
      firstAuthoredLevelWithoutHazardSpec(),
    );

    expectBeetleSideContactEnemyState(nextState);
    expect(nextState.players[0].vitality).toEqual(
      recoveringVitalityState(EnemySideContactSide.Right, 0, 2),
    );
    expect(nextState.players[0].outcome).toEqual({
      kind: "active",
    });
  });

  it("returns recovering vitality to small when invulnerability expires", () => {
    const nextState = stepRecoveringVitalityToSmall({ x: 32, y: 56 }, 0, 1);

    expect(nextState.players[0].outcome).toEqual({
      kind: "active",
    });
  });

  it("defeats a recovering player on the frame invulnerability expires while still touching an enemy", () => {
    const nextState = stepRecoveringVitalityToSmall({ x: 96, y: 64 }, 0, 1);

    expect(nextState.players[0].outcome).toEqual({
      kind: "defeated",
      reason: PlayerDefeatReason.EnemyContact,
    });
  });

  it("defeats an enemy after downward stomp contact without defeating the player", () => {
    const nextState = stepSimulation(
      stompPlayerSimulationState(),
      validInputCommand(),
      initialMovementConstants,
      firstAuthoredLevelWithoutHazardSpec(),
    );

    expect(nextState.levelContacts).toEqual({
      hazard: false,
      goal: false,
    });
    expectBeetleStompDefeatedWithRebound(nextState);
    expect(nextState.enemyStompReaction.active).toBe(true);
    expect(nextState.enemyStompReaction.remainingFrames).toBeGreaterThan(0);
    // The reaction is emitted on the squashed enemy, not the player above it.
    const beetle = requireEnemyPatrolActorState(
      nextState.enemyMotion,
      "beetle-1",
    );
    expect(nextState.enemyStompReaction.x).toBe(beetle.position.x);
    expect(nextState.enemyStompReaction.y).toBe(beetle.position.y);
    expect(nextState.enemyStompReaction.y).toBeGreaterThan(
      nextState.players[0].player.position.y,
    );
    expect(beetle.velocity.x).toBe(0);
    expect(nextState.players[0].player.movement.vertical).toBe(
      VerticalMovementState.Jumping,
    );
  });

  it("defeats an enemy by stomp while the player is recovering", () => {
    const nextState = stepSimulation(
      stompPlayerSimulationState(
        recoveringVitalityState(EnemySideContactSide.Right, 2, 5),
      ),
      validInputCommand(),
      initialMovementConstants,
      firstAuthoredLevelWithoutHazardSpec(),
    );

    expectBeetleStompDefeatedWithRebound(nextState);
    expect(nextState.players[0].vitality).toEqual(
      recoveringVitalityState(EnemySideContactSide.Right, 1, 4),
    );
  });

  it("defeats enemies hit by a moving armored shell", () => {
    const levelSpec = shellCollisionLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected shell collision initial state to validate.",
    );

    const nextState = stepSimulation(
      {
        ...initialState,
        enemyMotion: {
          ...initialState.enemyMotion,
          activeEnemyEntityIds: [
            testEnemyEntityId("crab-1"),
            testEnemyEntityId("beetle-1"),
          ],
          patrolActors: initialState.enemyMotion.patrolActors.map((actor) =>
            actor.entityId === "beetle-1"
              ? {
                  ...actor,
                  velocity: {
                    x: requireSimulationVelocity(
                      0,
                      "test.enemyMotion.patrolActors[].velocity.x",
                    ),
                    y: requireSimulationVelocity(
                      0,
                      "test.enemyMotion.patrolActors[].velocity.y",
                    ),
                  },
                }
              : actor,
          ),
          armoredActors: slideShell(
            initialState.enemyMotion.armoredActors,
            "crab-1",
          ),
        },
      },
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expectBeetleShellDefeatedEnemyState(nextState);
    expect(nextState.players[0].outcome).toEqual({
      kind: "active",
    });
    expect(
      nextState.enemyMotion.armoredActors.find(
        (actor) => actor.entityId === "crab-1",
      ),
    ).toMatchObject({
      behavior: ArmoredEnemyBehavior.Shell,
      velocity: {
        x: initialMovementConstants.shellSlideSpeed,
      },
    });
  });

  it("bounces the player up when stomping a walking koopa into a shell", () => {
    // A fast drop straight onto a grounded koopa: it must retreat into a shell
    // (not defeat the player) and bounce the player up — the same rebound as
    // stomping any enemy — so the fresh shell can't overlap and kill him next
    // frame ("jumping on a koopa killed me").
    const levelSpec = shellCollisionLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected shell collision initial state to validate.",
    );

    const nextState = stepSimulation(
      withPlayerOverrides(initialState, {
        player: playerWithTestState({
          position: { x: 32, y: 48 },
          velocity: {
            x: 0,
            y: 600,
          },
          movement: {
            horizontal: HorizontalMovementState.Idle,
            vertical: VerticalMovementState.Falling,
          },
        }),
      }),
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.enemies.shelledEnemyEntityIds).toEqual(["crab-1"]);
    expect(nextState.enemies.contactedEnemyEntityIds).toEqual([]);
    expect(nextState.players[0].outcome).toEqual({ kind: "active" });
    expect(nextState.players[0].player.movement.vertical).toBe(
      VerticalMovementState.Jumping,
    );
    expect(nextState.players[0].player.velocity.y).toBeLessThan(0);
  });

  it("scores a kicked shell's kill chain with the rising sequence", () => {
    const levelSpec = twoEnemyShellLevelSpec();
    const initialState = initialStateForLevel(
      levelSpec,
      "Expected two-enemy shell level state to validate.",
    );
    const zeroVelocity = {
      x: requireSimulationVelocity(0, "test.zeroVelocity.x"),
      y: requireSimulationVelocity(0, "test.zeroVelocity.y"),
    };

    let state: SimulationState = {
      ...initialState,
      enemyMotion: {
        ...initialState.enemyMotion,
        activeEnemyEntityIds: [
          testEnemyEntityId("crab-1"),
          testEnemyEntityId("beetle-1"),
          testEnemyEntityId("beetle-2"),
        ],
        patrolActors: initialState.enemyMotion.patrolActors.map((actor) =>
          actor.entityId === "beetle-1" || actor.entityId === "beetle-2"
            ? { ...actor, velocity: zeroVelocity }
            : actor,
        ),
        armoredActors: slideShell(
          initialState.enemyMotion.armoredActors,
          "crab-1",
        ),
      },
    };

    for (
      let step = 0;
      step < 60 && state.enemies.defeatedEnemyEntityIds.length < 2;
      step += 1
    ) {
      state = stepSimulation(
        state,
        validInputCommand(),
        initialMovementConstants,
        levelSpec,
      );
    }

    expect(state.enemies.defeatedEnemyEntityIds).toEqual(
      expect.arrayContaining(["beetle-1", "beetle-2"]),
    );
    // A shell that stays in motion scores the rising chain: 100 + 200 = 300.
    expect(state.enemies.cumulativeShellKillScore).toBe(300);
    expect(state.enemies.currentShellKillChainCount).toBe(2);
    expect(state.enemies.cumulativeShellKillExtraLives).toBe(0);
  });

  it("updates player outcome after goal contact", () => {
    const goalState: SimulationState = {
      ...stateWithPlayerAt({
        x: 480,
        y: 32,
      }),
    };

    const nextState = stepWithInitialMovementConstants(
      goalState,
      validInputCommand(),
    );

    expect(nextState.levelContacts).toEqual({
      hazard: false,
      goal: true,
    });
    expect(nextState.players[0].outcome).toEqual({
      kind: "finished",
      reason: PlayerFinishReason.GoalContact,
    });
    // Grabbing the goal at the top (row 2) awards the flag-ball 5000 band.
    expect(nextState.goalHeightScore).toBe(5000);
  });

  it("awards time bonus score when reaching the goal on a timed level", () => {
    const timedLevelResult = makeLevelSpec({
      ...firstAuthoredLevelInput,
      levelTimers: [
        {
          timerId: runtimeLevelTimerId,
          frames: 48,
        },
      ],
    });

    if (!timedLevelResult.ok) {
      throw new Error("Expected timed goal-contact level to validate.");
    }

    const initialStateResult = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      timedLevelResult.value,
      initialMovementConstants,
    );

    if (!initialStateResult.ok) {
      throw new Error("Expected timed initial state to validate.");
    }

    const goalState: SimulationState = withPlayerOverrides(
      initialStateResult.value,
      { player: stateWithPlayerAt({ x: 480, y: 32 }).players[0].player },
    );

    const nextState = stepSimulation(
      goalState,
      validInputCommand(),
      initialMovementConstants,
      timedLevelResult.value,
    );

    expect(nextState.players[0].outcome).toEqual({
      kind: "finished",
      reason: PlayerFinishReason.GoalContact,
    });
    expect(nextState.timeBonusScore).toBe(100);
  });

  it("keeps player outcome active after exit actor overlap without goal tile contact", () => {
    const levelSpec = exitActorWithoutGoalTileLevelSpec();
    const exitActorOnlyState: SimulationState = {
      ...stateWithPlayerAt({
        x: 32,
        y: 56,
      }),
      enemyMotion: makeInitialEnemyMotionState(
        levelSpec,
        initialMovementConstants,
      ),
    };

    const nextState = stepSimulation(
      exitActorOnlyState,
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.levelContacts).toEqual({
      hazard: false,
      goal: false,
    });
    expect(nextState.players[0].outcome).toEqual({
      kind: "active",
    });
  });

  it("updates player outcome after simultaneous goal and enemy contact", () => {
    const levelSpec = finishWithEnemyLevelSpec();
    const finishEnemyState: SimulationState = {
      ...stateWithPlayerAt({
        x: 32,
        y: 64,
      }),
      enemyMotion: makeInitialEnemyMotionState(
        levelSpec,
        initialMovementConstants,
      ),
    };

    const nextState = stepSimulation(
      finishEnemyState,
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.levelContacts).toEqual({
      hazard: false,
      goal: true,
    });
    expectBeetleSideContactEnemyState(nextState);
    expect(nextState.players[0].outcome).toEqual({
      kind: "defeated-and-finished",
      defeatReason: PlayerDefeatReason.EnemyContact,
      finishReason: PlayerFinishReason.GoalContact,
    });
  });

  it("transitions small vitality to powered after collecting a power-up", () => {
    const levelSpec = powerUpRouteLevelSpec();
    const initialStateResult = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      initialMovementConstants,
    );

    if (!initialStateResult.ok) {
      throw new Error("Expected power-up route initial state to validate.");
    }

    const powerUpState: SimulationState = withPlayerOverrides(
      initialStateResult.value,
      {
        player: playerWithTestState({
          position: {
            x: 32,
            y: 64,
          },
          velocity: {
            x: 0,
            y: 0,
          },
          movement: {
            horizontal: HorizontalMovementState.Idle,
            vertical: VerticalMovementState.Grounded,
          },
        }),
      },
    );

    const nextState = stepSimulation(
      powerUpState,
      validInputCommand(),
      initialMovementConstants,
      levelSpec,
    );

    expect(nextState.powerUps).toEqual({
      collectedPowerUpEntityIds: ["spark-1"],
    });
    expect(nextState.players[0].vitality).toEqual({
      kind: "powered",
    });
    expect(nextState.players[0].player.collider).toEqual({
      width: 14,
      height: 32,
    });
    expect(nextState.players[0].player.position.y).toBe(48);
    expect(nextState.players[0].outcome).toEqual({
      kind: "active",
    });
  });

  it("keeps non-active player outcomes sticky through simulation steps", () => {
    const defeatedState: SimulationState = withPlayerOverrides(
      stateWithPlayerAt({
        x: 480,
        y: 32,
      }),
      {
        playerOutcome: {
          kind: PlayerOutcomeKind.Defeated,
          reason: PlayerDefeatReason.HazardContact,
        },
      },
    );

    const nextState = stepWithInitialMovementConstants(
      defeatedState,
      validInputCommand(),
    );

    expect(nextState.levelContacts).toEqual({
      hazard: false,
      goal: false,
    });
    expect(nextState.players[0].outcome).toEqual({
      kind: "defeated",
      reason: PlayerDefeatReason.HazardContact,
    });
  });

  it("freezes player simulation after a non-active outcome", () => {
    const defeatedState: SimulationState = withPlayerOverrides(
      stateWithPlayerAt({
        x: 16,
        y: 56,
      }),
      {
        playerOutcome: {
          kind: PlayerOutcomeKind.Defeated,
          reason: PlayerDefeatReason.HazardContact,
        },
      },
    );
    const rightInputResult = makeSimulationInputCommand(
      HorizontalInput.Right,
      true,
      true,
      false,
      false,
      false,
    );

    if (!rightInputResult.ok) {
      throw new Error("Expected valid right input command.");
    }

    const nextState = stepWithInitialMovementConstants(
      defeatedState,
      rightInputResult.value,
    );

    expect(nextState.clock).toEqual({
      frameIndex: 1,
      frameDurationMilliseconds: defeatedState.clock.frameDurationMilliseconds,
    });
    expect(nextState.players[0].player).toBe(defeatedState.players[0].player);
    expect(nextState.levelContacts).toBe(defeatedState.levelContacts);
    expect(nextState.players[0].outcome).toBe(defeatedState.players[0].outcome);
    expect(nextState.collectibles).toBe(defeatedState.collectibles);
    expect(nextState.enemies).toBe(defeatedState.enemies);
  });

  it("rejects invalid player outcome states before freezing", () => {
    const corruptedState = corruptedSimulationState({ kind: "corrupted" });

    expect(() =>
      stepWithInitialMovementConstants(corruptedState, validInputCommand()),
    ).toThrow("Invalid player outcome state:");
  });

  it("rejects malformed known player outcome states before freezing", () => {
    const corruptedState = corruptedSimulationState({ kind: "defeated" });

    expect(() =>
      stepWithInitialMovementConstants(corruptedState, validInputCommand()),
    ).toThrow("Defeated player outcome reason is invalid.");
  });

  it("rejects malformed collectible interaction states before freezing", () => {
    const corruptedState = corruptedSimulationState(
      { kind: "defeated", reason: PlayerDefeatReason.HazardContact },
      {
        top: {
          collectibles: {
            collectedCoinEntityIds: [],
            collectedItemEntityIds: ["beetle-1"],
            collectedExtraLifeEntityIds: [],
          },
        },
      },
    );

    expect(() =>
      stepWithInitialMovementConstants(corruptedState, validInputCommand()),
    ).toThrow(
      "Collected item entity id beetle-1 must reference an item actor.",
    );
  });

  it("rejects malformed enemy interaction states before freezing", () => {
    const corruptedState = corruptedSimulationState(
      { kind: "defeated", reason: PlayerDefeatReason.HazardContact },
      {
        top: {
          enemies: {
            contactedEnemyEntityIds: ["shard-1"],
            defeatedEnemyEntityIds: [],
            shelledEnemyEntityIds: [],
            nudgedShellEnemyEntityIds: [],
            nudgedShellDirectionByEntityId: new Map(),
          },
        },
      },
    );

    expect(() =>
      stepWithInitialMovementConstants(corruptedState, validInputCommand()),
    ).toThrow(
      "Contacted enemy entity id shard-1 must reference an enemy actor.",
    );
  });

  it("rejects malformed enemy contact response states before freezing", () => {
    const corruptedState = corruptedSimulationState(
      { kind: "defeated", reason: PlayerDefeatReason.HazardContact },
      {
        top: {
          enemyContactResponse: {
            kind: "side-contact",
            enemyEntityId: "beetle-1",
            contactSide: "top",
            frameIndex: 1,
            velocity: {
              x: -160,
            },
          },
        },
      },
    );

    expect(() =>
      stepWithInitialMovementConstants(corruptedState, validInputCommand()),
    ).toThrow("enemyContactResponse.contactSide must be left or right.");
  });

  it("rejects malformed player vitality states before freezing", () => {
    const corruptedState = corruptedSimulationState(
      { kind: "defeated", reason: PlayerDefeatReason.HazardContact },
      {
        vitality: {
          kind: "recovering",
          sourceEnemyEntityId: "beetle-1",
          contactSide: "top",
          startFrameIndex: 1,
          remainingKnockbackFrames: 0,
          remainingInvulnerabilityFrames: 1,
        },
      },
    );

    expect(() =>
      stepWithInitialMovementConstants(corruptedState, validInputCommand()),
    ).toThrow("playerVitality.contactSide must be left or right.");
  });

  it("retains deterministic frame advancement for repeated commands", () => {
    const inputCommand = validInputCommand();
    const firstState = stepWithInitialMovementConstants(
      validInitialState(),
      inputCommand,
    );
    const secondState = stepWithInitialMovementConstants(
      firstState,
      inputCommand,
    );

    expect(secondState.clock.frameIndex).toBe(2);
  });

  it("spawns deterministic hazard projectiles from active throwing enemies", () => {
    const levelSpec = throwingEnemyLevelSpec();
    const initialStateResult = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      initialMovementConstants,
    );

    if (!initialStateResult.ok) {
      throw new Error("Expected throwing enemy simulation state to validate.");
    }

    let state = initialStateResult.value;

    for (
      let step = 0;
      step < initialMovementConstants.throwingEnemyProjectileIntervalFrameCount;
      step += 1
    ) {
      state = stepSimulation(
        state,
        validInputCommand(),
        initialMovementConstants,
        levelSpec,
      );
    }

    expect(state.enemyMotion.activeEnemyEntityIds).toContain("thrower-1");
    expect(state.timedHazardProjectiles.projectiles).toEqual([
      expect.objectContaining({
        id: "throwing-enemy-thrower-1-90",
        width: initialMovementConstants.throwingEnemyProjectileColliderWidth,
        height: initialMovementConstants.throwingEnemyProjectileColliderHeight,
        active: true,
        remainingLifetimeFrames:
          initialMovementConstants.throwingEnemyProjectileLifetimeFrameCount,
      }),
    ]);
    expect(state.timedHazardProjectiles.projectiles[0]?.velocity.x).toBe(
      0 - initialMovementConstants.throwingEnemyProjectileSpeed,
    );
  });

  it("spawns deterministic downward hazard projectiles from active aerial throwing enemies", () => {
    const levelSpec = aerialThrowingEnemyLevelSpec();
    const initialStateResult = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelSpec,
      initialMovementConstants,
    );

    if (!initialStateResult.ok) {
      throw new Error(
        "Expected aerial throwing enemy simulation state to validate.",
      );
    }

    let state = initialStateResult.value;

    for (
      let step = 0;
      step <
      initialMovementConstants.aerialThrowingEnemyProjectileIntervalFrameCount;
      step += 1
    ) {
      state = stepSimulation(
        state,
        validInputCommand(),
        initialMovementConstants,
        levelSpec,
      );
    }

    expect(state.enemyMotion.activeEnemyEntityIds).toContain(
      "aerial-thrower-1",
    );
    expect(state.timedHazardProjectiles.projectiles).toEqual([
      expect.objectContaining({
        id: "aerial-throwing-enemy-aerial-thrower-1-120",
        width:
          initialMovementConstants.aerialThrowingEnemyProjectileColliderWidth,
        height:
          initialMovementConstants.aerialThrowingEnemyProjectileColliderHeight,
        active: true,
        remainingLifetimeFrames:
          initialMovementConstants.aerialThrowingEnemyProjectileLifetimeFrameCount,
      }),
    ]);
    expect(state.timedHazardProjectiles.projectiles[0]?.velocity).toEqual({
      x: 0,
      y: initialMovementConstants.aerialThrowingEnemyProjectileSpeed,
    });
  });

  it("does not let a swimmer rise above the water surface (grid row 2)", () => {
    // The top two grid rows are the HUD band, so the waterline sits at row 2.
    const waterSurfaceY = 2 * 16;
    const next = stepSimulation(
      withPlayerOverrides(validInitialState(), {
        player: playerWithTestState({
          position: { x: 40, y: waterSurfaceY + 4 },
          velocity: { x: 0, y: -600 }, // stroking hard upward, into the surface
          movement: {
            horizontal: HorizontalMovementState.Idle,
            vertical: VerticalMovementState.Jumping,
          },
        }),
      }),
      validInputCommand(),
      swimmingMovementConstants,
      firstAuthoredLevelWithoutHazardSpec(),
    );

    expect(next.players[0].player.position.y).toBeGreaterThanOrEqual(
      waterSurfaceY,
    );
    expect(next.players[0].player.velocity.y).toBeGreaterThanOrEqual(0);
  });

  it("rejects unsafe frame indexes before advancing", () => {
    const frameIndexResult = makeFrameIndex(
      Number.MAX_SAFE_INTEGER,
      "clock.frameIndex",
    );
    const frameDurationResult = makeFrameDurationMilliseconds(
      nominalSixtyHertzFrameDurationMilliseconds,
      "clock.frameDurationMilliseconds",
    );

    if (!frameIndexResult.ok || !frameDurationResult.ok) {
      throw new Error("Expected safe boundary state construction.");
    }

    expect(() =>
      stepSimulation(
        {
          ...validInitialState(),
          clock: {
            frameIndex: frameIndexResult.value,
            frameDurationMilliseconds: frameDurationResult.value,
          },
        },
        validInputCommand(),
        initialMovementConstants,
        firstAuthoredLevelSpec(),
      ),
    ).toThrow("Simulation frame index cannot advance safely.");
  });
});

describe("crouch (big Mario duck)", () => {
  function inputCommand(
    horizontal: HorizontalInput,
    downHeld: boolean,
  ): SimulationInputCommand {
    const result = makeSimulationInputCommand(
      horizontal,
      false,
      true,
      false,
      false,
      downHeld,
    );
    if (!result.ok) {
      throw new Error("Expected valid crouch test input command.");
    }
    return result.value;
  }

  const bigGroundedState: SimulationState = withPlayerOverrides(
    stateWithPlayerAt({ x: 100, y: 48 }),
    {
      playerVitality: { kind: PlayerVitalityKind.Powered },
    },
  );

  it("stops big Mario walking while Down is held on the ground", () => {
    // Crouch suppresses the walk: pressing Right + Down produces no rightward
    // acceleration, while Right alone accelerates. (The crouch flag itself is
    // re-derived each frame and read by the collision phase; the shrunk duck
    // hurtbox is covered by the player-hurtbox unit tests.)
    const crouched = stepWithInitialMovementConstants(
      bigGroundedState,
      inputCommand(HorizontalInput.Right, true),
    );
    const walking = stepWithInitialMovementConstants(
      bigGroundedState,
      inputCommand(HorizontalInput.Right, false),
    );

    expect(crouched.players[0].player.velocity.x).toBe(0);
    expect(walking.players[0].player.velocity.x).toBeGreaterThan(0);
  });

  it("does not crouch a small player (already short)", () => {
    const smallGrounded = stateWithPlayerAt({ x: 100, y: 56 });
    const stepped = stepWithInitialMovementConstants(
      smallGrounded,
      inputCommand(HorizontalInput.Right, true),
    );
    expect(stepped.players[0].player.crouching ?? false).toBe(false);
    // Small Mario still walks with Down held.
    expect(stepped.players[0].player.velocity.x).toBeGreaterThan(0);
  });
});
