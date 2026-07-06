import {
  ActorRole,
  TileCollisionKind,
  type LevelSpecInput,
} from "../domain/level-spec";

const powerUpRouteWidthTiles = 16;
const powerUpRouteHeightTiles = 6;

function makeTileRun(tileId: string, length: number): string[] {
  return Array.from({ length }, () => tileId);
}

export const powerUpRouteLevelInput: LevelSpecInput = {
  widthTiles: powerUpRouteWidthTiles,
  heightTiles: powerUpRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: [
    {
      tileId: "sky",
      collision: TileCollisionKind.Empty,
    },
    {
      tileId: "grass",
      collision: TileCollisionKind.Solid,
    },
  ],
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
    makeTileRun("sky", powerUpRouteWidthTiles),
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
