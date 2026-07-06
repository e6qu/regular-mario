import {
  makeLevelSpec,
  type LevelSpec,
  TileCollisionKind,
  ActorRole,
} from "../domain/level-spec";
import { firstAuthoredLevelInput } from "../levels/first-authored-level";
import { playerWithTestState } from "./movement-test-support";
import type { PlayerSimulationState } from "./player-state";
import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";
import type { PixelPosition, VelocityPixelsPerSecond } from "../domain/units";

function makeTileRun(tileId: string, length: number): string[] {
  return Array.from({ length }, () => tileId);
}

export function makeSkyGroundTiles(widthTiles: number): string[][] {
  return [
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("sky", widthTiles),
    makeTileRun("grass", widthTiles),
  ];
}

export function makeSkyGrassTileDefinitions() {
  return [
    {
      tileId: "sky",
      collision: TileCollisionKind.Empty,
    },
    {
      tileId: "grass",
      collision: TileCollisionKind.Solid,
    },
  ];
}

function makeStoneTileDefinition() {
  return {
    tileId: "stone",
    collision: TileCollisionKind.Solid,
  };
}

export function makeSkyGrassStoneTileDefinitions() {
  return [...makeSkyGrassTileDefinitions(), makeStoneTileDefinition()];
}

export function makeRunnerStartDefinition() {
  return {
    actorId: "runner-start",
    role: ActorRole.PlayerStart,
  };
}

function makeEnemyDefinition() {
  return {
    actorId: "beetle",
    role: ActorRole.Enemy,
  };
}

function makeThrowingEnemyDefinition() {
  return {
    actorId: "thrower",
    role: ActorRole.ThrowingEnemy,
  };
}

function makeAerialThrowingEnemyDefinition() {
  return {
    actorId: "aerial-thrower",
    role: ActorRole.AerialThrowingEnemy,
  };
}

export function makeExitDefinition() {
  return {
    actorId: "open-gate",
    role: ActorRole.Exit,
  };
}

function makePowerUpDefinition() {
  return {
    actorId: "spark-cap",
    role: ActorRole.PowerUp,
  };
}

export function makeRunnerStartActor() {
  return {
    entityId: "runner-1",
    actorId: "runner-start",
    x: 1,
    y: 4,
  };
}

export function makeExitActor(x: number) {
  return {
    entityId: "gate-1",
    actorId: "open-gate",
    x,
    y: 4,
  };
}

export function firstAuthoredLevelSpec(): LevelSpec {
  const result = makeLevelSpec(firstAuthoredLevelInput);

  if (!result.ok) {
    throw new Error("Expected first authored level to validate.");
  }

  return result.value;
}

export function adjacentEnemyLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 6,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [
      makeRunnerStartDefinition(),
      makeEnemyDefinition(),
      makeExitDefinition(),
    ],
    tiles: makeSkyGroundTiles(6),
    actors: [
      makeRunnerStartActor(),
      {
        entityId: "beetle-a",
        actorId: "beetle",
        x: 2,
        y: 4,
      },
      {
        entityId: "beetle-b",
        actorId: "beetle",
        x: 3,
        y: 4,
      },
      makeExitActor(5),
    ],
  });

  if (!result.ok) {
    throw new Error("Expected adjacent enemy level to validate.");
  }

  return result.value;
}

export function enemyClusterRunupLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 14,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [
      makeRunnerStartDefinition(),
      makeEnemyDefinition(),
      makeExitDefinition(),
    ],
    tiles: makeSkyGroundTiles(14),
    actors: [
      makeRunnerStartActor(),
      {
        entityId: "beetle-a",
        actorId: "beetle",
        x: 8,
        y: 4,
      },
      {
        entityId: "beetle-b",
        actorId: "beetle",
        x: 9,
        y: 4,
      },
      makeExitActor(13),
    ],
  });

  if (!result.ok) {
    throw new Error("Expected enemy cluster runup level to validate.");
  }

  return result.value;
}

export function throwingEnemyLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 8,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [
      makeRunnerStartDefinition(),
      makeThrowingEnemyDefinition(),
      makeExitDefinition(),
    ],
    tiles: makeSkyGroundTiles(8),
    actors: [
      makeRunnerStartActor(),
      {
        entityId: "thrower-1",
        actorId: "thrower",
        x: 3,
        y: 4,
      },
      makeExitActor(7),
    ],
  });

  if (!result.ok) {
    throw new Error("Expected throwing enemy level to validate.");
  }

  return result.value;
}

export function aerialThrowingEnemyLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 8,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [
      makeRunnerStartDefinition(),
      makeAerialThrowingEnemyDefinition(),
      makeExitDefinition(),
    ],
    tiles: makeSkyGroundTiles(8),
    actors: [
      makeRunnerStartActor(),
      {
        entityId: "aerial-thrower-1",
        actorId: "aerial-thrower",
        x: 3,
        y: 2,
      },
      makeExitActor(7),
    ],
  });

  if (!result.ok) {
    throw new Error("Expected aerial throwing enemy level to validate.");
  }

  return result.value;
}

export function twoTileGapLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 18,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [makeRunnerStartDefinition(), makeExitDefinition()],
    tiles: [
      makeTileRun("sky", 18),
      makeTileRun("sky", 18),
      makeTileRun("sky", 18),
      makeTileRun("sky", 18),
      makeTileRun("sky", 18),
      [
        "grass",
        "grass",
        "grass",
        "grass",
        "grass",
        "grass",
        "grass",
        "grass",
        "grass",
        "grass",
        "sky",
        "sky",
        "grass",
        "grass",
        "grass",
        "grass",
        "grass",
        "grass",
      ],
    ],
    actors: [makeRunnerStartActor(), makeExitActor(16)],
  });

  if (!result.ok) {
    throw new Error("Expected two-tile-gap level to validate.");
  }

  return result.value;
}

export function exitActorWithoutGoalTileLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 4,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [makeRunnerStartDefinition(), makeExitDefinition()],
    tiles: makeSkyGroundTiles(4),
    actors: [makeRunnerStartActor(), makeExitActor(2)],
  });

  if (!result.ok) {
    throw new Error("Expected exit actor without goal tile level to validate.");
  }

  return result.value;
}

export function finishWithEnemyLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 6,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: [
      ...makeSkyGrassTileDefinitions(),
      {
        tileId: "gate",
        collision: TileCollisionKind.Goal,
      },
    ],
    actorDefinitions: [
      makeRunnerStartDefinition(),
      makeEnemyDefinition(),
      makeExitDefinition(),
    ],
    tiles: [
      ...makeSkyGroundTiles(6).slice(0, 4),
      ["sky", "sky", "gate", "sky", "sky", "sky"],
      makeTileRun("grass", 6),
    ],
    actors: [
      makeRunnerStartActor(),
      {
        entityId: "beetle-1",
        actorId: "beetle",
        x: 2,
        y: 4,
      },
      makeExitActor(2),
    ],
  });

  if (!result.ok) {
    throw new Error("Expected finish-with-enemy level to validate.");
  }

  return result.value;
}

export function powerUpRouteLevelSpec(): LevelSpec {
  const result = makeLevelSpec({
    widthTiles: 6,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: makeSkyGrassTileDefinitions(),
    actorDefinitions: [
      makeRunnerStartDefinition(),
      makePowerUpDefinition(),
      makeExitDefinition(),
    ],
    tiles: makeSkyGroundTiles(6),
    actors: [
      makeRunnerStartActor(),
      {
        entityId: "spark-1",
        actorId: "spark-cap",
        x: 2,
        y: 4,
      },
      makeExitActor(5),
    ],
  });

  if (!result.ok) {
    throw new Error("Expected power-up route level to validate.");
  }

  return result.value;
}

function blockInteractionLevelSpec(params: {
  readonly blockTileId: string;
  readonly blockCollision: TileCollisionKind;
  readonly blockContentsActorId?: string;
  readonly contentSpawnLimit?: number;
  readonly contentSpawnCooldownFrames?: number;
  readonly extraActorDefinition?: {
    readonly actorId: string;
    readonly role: ActorRole;
  };
  readonly validationName: string;
}): LevelSpec {
  const blockTileDefinition =
    params.blockContentsActorId === undefined
      ? {
          tileId: params.blockTileId,
          collision: params.blockCollision,
        }
      : {
          tileId: params.blockTileId,
          collision: params.blockCollision,
          contentsActorId: params.blockContentsActorId,
          ...(params.contentSpawnLimit === undefined
            ? {}
            : { contentSpawnLimit: params.contentSpawnLimit }),
          ...(params.contentSpawnCooldownFrames === undefined
            ? {}
            : {
                contentSpawnCooldownFrames: params.contentSpawnCooldownFrames,
              }),
        };
  const actorDefinitions =
    params.extraActorDefinition === undefined
      ? [makeRunnerStartDefinition(), makeExitDefinition()]
      : [
          makeRunnerStartDefinition(),
          params.extraActorDefinition,
          makeExitDefinition(),
        ];
  const result = makeLevelSpec({
    widthTiles: 6,
    heightTiles: 6,
    tileSizePixels: 16,
    tileDefinitions: [...makeSkyGrassTileDefinitions(), blockTileDefinition],
    actorDefinitions,
    tiles: [
      ["sky", "sky", "sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "sky", "sky", "sky"],
      ["sky", "sky", "sky", "sky", "sky", "sky"],
      ["sky", "grass", params.blockTileId, "sky", "sky", "sky"],
      makeTileRun("grass", 6),
    ],
    actors: [makeRunnerStartActor(), makeExitActor(5)],
  });

  if (!result.ok) {
    throw new Error(`Expected ${params.validationName} level to validate.`);
  }

  return result.value;
}

export function breakableBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "cracked-stone",
    blockCollision: TileCollisionKind.Breakable,
    validationName: "breakable block",
  });
}

export function interactiveBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "mystery-box",
    blockCollision: TileCollisionKind.Interactive,
    blockContentsActorId: "star-shard",
    extraActorDefinition: {
      actorId: "star-shard",
      role: ActorRole.Item,
    },
    validationName: "interactive block",
  });
}

export function interactiveCoinBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "mystery-box",
    blockCollision: TileCollisionKind.Interactive,
    blockContentsActorId: "coin",
    extraActorDefinition: {
      actorId: "coin",
      role: ActorRole.Coin,
    },
    validationName: "interactive coin block",
  });
}

export function interactiveExtraLifeBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "extra-life-brick",
    blockCollision: TileCollisionKind.Interactive,
    blockContentsActorId: "extra-life",
    extraActorDefinition: {
      actorId: "extra-life",
      role: ActorRole.ExtraLife,
    },
    validationName: "interactive extra-life block",
  });
}

export function interactiveInvincibilityBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "star-block",
    blockCollision: TileCollisionKind.Interactive,
    blockContentsActorId: "invincibility",
    extraActorDefinition: {
      actorId: "invincibility",
      role: ActorRole.InvincibilityPowerUp,
    },
    validationName: "interactive invincibility block",
  });
}

export function interactiveClimbableBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "beanstalk-block",
    blockCollision: TileCollisionKind.Interactive,
    blockContentsActorId: "climbable-vine",
    extraActorDefinition: {
      actorId: "climbable-vine",
      role: ActorRole.Climbable,
    },
    validationName: "interactive climbable block",
  });
}

export function repeatableCoinBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "coin-bank-brick",
    blockCollision: TileCollisionKind.Interactive,
    blockContentsActorId: "coin",
    contentSpawnLimit: 3,
    extraActorDefinition: {
      actorId: "coin",
      role: ActorRole.Coin,
    },
    validationName: "repeatable coin block",
  });
}

export function cooldownCoinBlockLevelSpec(cooldownFrames: number): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "cooldown-coin-brick",
    blockCollision: TileCollisionKind.Interactive,
    blockContentsActorId: "coin",
    contentSpawnLimit: 5,
    contentSpawnCooldownFrames: cooldownFrames,
    extraActorDefinition: {
      actorId: "coin",
      role: ActorRole.Coin,
    },
    validationName: "cooldown coin block",
  });
}

export function interactivePowerUpBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "mystery-box",
    blockCollision: TileCollisionKind.Interactive,
    blockContentsActorId: "spark-cap",
    extraActorDefinition: {
      actorId: "spark-cap",
      role: ActorRole.PowerUp,
    },
    validationName: "interactive power-up block",
  });
}

export function solidHazardBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "cannon-top",
    blockCollision: TileCollisionKind.SolidHazard,
    validationName: "solid hazard block",
  });
}

export function springBlockLevelSpec(): LevelSpec {
  return blockInteractionLevelSpec({
    blockTileId: "spring-top",
    blockCollision: TileCollisionKind.Spring,
    validationName: "spring block",
  });
}

export function makeUpwardMovingPlayerAt(position: {
  readonly x: number;
  readonly y: number;
}): PlayerSimulationState {
  const previousPlayer = playerAt(position);

  return {
    ...previousPlayer,
    position: {
      x: previousPlayer.position.x,
      y: (position.y - 16) as PixelPosition,
    },
    velocity: {
      ...previousPlayer.velocity,
      y: -120 as VelocityPixelsPerSecond,
    },
  };
}

export function playerAt(position: {
  readonly x: number;
  readonly y: number;
}): PlayerSimulationState {
  return playerWithTestState({
    position,
    velocity: {
      x: 0,
      y: 0,
    },
    movement: {
      horizontal: HorizontalMovementState.Idle,
      vertical: VerticalMovementState.Grounded,
    },
  });
}
