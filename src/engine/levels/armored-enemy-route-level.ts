import { ActorRole, type LevelSpecInput } from "../domain/level-spec";
import { makeTileRun, standardSurfaceTileDefinitions } from "./level-builder";

const armoredEnemyRouteWidthTiles = 12;
const armoredEnemyRouteHeightTiles = 6;

export const armoredEnemyRouteLevelInput: LevelSpecInput = {
  widthTiles: armoredEnemyRouteWidthTiles,
  heightTiles: armoredEnemyRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    {
      actorId: "shell-crab",
      role: ActorRole.ArmoredEnemy,
    },
    {
      actorId: "open-gate",
      role: ActorRole.Exit,
    },
  ],
  tiles: [
    makeTileRun("sky", armoredEnemyRouteWidthTiles),
    makeTileRun("sky", armoredEnemyRouteWidthTiles),
    makeTileRun("sky", armoredEnemyRouteWidthTiles),
    makeTileRun("sky", armoredEnemyRouteWidthTiles),
    makeTileRun("sky", armoredEnemyRouteWidthTiles),
    makeTileRun("grass", armoredEnemyRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 4,
    },
    {
      entityId: "crab-1",
      actorId: "shell-crab",
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
