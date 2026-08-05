import { type LevelSpecInput } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

const cavernRouteWidthTiles = 24;
const cavernRouteHeightTiles = 15;
const cavernRouteSkyRows = cavernRouteHeightTiles - 6;

export const cavernRouteLevelInput: LevelSpecInput = {
  widthTiles: cavernRouteWidthTiles,
  heightTiles: cavernRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: makeRouteActorDefinitions({
    includeItem: true,
    includePowerUp: true,
  }),
  tiles: [
    ...Array.from({ length: cavernRouteSkyRows }, () =>
      makeTileRun("sky", cavernRouteWidthTiles),
    ),
    makeTileRun("sky", cavernRouteWidthTiles),
    makeTileRun("sky", cavernRouteWidthTiles),
    makeTileRun("sky", cavernRouteWidthTiles),
    [
      ...makeTileRun("sky", 4),
      ...makeTileRun("stone", 3),
      ...makeTileRun("sky", 9),
      ...makeTileRun("stone", 3),
      ...makeTileRun("sky", 5),
    ],
    [
      ...makeTileRun("sky", 10),
      "thorn",
      ...makeTileRun("sky", 11),
      "gate",
      "sky",
    ],
    [...makeTileRun("grass", 13), "sky", ...makeTileRun("grass", 10)],
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 13,
    },
    {
      entityId: "beetle-1",
      actorId: "beetle",
      x: 8,
      y: 13,
    },
    {
      entityId: "beetle-2",
      actorId: "beetle",
      x: 19,
      y: 13,
    },
    {
      entityId: "shard-1",
      actorId: "star-shard",
      x: 5,
      y: 11,
    },
    {
      entityId: "spark-1",
      actorId: "spark-cap",
      x: 17,
      y: 11,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 22,
      y: 12,
    },
  ],
  enemyPatrolSpeedByEntityId: {
    "beetle-2": 60,
  },
};
