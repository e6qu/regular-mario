import type { LevelSpecInput } from "../domain/level-spec";
import { ActorRole } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSkyGrassTileDefinitions,
} from "./level-builder";

// A warp zone: three pipes near the start, each warping to a different world's
// beginning (smb-2-1 / smb-3-1 / smb-4-1). Two or more pipes to distinct
// smb-world starts is what raises the "WELCOME TO WARP ZONE!" wall banner above
// them (see renderWarpZoneBanner). Fixture for showing that banner without
// traversing deep into a campaign level.
export const warpZoneRouteLevelInput: LevelSpecInput = {
  widthTiles: 14,
  heightTiles: 9,
  tileSizePixels: 16,
  tileDefinitions: standardSkyGrassTileDefinitions,
  actorDefinitions: [
    ...makeRouteActorDefinitions(),
    { actorId: "green-pipe", role: ActorRole.Pipe },
  ],
  tiles: [
    ...Array.from({ length: 8 }, () => makeTileRun("sky", 14)),
    makeTileRun("grass", 14),
  ],
  actors: [
    { entityId: "runner-1", actorId: "runner-start", x: 1, y: 7 },
    {
      entityId: "warp-pipe-2",
      actorId: "green-pipe",
      x: 4,
      y: 7,
      targetLevelName: "smb-2-1",
      targetTileX: 2,
      targetTileY: 2,
    },
    {
      entityId: "warp-pipe-3",
      actorId: "green-pipe",
      x: 7,
      y: 7,
      targetLevelName: "smb-3-1",
      targetTileX: 2,
      targetTileY: 2,
    },
    {
      entityId: "warp-pipe-4",
      actorId: "green-pipe",
      x: 10,
      y: 7,
      targetLevelName: "smb-4-1",
      targetTileX: 2,
      targetTileY: 2,
    },
    { entityId: "gate-1", actorId: "open-gate", x: 12, y: 7 },
  ],
};
