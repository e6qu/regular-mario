import type { LevelSpecInput } from "../domain/level-spec";
import { ActorRole } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSkyGrassTileDefinitions,
} from "./level-builder";

const pipeRouteWidthTiles = 10;
const pipeRouteHeightTiles = 6;

export const pipeRouteLevelInput: LevelSpecInput = {
  widthTiles: pipeRouteWidthTiles,
  heightTiles: pipeRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSkyGrassTileDefinitions,
  actorDefinitions: [
    ...makeRouteActorDefinitions(),
    {
      actorId: "green-pipe",
      role: ActorRole.Pipe,
    },
  ],
  tiles: [
    makeTileRun("sky", pipeRouteWidthTiles),
    makeTileRun("sky", pipeRouteWidthTiles),
    makeTileRun("sky", pipeRouteWidthTiles),
    makeTileRun("sky", pipeRouteWidthTiles),
    makeTileRun("sky", pipeRouteWidthTiles),
    makeTileRun("grass", pipeRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 4,
    },
    {
      entityId: "warp-pipe-1",
      actorId: "green-pipe",
      x: 4,
      y: 4,
      targetTileX: 7,
      targetTileY: 4,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 8,
      y: 4,
    },
  ],
};
