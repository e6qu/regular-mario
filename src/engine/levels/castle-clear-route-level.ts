import {
  ActorRole,
  TileCollisionKind,
  type LevelSpecInput,
} from "../domain/level-spec";
import { makeTileRun, standardSurfaceTileDefinitions } from "./level-builder";

const castleClearRouteWidthTiles = 24;
const gateColumn = 21;

// A castle with the axe (a Goal-collision gate column) a short run from the
// start, spanned by a row of castle-bridge planks. Reaching the gate triggers
// the castle-clear cinematic — the bridge chops away plank by plank, then the
// rescued friend (the princess) is revealed above the rescue message — without
// needing to traverse a full campaign castle. Wide enough that the camera frames
// the cinematic the way a real castle does. Fixture for that cinematic.
export const castleClearRouteLevelInput: LevelSpecInput = {
  widthTiles: castleClearRouteWidthTiles,
  heightTiles: 8,
  tileSizePixels: 16,
  tileDefinitions: [
    ...standardSurfaceTileDefinitions,
    { tileId: "castle-bridge", collision: TileCollisionKind.Solid },
  ],
  actorDefinitions: [
    { actorId: "runner-start", role: ActorRole.PlayerStart },
    { actorId: "open-gate", role: ActorRole.Exit },
  ],
  tiles: [
    makeTileRun("sky", castleClearRouteWidthTiles),
    makeTileRun("sky", castleClearRouteWidthTiles),
    makeTileRun("sky", castleClearRouteWidthTiles),
    // Bridge planks above the walking path (cols 5-14) — the severed bridge.
    [
      ...makeTileRun("sky", 5),
      ...makeTileRun("castle-bridge", 10),
      ...makeTileRun("sky", castleClearRouteWidthTiles - 15),
    ],
    makeTileRun("sky", castleClearRouteWidthTiles),
    // The axe: a full-height Goal-collision gate column the runner walks into.
    [...makeTileRun("sky", gateColumn), "gate", ...makeTileRun("sky", 2)],
    [...makeTileRun("sky", gateColumn), "gate", ...makeTileRun("sky", 2)],
    makeTileRun("grass", castleClearRouteWidthTiles),
  ],
  actors: [
    { entityId: "runner-1", actorId: "runner-start", x: 1, y: 6 },
    { entityId: "gate-1", actorId: "open-gate", x: gateColumn, y: 6 },
  ],
};
