import { ActorRole, type LevelSpecInput } from "../domain/level-spec";
import { makeTileRun, standardSurfaceTileDefinitions } from "./level-builder";

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
      actorId: "glide-wasp",
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
    makeTileRun("sky", flyingEnemyRouteWidthTiles),
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
      actorId: "glide-wasp",
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
