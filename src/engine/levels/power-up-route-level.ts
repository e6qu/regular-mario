import { ActorRole, type LevelSpecInput } from "../domain/level-spec";
import {
  makeGoalTileRow,
  makeTileRun,
  standardSkyGrassTileDefinitions,
} from "./level-builder";

const powerUpRouteWidthTiles = 16;
const powerUpRouteHeightTiles = 6;

export const powerUpRouteLevelInput: LevelSpecInput = {
  widthTiles: powerUpRouteWidthTiles,
  heightTiles: powerUpRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSkyGrassTileDefinitions,
  actorDefinitions: [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    {
      actorId: "spark-cap",
      role: ActorRole.PowerUp,
    },
    {
      actorId: "beetle",
      role: ActorRole.Enemy,
    },
    {
      actorId: "open-gate",
      role: ActorRole.Exit,
    },
  ],
  tiles: [
    makeTileRun("sky", powerUpRouteWidthTiles),
    makeTileRun("sky", powerUpRouteWidthTiles),
    makeTileRun("sky", powerUpRouteWidthTiles),
    makeTileRun("sky", powerUpRouteWidthTiles),
    makeGoalTileRow(powerUpRouteWidthTiles, 14),
    makeTileRun("grass", powerUpRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 4,
    },
    {
      entityId: "spark-1",
      actorId: "spark-cap",
      x: 4,
      y: 4,
    },
    {
      entityId: "beetle-1",
      actorId: "beetle",
      x: 10,
      y: 4,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 14,
      y: 4,
    },
  ],
};
