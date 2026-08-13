import type { LevelSpecInput } from "../domain/level-spec";
import { ActorRole, TileCollisionKind } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

const pipeRouteWidthTiles = 10;
const pipeRouteHeightTiles = 6;

export const pipeRouteLevelInput: LevelSpecInput = {
  widthTiles: pipeRouteWidthTiles,
  heightTiles: pipeRouteHeightTiles,
  tileSizePixels: 16,
  // The exit mechanic is tile-driven in the deterministic core. Keeping the
  // goal tile in this source definition makes the same route completable in
  // local play and on the authoritative multiplayer server.
  // The pipe's own art. A pipe is drawn from its TILES — the renderer never
  // draws a Pipe actor (see isRenderedActorRole) because the decoded maps paint
  // theirs as terrain. This hand-authored route placed only the actor, so its
  // warp was completely invisible: an empty field with a hole in the world.
  //
  // The mouth keeps Empty collision on purpose. The route is entered by walking
  // onto the pipe at ground level and pressing Down, so making it solid would
  // wall the player out of the mechanic the level exists to demonstrate.
  tileDefinitions: [
    ...standardSurfaceTileDefinitions,
    { tileId: "pipe-top-left", collision: TileCollisionKind.Empty },
    { tileId: "pipe-top-right", collision: TileCollisionKind.Empty },
  ],
  actorDefinitions: [
    ...makeRouteActorDefinitions(),
    {
      actorId: "green-pipe",
      role: ActorRole.Pipe,
    },
  ],
  tiles: [
    makeTileRun("sky", pipeRouteWidthTiles),
    makeTileRun("sky", pipeRouteWidthTiles),
    makeTileRun("sky", pipeRouteWidthTiles),
    makeTileRun("sky", pipeRouteWidthTiles),
    [
      ...makeTileRun("sky", 4),
      "pipe-top-left",
      "pipe-top-right",
      ...makeTileRun("sky", 2),
      "gate",
      "sky",
    ],
    makeTileRun("grass", pipeRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 1,
      y: 4,
    },
    {
      entityId: "warp-pipe-1",
      actorId: "green-pipe",
      x: 4,
      y: 4,
      targetTileX: 7,
      targetTileY: 4,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 8,
      y: 4,
    },
  ],
};
