import { ActorRole, type LevelSpecInput } from "../domain/level-spec";
import {
  makeGoalTileRow,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

const flyingEnemyRouteWidthTiles = 12;
const flyingEnemyRouteHeightTiles = 6;

export const flyingEnemyRouteLevelInput: LevelSpecInput = {
  widthTiles: flyingEnemyRouteWidthTiles,
  heightTiles: flyingEnemyRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    {
      actorId: "flutterby",
      role: ActorRole.FlyingEnemy,
    },
    {
      actorId: "open-gate",
      role: ActorRole.Exit,
    },
  ],
  tiles: [
    makeTileRun("sky", flyingEnemyRouteWidthTiles),
    makeTileRun("sky", flyingEnemyRouteWidthTiles),
    makeTileRun("sky", flyingEnemyRouteWidthTiles),
    makeTileRun("sky", flyingEnemyRouteWidthTiles),
    makeGoalTileRow(flyingEnemyRouteWidthTiles, 10),
    makeTileRun("grass", flyingEnemyRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 4,
    },
    {
      entityId: "wasp-1",
      actorId: "flutterby",
      x: 6,
      y: 2,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 10,
      y: 4,
    },
  ],
};
