import type { LevelSpecInput } from "../domain/level-spec";
import { ActorRole } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSkyGrassTileDefinitions,
} from "./level-builder";

// A two-level fixture exercising a cross-level warp pipe: entering the pipe in
// the main level loads the (deliberately wider) underground level and drops the
// player at the pipe's destination tile.
export const warpRouteUndergroundLevelName = "warp-route-underground";

const mainWidthTiles = 10;
const undergroundWidthTiles = 12;
const heightTiles = 6;

export const warpRouteUndergroundLevelInput: LevelSpecInput = {
  widthTiles: undergroundWidthTiles,
  heightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSkyGrassTileDefinitions,
  actorDefinitions: [
    ...makeRouteActorDefinitions(),
    { actorId: "green-pipe", role: ActorRole.Pipe },
  ],
  tiles: [
    makeTileRun("sky", undergroundWidthTiles),
    makeTileRun("sky", undergroundWidthTiles),
    makeTileRun("sky", undergroundWidthTiles),
    makeTileRun("sky", undergroundWidthTiles),
    makeTileRun("sky", undergroundWidthTiles),
    makeTileRun("grass", undergroundWidthTiles),
  ],
  actors: [
    { entityId: "runner-1", actorId: "runner-start", x: 1, y: 4 },
    { entityId: "gate-1", actorId: "open-gate", x: 10, y: 4 },
  ],
};

export const warpRouteLevelInput: LevelSpecInput = {
  widthTiles: mainWidthTiles,
  heightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSkyGrassTileDefinitions,
  actorDefinitions: [
    ...makeRouteActorDefinitions(),
    { actorId: "green-pipe", role: ActorRole.Pipe },
  ],
  tiles: [
    makeTileRun("sky", mainWidthTiles),
    makeTileRun("sky", mainWidthTiles),
    makeTileRun("sky", mainWidthTiles),
    makeTileRun("sky", mainWidthTiles),
    makeTileRun("sky", mainWidthTiles),
    makeTileRun("grass", mainWidthTiles),
  ],
  actors: [
    { entityId: "runner-1", actorId: "runner-start", x: 1, y: 4 },
    {
      entityId: "warp-pipe-1",
      actorId: "green-pipe",
      x: 4,
      y: 4,
      targetLevelName: warpRouteUndergroundLevelName,
      targetTileX: 2,
      targetTileY: 2,
    },
    { entityId: "gate-1", actorId: "open-gate", x: 8, y: 4 },
  ],
};
