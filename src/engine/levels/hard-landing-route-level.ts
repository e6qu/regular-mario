import { ActorRole, type LevelSpecInput } from "../domain/level-spec";
import {
  makeGoalTileRow,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

const hardLandingRouteWidthTiles = 12;
const hardLandingRouteHeightTiles = 16;

// A small ledge high on the left over a deep drop to a full-width floor: the
// runner walks off the ledge and falls about eleven blocks straight down, well
// past the hard-landing threshold, so the landing fires a ground quake (screen
// shake). Used to prove the hard-landing earthquake in the browser.
export const hardLandingRouteLevelInput: LevelSpecInput = {
  widthTiles: hardLandingRouteWidthTiles,
  heightTiles: hardLandingRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: [
    {
      actorId: "runner-start",
      role: ActorRole.PlayerStart,
    },
    {
      actorId: "open-gate",
      role: ActorRole.Exit,
    },
  ],
  tiles: [
    // Open sky above the ledge and the drop.
    ...Array.from({ length: 4 }, () =>
      makeTileRun("sky", hardLandingRouteWidthTiles),
    ),
    // The launch ledge: a short grass shelf on the far left, open air to its
    // right for the runner to step off into the fall.
    [
      ...makeTileRun("grass", 3),
      ...makeTileRun("sky", hardLandingRouteWidthTiles - 3),
    ],
    // The long fall.
    ...Array.from({ length: 9 }, () =>
      makeTileRun("sky", hardLandingRouteWidthTiles),
    ),
    // The gate stands on the landing floor, tucked under the launch ledge on
    // the far left — out of the fall.
    //
    // A level must have an exit, and the finish belongs in the gate's own
    // cell; but the runner leaves the ledge and drops in an arc that crosses
    // this row several tiles to the right, so a gate over there is a finish
    // the runner passes through in mid-air. It would end the route before it
    // ever lands, which is the one thing this fixture exists to show. Walking
    // back left after landing finishes it.
    makeGoalTileRow(hardLandingRouteWidthTiles, 0),
    // The landing floor.
    makeTileRun("grass", hardLandingRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 3,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 0,
      y: 14,
    },
  ],
};
