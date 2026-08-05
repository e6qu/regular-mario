import { TileCollisionKind, type LevelSpecInput } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

const onboardingWidthTiles = 64;
// A normal gameplay viewport is 15×16px high. The earlier six-tile fixture
// made a 720px browser zoom the world 7×, which turned the real game into a
// sparse, giant-looking demo. Keep the course geometry but give it a canonical
// vertical playfield so local and multiplayer share the same proportions.
const onboardingHeightTiles = 15;
const onboardingSkyRows = onboardingHeightTiles - 6;
const firstPipeLeftColumn = 20;
const secondPipeLeftColumn = 44;
const exitGateColumn = 56;

/**
 * The first public co-op course: a full, readable overworld run with a safe
 * shared-screen lead-in. Hazards and enemies start beyond the opening camera,
 * while platforms, pickups, and scenery make the first frame read as a real
 * game rather than a network waiting-room fixture.
 */
export const multiplayerOnboardingLevelInput: LevelSpecInput = {
  widthTiles: onboardingWidthTiles,
  heightTiles: onboardingHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: [
    ...standardSurfaceTileDefinitions,
    // The opening pipes establish the course's visual language without
    // putting a blind obstacle in the shared party's first run.
    { tileId: "pipe-top-left", collision: TileCollisionKind.Empty },
    { tileId: "pipe-top-right", collision: TileCollisionKind.Empty },
    { tileId: "pipe-left", collision: TileCollisionKind.Empty },
    { tileId: "pipe-right", collision: TileCollisionKind.Empty },
  ],
  actorDefinitions: makeRouteActorDefinitions({
    includeItem: true,
    includePowerUp: true,
  }),
  tiles: [
    ...Array.from({ length: onboardingSkyRows }, () =>
      makeTileRun("sky", onboardingWidthTiles),
    ),
    makeTileRun("sky", onboardingWidthTiles),
    makeTileRun("sky", onboardingWidthTiles),
    [
      ...makeTileRun("sky", 6),
      ...makeTileRun("stone", 3),
      ...makeTileRun("sky", 5),
      ...makeTileRun("stone", 2),
      ...makeTileRun("sky", 9),
      ...makeTileRun("stone", 3),
      ...makeTileRun("sky", 6),
      ...makeTileRun("stone", 2),
      ...makeTileRun("sky", 28),
    ],
    [
      ...makeTileRun("sky", firstPipeLeftColumn),
      "pipe-top-left",
      "pipe-top-right",
      ...makeTileRun(
        "sky",
        secondPipeLeftColumn - firstPipeLeftColumn - 2,
      ),
      "pipe-top-left",
      "pipe-top-right",
      ...makeTileRun("sky", onboardingWidthTiles - secondPipeLeftColumn - 2),
    ],
    [
      ...makeTileRun("sky", firstPipeLeftColumn),
      "pipe-left",
      "pipe-right",
      ...makeTileRun(
        "sky",
        secondPipeLeftColumn - firstPipeLeftColumn - 2,
      ),
      "pipe-left",
      "pipe-right",
      ...makeTileRun("sky", exitGateColumn - secondPipeLeftColumn - 2),
      "gate",
      ...makeTileRun("sky", onboardingWidthTiles - exitGateColumn - 1),
    ],
    makeTileRun("grass", onboardingWidthTiles),
  ],
  actors: [
    { entityId: "runner-1", actorId: "runner-start", x: 1, y: 13 },
    { entityId: "shard-1", actorId: "star-shard", x: 7, y: 10 },
    { entityId: "spark-1", actorId: "spark-cap", x: 16, y: 10 },
    { entityId: "beetle-1", actorId: "beetle", x: 14, y: 10 },
    { entityId: "beetle-2", actorId: "beetle", x: 34, y: 10 },
    { entityId: "gate-1", actorId: "open-gate", x: 56, y: 13 },
  ],
};
