import { type LevelSpecInput } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

const firstAuthoredLevelWidthTiles = 32;
const firstAuthoredLevelHeightTiles = 6;

export const firstAuthoredLevelInput: LevelSpecInput = {
  widthTiles: firstAuthoredLevelWidthTiles,
  heightTiles: firstAuthoredLevelHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: makeRouteActorDefinitions({
    includeItem: true,
  }),
  tiles: [
    makeTileRun("sky", firstAuthoredLevelWidthTiles),
    makeTileRun("sky", firstAuthoredLevelWidthTiles),
    [
      "sky",
      "sky",
      "sky",
      "sky",
      "stone",
      "stone",
      ...makeTileRun("sky", 24),
      "gate",
      "sky",
    ],
    [
      ...makeTileRun("sky", 8),
      "stone",
      "stone",
      "stone",
      ...makeTileRun("sky", 21),
    ],
    [...makeTileRun("sky", 5), "thorn", ...makeTileRun("sky", 26)],
    makeTileRun("grass", firstAuthoredLevelWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 4,
    },
    {
      entityId: "beetle-1",
      actorId: "beetle",
      x: 6,
      y: 4,
    },
    {
      entityId: "beetle-2",
      actorId: "beetle",
      x: 0,
      y: 4,
    },
    {
      entityId: "shard-1",
      actorId: "star-shard",
      x: 4,
      y: 1,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 30,
      y: 2,
    },
  ],
  enemyPatrolSpeedByEntityId: {
    "beetle-2": 60,
  },
};
