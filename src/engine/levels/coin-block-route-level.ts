import {
  ActorRole,
  TileCollisionKind,
  type LevelSpecInput,
} from "../domain/level-spec";
import { makeTileRun } from "./level-builder";

const coinBlockRouteWidthTiles = 10;
const coinBlockRouteHeightTiles = 6;

export const coinBlockRouteLevelInput: LevelSpecInput = {
  widthTiles: coinBlockRouteWidthTiles,
  heightTiles: coinBlockRouteHeightTiles,
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
    {
      tileId: "mystery-box",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "coin",
    },
  ],
  actorDefinitions: [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    {
      actorId: "coin",
      role: ActorRole.Coin,
    },
    {
      actorId: "open-gate",
      role: ActorRole.Exit,
    },
  ],
  tiles: [
    makeTileRun("sky", coinBlockRouteWidthTiles),
    makeTileRun("sky", coinBlockRouteWidthTiles),
    [
      "sky",
      "mystery-box",
      "sky",
      "sky",
      "sky",
      "sky",
      "sky",
      "sky",
      "sky",
      "sky",
    ],
    makeTileRun("sky", coinBlockRouteWidthTiles),
    makeTileRun("sky", coinBlockRouteWidthTiles),
    makeTileRun("grass", coinBlockRouteWidthTiles),
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
