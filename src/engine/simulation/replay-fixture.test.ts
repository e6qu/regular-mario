import { TileCollisionKind, ActorRole } from "../domain/level-spec";
import { ValidationErrorCode } from "../domain/validation-error";
import { PlayerDefeatReason, PlayerFinishReason } from "./player-outcome";
import { EnemySideContactSide } from "./enemy-contact-response";
import { HorizontalInput } from "./input-command";
import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";
import { describe, expect, it } from "vitest";

import { makeLevelSpec, type LevelSpec } from "../domain/level-spec";
import { flyingEnemyRouteLevelInput } from "../levels/flying-enemy-route-level";
import { chasingEnemyRouteLevelInput } from "../levels/chasing-enemy-route-level";
import { armoredEnemyRouteLevelInput } from "../levels/armored-enemy-route-level";
import { firstAuthoredLevelInput } from "../levels/first-authored-level";
import { hazardOnlyFeedbackLevelInput } from "../levels/hazard-only-feedback-level";
import {
  makeSimulationInputCommand,
  type SimulationInputCommand,
} from "./input-command";
import { initialMovementConstants } from "./movement-model";
import { makeTileRun } from "../levels/level-builder";
import { EnemyContactResponseKind } from "./enemy-contact-response";
import {
  makeReplayFrameCount,
  runReplayFixture,
  type ReplayFrameCount,
  type ReplayFixture,
} from "./replay-fixture";
import {
  makeInitialSimulationState,
  type SimulationState,
} from "./simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "./simulation-units";
import { PlayerOutcomeKind } from "./player-outcome";

const initialFrameDurationMilliseconds =
  nominalSixtyHertzFrameDurationMilliseconds;

function requireInputCommand(
  horizontal: SimulationInputCommand["horizontal"],
  jumpPressed: boolean,
  runHeld: boolean,
  firePressed: boolean = false,
  upHeld: boolean = false,
  downHeld: boolean = false,
): SimulationInputCommand {
  const result = makeSimulationInputCommand(
    horizontal,
    jumpPressed,
    runHeld,
    firePressed,
    upHeld,
    downHeld,
  );

  if (!result.ok) {
    throw new Error("Expected replay input command to validate.");
  }

  return result.value;
}

function requireReplayFrameCount(value: number): ReplayFrameCount {
  const result = makeReplayFrameCount(value, "replay.segment.frameCount");

  if (!result.ok) {
    throw new Error("Expected replay frame count to validate.");
  }

  return result.value;
}

function requireLevelSpec(
  levelInput: typeof firstAuthoredLevelInput,
): LevelSpec {
  const result = makeLevelSpec(levelInput);

  if (!result.ok) {
    throw new Error("Expected replay level fixture to validate.");
  }

  return result.value;
}

function requireInitialSimulationState(levelSpec: LevelSpec): SimulationState {
  const result = makeInitialSimulationState(
    initialFrameDurationMilliseconds,
    levelSpec,
    initialMovementConstants,
  );

  if (!result.ok) {
    throw new Error("Expected replay initial simulation state to validate.");
  }

  return result.value;
}

function singleSegmentReplayFixture(
  inputCommand: SimulationInputCommand,
  frameCount: number,
): ReplayFixture {
  return replayFixture([
    {
      inputCommand,
      frameCount,
    },
  ]);
}

function replayFixture(
  segments: readonly {
    readonly inputCommand: SimulationInputCommand;
    readonly frameCount: number;
  }[],
): ReplayFixture {
  return {
    segments: segments.map((segment) => ({
      inputCommand: segment.inputCommand,
      frameCount: requireReplayFrameCount(segment.frameCount),
    })),
  };
}

function runAuthoredReplay(
  replayFixture: ReplayFixture,
  levelSpec: LevelSpec,
): SimulationState {
  return runReplayFixture(
    requireInitialSimulationState(levelSpec),
    replayFixture,
    initialMovementConstants,
    levelSpec,
  );
}

type GoldenReplayStateExpectation = {
  readonly frameIndex: number;
  readonly playerPosition: {
    readonly x: number;
    readonly y: number;
  };
  readonly playerVelocity: {
    readonly x: number;
    readonly y: number;
  };
  readonly playerMovement: SimulationState["player"]["movement"];
  readonly playerVitality: unknown;
  readonly levelContacts: SimulationState["levelContacts"];
  readonly playerOutcome: SimulationState["playerOutcome"];
  readonly collectedCoinEntityIds: readonly string[];
  readonly collectedItemEntityIds: readonly string[];
  readonly contactedEnemyEntityIds: readonly string[];
  readonly defeatedEnemyEntityIds: readonly string[];
  readonly enemyContactResponse: unknown;
};

function expectGoldenReplayState(
  finalState: SimulationState,
  expected: GoldenReplayStateExpectation,
): void {
  expect(finalState.clock.frameIndex).toBe(expected.frameIndex);
  expect(finalState.player.position.x).toBeCloseTo(
    expected.playerPosition.x,
    9,
  );
  expect(finalState.player.position.y).toBeCloseTo(
    expected.playerPosition.y,
    9,
  );
  expect(finalState.player.velocity.x).toBeCloseTo(
    expected.playerVelocity.x,
    9,
  );
  expect(finalState.player.velocity.y).toBeCloseTo(
    expected.playerVelocity.y,
    9,
  );
  expect(finalState.player.movement).toEqual(expected.playerMovement);
  expect(finalState.playerVitality).toEqual(expected.playerVitality);
  expect(finalState.levelContacts).toEqual(expected.levelContacts);
  expect(finalState.playerOutcome).toEqual(expected.playerOutcome);
  expect(finalState.collectibles.collectedCoinEntityIds).toEqual(
    expected.collectedCoinEntityIds,
  );
  expect(finalState.collectibles.collectedItemEntityIds).toEqual(
    expected.collectedItemEntityIds,
  );
  expect(finalState.enemies.contactedEnemyEntityIds).toEqual(
    expected.contactedEnemyEntityIds,
  );
  expect(finalState.enemies.defeatedEnemyEntityIds).toEqual(
    expected.defeatedEnemyEntityIds,
  );
  expect(finalState.enemyContactResponse).toEqual(
    expected.enemyContactResponse,
  );
}

function expectRightwardHazardReplayState(
  finalState: SimulationState,
  playerPositionX: number,
  expectedPlayerVelocityX: number,
  playerOutcome: SimulationState["playerOutcome"],
  contactedEnemyEntityIds: readonly string[],
  enemyContactResponse: unknown,
): void {
  expectGoldenReplayState(finalState, {
    frameIndex: 58,
    playerPosition: {
      x: playerPositionX,
      y: 56,
    },
    playerVelocity: {
      x: expectedPlayerVelocityX,
      y: 0,
    },
    playerMovement: {
      horizontal: HorizontalMovementState.Running,
      vertical: VerticalMovementState.Grounded,
    },
    playerVitality: {
      kind: "small",
    },
    levelContacts: {
      hazard: true,
      goal: false,
    },
    playerOutcome,
    collectedCoinEntityIds: [],
    collectedItemEntityIds: [],
    contactedEnemyEntityIds,
    defeatedEnemyEntityIds: [],
    enemyContactResponse,
  });
}

function expectGoldenActiveState(
  finalState: SimulationState,
  expected: {
    readonly frameIndex: number;
    readonly playerPosition: { readonly x: number; readonly y: number };
    readonly playerVelocity: { readonly x: number; readonly y: number };
    readonly playerMovement: {
      readonly horizontal: string;
      readonly vertical: string;
    };
    readonly collectedItemEntityIds: readonly string[];
    readonly contactedEnemyEntityIds: readonly string[];
    readonly defeatedEnemyEntityIds: readonly string[];
    readonly enemyContactResponse: unknown;
  },
): void {
  expectGoldenReplayState(finalState, {
    frameIndex: expected.frameIndex,
    playerPosition: expected.playerPosition,
    playerVelocity: expected.playerVelocity,
    playerMovement:
      expected.playerMovement as GoldenReplayStateExpectation["playerMovement"],
    playerVitality: { kind: "small" },
    levelContacts: { hazard: false, goal: false },
    playerOutcome: { kind: PlayerOutcomeKind.Active },
    collectedCoinEntityIds: [],
    collectedItemEntityIds: expected.collectedItemEntityIds,
    contactedEnemyEntityIds: expected.contactedEnemyEntityIds,
    defeatedEnemyEntityIds: expected.defeatedEnemyEntityIds,
    enemyContactResponse: expected.enemyContactResponse,
  });
}

function expectGoldenEnemyContactDefeatState(
  finalState: SimulationState,
  expected: {
    frameIndex: number;
    playerPosition: { x: number; y: number };
    playerVelocity: { x: number; y: number };
    playerMovement: { horizontal: string; vertical: string };
    contactedEnemyEntityIds: readonly string[];
    enemyContactResponse: unknown;
  },
): void {
  expectGoldenReplayState(finalState, {
    ...expected,
    playerMovement:
      expected.playerMovement as GoldenReplayStateExpectation["playerMovement"],
    playerVitality: { kind: "small" },
    levelContacts: { hazard: false, goal: false },
    playerOutcome: {
      kind: PlayerOutcomeKind.Defeated,
      reason: PlayerDefeatReason.EnemyContact,
    },
    collectedCoinEntityIds: [],
    collectedItemEntityIds: [],
    defeatedEnemyEntityIds: [],
  });
}

describe("replay fixture", () => {
  it("rejects invalid replay frame counts", () => {
    expect(makeReplayFrameCount(0, "replay.segment.frameCount")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.ReplayFrameCountInvalid,
          message: "replay.segment.frameCount must be a positive safe integer.",
          path: "replay.segment.frameCount",
        },
      ],
    });
  });

  it("replays the enemy-only authored route deterministically", () => {
    const finalState = runAuthoredReplay(
      singleSegmentReplayFixture(
        requireInputCommand(HorizontalInput.Left, false, true),
        32,
      ),
      requireLevelSpec(firstAuthoredLevelInput),
    );

    expectGoldenEnemyContactDefeatState(finalState, {
      frameIndex: 32,
      playerPosition: {
        x: 15.822_222_222_215_11,
        y: 56,
      },
      playerVelocity: {
        x: initialMovementConstants.enemySideContactKnockbackSpeed,
        y: 0,
      },
      playerMovement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Grounded,
      },
      contactedEnemyEntityIds: ["beetle-2"],
      enemyContactResponse: {
        kind: EnemyContactResponseKind.SideContact,
        enemyEntityId: "beetle-2",
        contactSide: EnemySideContactSide.Left,
        frameIndex: 1,
        velocity: {
          x: initialMovementConstants.enemySideContactKnockbackSpeed,
        },
      },
    });
  });

  it("replays the hazard-only authored route deterministically", () => {
    const finalState = runAuthoredReplay(
      singleSegmentReplayFixture(
        requireInputCommand(HorizontalInput.Right, false, true),
        58,
      ),
      requireLevelSpec(hazardOnlyFeedbackLevelInput),
    );

    expectRightwardHazardReplayState(
      finalState,
      67.166_666_668_063_34,
      150,
      {
        kind: PlayerOutcomeKind.Defeated,
        reason: PlayerDefeatReason.HazardContact,
      },
      [],
      {
        kind: "none",
      },
    );
  });

  it("replays the hazard-plus-enemy authored route deterministically", () => {
    const finalState = runAuthoredReplay(
      singleSegmentReplayFixture(
        requireInputCommand(HorizontalInput.Right, false, true),
        58,
      ),
      requireLevelSpec(firstAuthoredLevelInput),
    );

    expectGoldenEnemyContactDefeatState(finalState, {
      frameIndex: 58,
      playerPosition: {
        x: 64.666_666_668_013_35,
        y: 56,
      },
      playerVelocity: {
        x: -150,
        y: 0,
      },
      playerMovement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Grounded,
      },
      contactedEnemyEntityIds: ["beetle-1"],
      enemyContactResponse: {
        kind: EnemyContactResponseKind.SideContact,
        enemyEntityId: "beetle-1",
        contactSide: EnemySideContactSide.Right,
        frameIndex: 26,
        velocity: {
          x: -150,
        },
      },
    });
  });

  it("replays the collectible authored route deterministically", () => {
    const finalState = runAuthoredReplay(
      singleSegmentReplayFixture(
        requireInputCommand(HorizontalInput.Right, true, true),
        48,
      ),
      requireLevelSpec(firstAuthoredLevelInput),
    );

    expectGoldenActiveState(finalState, {
      frameIndex: 48,
      playerPosition: {
        x: 119.666_666_669_113_21,
        y: -2.308_333_331_609_628,
      },
      playerVelocity: {
        x: 150,
        y: 240,
      },
      playerMovement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Falling,
      },
      collectedItemEntityIds: [],
      contactedEnemyEntityIds: [],
      defeatedEnemyEntityIds: [],
      enemyContactResponse: {
        kind: "none",
      },
    });
  });

  it("replays the finish authored route deterministically", () => {
    const finalState = runAuthoredReplay(
      singleSegmentReplayFixture(
        requireInputCommand(HorizontalInput.Right, false, true),
        200,
      ),
      requireLevelSpec({
        widthTiles: 12,
        heightTiles: 6,
        tileSizePixels: 16,
        tileDefinitions: [
          { tileId: "sky", collision: TileCollisionKind.Empty },
          { tileId: "grass", collision: TileCollisionKind.Solid },
          { tileId: "gate", collision: TileCollisionKind.Goal },
        ],
        actorDefinitions: [
          { actorId: "runner-start", role: ActorRole.PlayerStart },
          { actorId: "open-gate", role: ActorRole.Exit },
        ],
        tiles: [
          makeTileRun("sky", 12),
          makeTileRun("sky", 12),
          makeTileRun("sky", 12),
          makeTileRun("sky", 12),
          [...makeTileRun("sky", 10), "gate", "sky"],
          makeTileRun("grass", 12),
        ],
        actors: [
          { entityId: "runner-1", actorId: "runner-start", x: 1, y: 4 },
          { entityId: "gate-1", actorId: "open-gate", x: 10, y: 4 },
        ],
      }),
    );

    expectGoldenReplayState(finalState, {
      frameIndex: 200,
      playerPosition: {
        x: 147.166_666_669_663_16,
        y: 56,
      },
      playerVelocity: {
        x: 150,
        y: 0,
      },
      playerMovement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Grounded,
      },
      playerVitality: {
        kind: "small",
      },
      levelContacts: {
        hazard: false,
        goal: true,
      },
      playerOutcome: {
        kind: PlayerOutcomeKind.Finished,
        reason: PlayerFinishReason.GoalContact,
      },
      collectedCoinEntityIds: [],
      collectedItemEntityIds: [],
      contactedEnemyEntityIds: [],
      defeatedEnemyEntityIds: [],
      enemyContactResponse: {
        kind: "none",
      },
    });
  });

  it("replays the flying enemy route deterministically", () => {
    const finalState = runAuthoredReplay(
      singleSegmentReplayFixture(
        requireInputCommand(HorizontalInput.Right, false, true),
        120,
      ),
      requireLevelSpec(flyingEnemyRouteLevelInput),
    );

    expectGoldenReplayState(finalState, {
      frameIndex: 120,
      playerPosition: {
        x: 222.166_666_671_162_97,
        y: 97.125_000_001_085_03,
      },
      playerVelocity: {
        x: 150,
        y: 240,
      },
      playerMovement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Falling,
      },
      playerVitality: {
        kind: "small",
      },
      levelContacts: {
        hazard: false,
        goal: false,
      },
      playerOutcome: {
        kind: PlayerOutcomeKind.Defeated,
        reason: PlayerDefeatReason.PitContact,
      },
      collectedCoinEntityIds: [],
      collectedItemEntityIds: [],
      contactedEnemyEntityIds: [],
      defeatedEnemyEntityIds: [],
      enemyContactResponse: {
        kind: EnemyContactResponseKind.None,
      },
    });
  });

  it("replays the chasing enemy route deterministically", () => {
    const finalState = runAuthoredReplay(
      singleSegmentReplayFixture(
        requireInputCommand(HorizontalInput.Right, false, false),
        60,
      ),
      requireLevelSpec(chasingEnemyRouteLevelInput),
    );

    expectGoldenEnemyContactDefeatState(finalState, {
      frameIndex: 60,
      playerPosition: {
        x: 52.841_666_667_570_315,
        y: 56,
      },
      playerVelocity: {
        x: -150,
        y: 0,
      },
      playerMovement: {
        horizontal: HorizontalMovementState.Walking,
        vertical: VerticalMovementState.Grounded,
      },
      contactedEnemyEntityIds: ["hunter-1"],
      enemyContactResponse: {
        kind: EnemyContactResponseKind.SideContact,
        enemyEntityId: "hunter-1",
        contactSide: EnemySideContactSide.Right,
        frameIndex: 30,
        velocity: {
          x: -150,
        },
      },
    });
  });

  it("replays the armored enemy route deterministically", () => {
    const finalState = runAuthoredReplay(
      replayFixture([
        {
          inputCommand: requireInputCommand(HorizontalInput.Right, false, true),
          frameCount: 40,
        },
        {
          inputCommand: requireInputCommand(
            HorizontalInput.Neutral,
            true,
            false,
          ),
          frameCount: 40,
        },
      ]),
      requireLevelSpec(armoredEnemyRouteLevelInput),
    );

    expectGoldenEnemyContactDefeatState(finalState, {
      frameIndex: 80,
      playerPosition: {
        x: 64.666_666_668_013_35,
        y: 56,
      },
      playerVelocity: {
        x: -150,
        y: 0,
      },
      playerMovement: {
        horizontal: HorizontalMovementState.Running,
        vertical: VerticalMovementState.Grounded,
      },
      contactedEnemyEntityIds: ["crab-1"],
      enemyContactResponse: {
        kind: EnemyContactResponseKind.SideContact,
        enemyEntityId: "crab-1",
        contactSide: EnemySideContactSide.Right,
        frameIndex: 26,
        velocity: {
          x: -150,
        },
      },
    });
  });
});
