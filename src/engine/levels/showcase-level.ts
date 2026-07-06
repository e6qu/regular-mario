import {
  ActorRole,
  TileCollisionKind,
  type LevelSpecInput,
} from "../domain/level-spec";
import type { LevelSpecInput as LevelSpecInputType } from "../domain/level-spec";
import {
  makeEnemyChallengeActorDefinitions,
  makeSegmentedTileRow,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

const showcaseHeightTiles = 8;

const showcaseTileDefinitions: LevelSpecInputType["tileDefinitions"] = [
  ...standardSurfaceTileDefinitions,
  {
    tileId: "interactive-block",
    collision: TileCollisionKind.Interactive,
  },
];

function sky(width: number): string[] {
  return makeTileRun("sky", width);
}

const showcaseOverworldInput: LevelSpecInput = {
  widthTiles: 32,
  heightTiles: showcaseHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: showcaseTileDefinitions,
  actorDefinitions: [
    { actorId: "runner-start", role: ActorRole.PlayerStart },
    { actorId: "beetle", role: ActorRole.Enemy },
    { actorId: "glide-wasp", role: ActorRole.FlyingEnemy },
    { actorId: "spike-hunter", role: ActorRole.ChasingEnemy },
    { actorId: "star-shard", role: ActorRole.Item },
    { actorId: "spark-cap", role: ActorRole.PowerUp },
    { actorId: "green-pipe", role: ActorRole.Pipe },
    { actorId: "open-gate", role: ActorRole.Exit },
  ],
  tiles: [
    sky(32),
    sky(32),
    sky(32),
    makeSegmentedTileRow(32, [
      { tile: "sky", length: 4 },
      { tile: "stone", length: 4 },
      { tile: "sky", length: 32 - 8 },
    ]),
    sky(32),
    makeSegmentedTileRow(32, [
      { tile: "sky", length: 12 },
      { tile: "stone", length: 4 },
      { tile: "sky", length: 32 - 16 },
    ]),
    makeSegmentedTileRow(32, [
      { tile: "sky", length: 6 },
      { tile: "thorn", length: 1 },
      { tile: "sky", length: 4 },
      { tile: "stone", length: 3 },
      { tile: "sky", length: 4 },
      { tile: "gate", length: 1 },
      { tile: "sky", length: 32 - 19 },
    ]),
    makeSegmentedTileRow(32, [
      { tile: "grass", length: 6 },
      { tile: "sky", length: 1 },
      { tile: "grass", length: 14 },
      { tile: "sky", length: 1 },
      { tile: "grass", length: 32 - 22 },
    ]),
  ],
  actors: [
    { entityId: "runner-1", actorId: "runner-start", x: 1, y: 5 },
    { entityId: "shard-1", actorId: "star-shard", x: 5, y: 4 },
    { entityId: "beetle-1", actorId: "beetle", x: 9, y: 5 },
    { entityId: "spark-1", actorId: "spark-cap", x: 14, y: 3 },
    { entityId: "wasp-1", actorId: "glide-wasp", x: 18, y: 2 },
    { entityId: "hunter-1", actorId: "spike-hunter", x: 22, y: 5 },
    {
      entityId: "warp-pipe-1",
      actorId: "green-pipe",
      x: 27,
      y: 5,
      targetTileX: 30,
      targetTileY: 5,
    },
    { entityId: "gate-1", actorId: "open-gate", x: 30, y: 5 },
  ],
  enemyPatrolSpeedByEntityId: {
    "beetle-1": 50,
    "hunter-1": 50,
  },
};

const showcaseUndergroundInput: LevelSpecInput = {
  widthTiles: 28,
  heightTiles: showcaseHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: showcaseTileDefinitions,
  actorDefinitions: makeEnemyChallengeActorDefinitions([
    { actorId: "beetle", role: ActorRole.Enemy },
    { actorId: "shell-crab", role: ActorRole.ArmoredEnemy },
  ]),
  tiles: [
    sky(28),
    sky(28),
    sky(28),
    [
      ...sky(4),
      ...makeTileRun("stone", 4),
      ...sky(6),
      ...makeTileRun("stone", 3),
      ...sky(11),
    ],
    sky(28),
    [
      ...sky(2),
      ...makeTileRun("stone", 3),
      ...sky(5),
      ...makeTileRun("stone", 4),
      ...sky(4),
      "thorn",
      ...sky(9),
    ],
    [
      ...sky(10),
      ...makeTileRun("stone", 2),
      ...sky(3),
      ...makeTileRun("stone", 2),
      ...sky(3),
      "gate",
      ...sky(7),
    ],
    [
      ...makeTileRun("grass", 11),
      "sky",
      "sky",
      "sky",
      ...makeTileRun("grass", 14),
    ],
  ],
  actors: [
    { entityId: "runner-1", actorId: "runner-start", x: 1, y: 5 },
    { entityId: "shard-1", actorId: "star-shard", x: 5, y: 3 },
    { entityId: "beetle-1", actorId: "beetle", x: 8, y: 5 },
    { entityId: "spark-1", actorId: "spark-cap", x: 13, y: 4 },
    { entityId: "crab-1", actorId: "shell-crab", x: 18, y: 5 },
    { entityId: "gate-1", actorId: "open-gate", x: 25, y: 5 },
  ],
  enemyPatrolSpeedByEntityId: {
    "beetle-1": 45,
  },
};

export const showcaseSequence: readonly LevelSpecInput[] = [
  showcaseOverworldInput,
  showcaseUndergroundInput,
];

export const showcaseOverworldLevelInput = showcaseOverworldInput;
