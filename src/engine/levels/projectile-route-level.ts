import type { LevelSpecInput } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSkyGrassTileDefinitions,
} from "./level-builder";

const projectileRouteWidthTiles = 14;
const projectileRouteHeightTiles = 6;

export const projectileRouteLevelInput: LevelSpecInput = {
  widthTiles: projectileRouteWidthTiles,
  heightTiles: projectileRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSkyGrassTileDefinitions,
  actorDefinitions: makeRouteActorDefinitions(),
  tiles: [
    makeTileRun("sky", projectileRouteWidthTiles),
    makeTileRun("sky", projectileRouteWidthTiles),
    makeTileRun("sky", projectileRouteWidthTiles),
    makeTileRun("sky", projectileRouteWidthTiles),
    makeTileRun("sky", projectileRouteWidthTiles),
    makeTileRun("grass", projectileRouteWidthTiles),
  ],
  actors: [
    {
      entityId: "runner-1",
      actorId: "runner-start",
      x: 2,
      y: 4,
    },
    {
      entityId: "beetle-1",
      actorId: "beetle",
      x: 8,
      y: 4,
    },
    {
      entityId: "gate-1",
      actorId: "open-gate",
      x: 12,
      y: 4,
    },
  ],
};
