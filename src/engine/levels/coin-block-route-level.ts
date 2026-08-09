import {
  ActorRole,
  TileCollisionKind,
  type LevelSpecInput,
} from "../domain/level-spec";
import { makeTileRun } from "./level-builder";

const coinBlockRouteWidthTiles = 10;
const coinBlockRouteHeightTiles = 15;
const coinBlockRouteSkyRows = coinBlockRouteHeightTiles - 6;

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
      tileId: "full-question-block-coin",
      collision: TileCollisionKind.Interactive,
      contentsActorId: "vglc-smb-coin",
    },
    {
      tileId: "gate",
      collision: TileCollisionKind.Goal,
    },
  ],
  actorDefinitions: [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    {
      actorId: "vglc-smb-coin",
      role: ActorRole.Coin,
    },
    {
      actorId: "open-gate",
      role: ActorRole.Exit,
    },
  ],
  tiles: [
    ...Array.from({ length: coinBlockRouteSkyRows }, () =>
      makeTileRun("sky", coinBlockRouteWidthTiles),
    ),
    makeTileRun("sky", coinBlockRouteWidthTiles),
    makeTileRun("sky", coinBlockRouteWidthTiles),
    [
      "sky",
      "full-question-block-coin",
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
    [
      ...makeTileRun("sky", 8),
      "gate",
      ...makeTileRun("sky", coinBlockRouteWidthTiles - 9),
    ],
    makeTileRun("grass", coinBlockRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 13,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 8,
      y: 13,
    },
  ],
};
