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
  // The finish is tile-driven: the deterministic core ends a level on contact
  // with a Goal tile, and the Exit actor is only the picture of a gate. This
  // route had the picture and no goal tile, so walking into the visible gate
  // did nothing — and it is a public multiplayer course, where a party could
  // never complete it. The goal tile sits under the gate the player can see.
  tiles: [
    makeTileRun("sky", stompRouteWidthTiles),
    makeTileRun("sky", stompRouteWidthTiles),
    makeTileRun("sky", stompRouteWidthTiles),
    makeTileRun("sky", stompRouteWidthTiles),
    [...makeTileRun("sky", 10), "gate", "sky"],
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
