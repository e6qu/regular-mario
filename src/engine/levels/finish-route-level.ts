import { ActorRole, type LevelSpecInput } from "../domain/level-spec";
import { makeTileRun, standardSurfaceTileDefinitions } from "./level-builder";

const finishRouteWidthTiles = 10;

export const finishRouteLevelInput: LevelSpecInput = {
  widthTiles: finishRouteWidthTiles,
  heightTiles: 6,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    {
      actorId: "open-gate",
      role: ActorRole.Exit,
    },
  ],
  tiles: [
    makeTileRun("sky", finishRouteWidthTiles),
    // A full-height flagpole column near the end: a tall goal the runner cannot
    // jump over, so reaching it always triggers the finish (and its slide).
    [...makeTileRun("sky", 8), "flagpole", "sky"],
    [...makeTileRun("sky", 8), "flagpole", "sky"],
    [...makeTileRun("sky", 8), "flagpole", "sky"],
    [...makeTileRun("sky", 8), "flagpole", "sky"],
    makeTileRun("grass", finishRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 4,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 8,
      y: 4,
    },
  ],
};
