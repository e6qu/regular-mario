import type { LevelSpecInput } from "../domain/level-spec";
import { ActorRole } from "../domain/level-spec";
import {
  makeGoalTileRow,
  makeRouteActorDefinitions,
  makeTileRun,
  pipeMouthTileDefinitions,
  standardSkyGrassTileDefinitions,
  withPipeMouthsAt,
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
  tileDefinitions: [
    ...standardSkyGrassTileDefinitions,
    ...pipeMouthTileDefinitions,
  ],
  actorDefinitions: [
    ...makeRouteActorDefinitions(),
    { actorId: "green-pipe", role: ActorRole.Pipe },
  ],
  tiles: [
    ...Array.from({ length: 7 }, () => makeTileRun("sky", 14)),
    withPipeMouthsAt(makeGoalTileRow(14, 12), [4, 7, 10]),
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

// Where the fixture's pipes actually go.
//
// The three pipes name world starts, which is what raises the banner, but the
// fixture shipped without any level under those names: entering a pipe warped
// the player into nothing, so the one route built to demonstrate a warp could
// not perform one. Each destination is an ordinary small room that receives
// the player at the pipe's target tile (2,2) and can be finished, so a warp
// arrives somewhere real. The rooms differ by the column their gate stands in,
// so a test can tell which world it landed in.
function makeWarpZoneDestinationLevelInput(gateColumn: number): LevelSpecInput {
  const widthTiles = 10;
  return {
    widthTiles,
    heightTiles: 7,
    tileSizePixels: 16,
    tileDefinitions: standardSkyGrassTileDefinitions,
    actorDefinitions: makeRouteActorDefinitions(),
    tiles: [
      ...Array.from({ length: 5 }, () => makeTileRun("sky", widthTiles)),
      makeGoalTileRow(widthTiles, gateColumn),
      makeTileRun("grass", widthTiles),
    ],
    actors: [
      { entityId: "runner-1", actorId: "runner-start", x: 1, y: 5 },
      { entityId: "gate-1", actorId: "open-gate", x: gateColumn, y: 5 },
    ],
  };
}

export const warpZoneDestinationLevelsByName: ReadonlyMap<
  string,
  LevelSpecInput
> = new Map([
  ["smb-2-1", makeWarpZoneDestinationLevelInput(4)],
  ["smb-3-1", makeWarpZoneDestinationLevelInput(6)],
  ["smb-4-1", makeWarpZoneDestinationLevelInput(8)],
]);
