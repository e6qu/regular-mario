import { ActorRole, type LevelSpecInput } from "../domain/level-spec";
import { makeTileRun, standardSurfaceTileDefinitions } from "./level-builder";

const stompRouteWidthTiles = 12;
const stompRouteHeightTiles = 6;

export const enemyStompRouteLevelInput: LevelSpecInput = {
  widthTiles: stompRouteWidthTiles,
  heightTiles: stompRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
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
    makeTileRun("sky", stompRouteWidthTiles),
    makeTileRun("sky", stompRouteWidthTiles),
    makeTileRun("sky", stompRouteWidthTiles),
    makeTileRun("sky", stompRouteWidthTiles),
    makeTileRun("sky", stompRouteWidthTiles),
    makeTileRun("grass", stompRouteWidthTiles),
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
      x: 7,
      y: 4,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 10,
      y: 4,
    },
  ],
  enemyPatrolSpeedByEntityId: {
    "beetle-1": 0,
  },
};
