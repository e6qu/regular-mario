import { type LevelSpecInput } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

const onboardingWidthTiles = 32;
const onboardingHeightTiles = 6;

/** A short, hazard-free first shared screen for network parties to orient. */
export const multiplayerOnboardingLevelInput: LevelSpecInput = {
  widthTiles: onboardingWidthTiles,
  heightTiles: onboardingHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: makeRouteActorDefinitions({ includeItem: true }),
  tiles: [
    makeTileRun("sky", onboardingWidthTiles),
    makeTileRun("sky", onboardingWidthTiles),
    makeTileRun("sky", onboardingWidthTiles),
    makeTileRun("sky", onboardingWidthTiles),
    [...makeTileRun("sky", 18), "gate", ...makeTileRun("sky", 13)],
    makeTileRun("grass", onboardingWidthTiles),
  ],
  actors: [
    { entityId: "runner-1", actorId: "runner-start", x: 1, y: 4 },
    { entityId: "shard-1", actorId: "star-shard", x: 4, y: 1 },
    { entityId: "gate-1", actorId: "open-gate", x: 18, y: 4 },
  ],
};
