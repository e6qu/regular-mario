import { ActorRole, type LevelSpecInput } from "../domain/level-spec";
import { makeTileRun, standardSurfaceTileDefinitions } from "./level-builder";

const chasingEnemyRouteWidthTiles = 12;
const chasingEnemyRouteHeightTiles = 6;

export const chasingEnemyRouteLevelInput: LevelSpecInput = {
  widthTiles: chasingEnemyRouteWidthTiles,
  heightTiles: chasingEnemyRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    {
      actorId: "spike-hunter",
      role: ActorRole.ChasingEnemy,
    },
    {
      actorId: "open-gate",
      role: ActorRole.Exit,
    },
  ],
  tiles: [
    makeTileRun("sky", chasingEnemyRouteWidthTiles),
    makeTileRun("sky", chasingEnemyRouteWidthTiles),
    makeTileRun("sky", chasingEnemyRouteWidthTiles),
    makeTileRun("sky", chasingEnemyRouteWidthTiles),
    makeTileRun("sky", chasingEnemyRouteWidthTiles),
    makeTileRun("grass", chasingEnemyRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 4,
    },
    {
      entityId: "hunter-1",
      actorId: "spike-hunter",
      x: 6,
      y: 4,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 10,
      y: 4,
    },
  ],
};
