import { ActorRole, type LevelSpecInput } from "../domain/level-spec";
import {
  makeEnemyChallengeActorDefinitions,
  makeSegmentedTileRow,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

const enemyGauntletRouteWidthTiles = 30;
const enemyGauntletRouteHeightTiles = 7;

const sky = "sky";
const grass = "grass";
const stone = "stone";
const thorn = "thorn";
const gate = "gate";

function skyRow(): string[] {
  return makeTileRun(sky, enemyGauntletRouteWidthTiles);
}

export const enemyGauntletRouteLevelInput: LevelSpecInput = {
  widthTiles: enemyGauntletRouteWidthTiles,
  heightTiles: enemyGauntletRouteHeightTiles,
  tileSizePixels: 16,
  tileDefinitions: standardSurfaceTileDefinitions,
  actorDefinitions: makeEnemyChallengeActorDefinitions([
    { actorId: "glide-wasp", role: ActorRole.FlyingEnemy },
    { actorId: "spike-hunter", role: ActorRole.ChasingEnemy },
    { actorId: "shell-crab", role: ActorRole.ArmoredEnemy },
  ]),
  tiles: [
    skyRow(),
    skyRow(),
    makeSegmentedTileRow(enemyGauntletRouteWidthTiles, [
      { tile: sky, length: 10 },
      { tile: stone, length: 4 },
      { tile: sky, length: enemyGauntletRouteWidthTiles - 14 },
    ]),
    skyRow(),
    makeSegmentedTileRow(enemyGauntletRouteWidthTiles, [
      { tile: sky, length: 18 },
      { tile: stone, length: 4 },
      { tile: sky, length: enemyGauntletRouteWidthTiles - 22 },
    ]),
    makeSegmentedTileRow(enemyGauntletRouteWidthTiles, [
      { tile: sky, length: 19 },
      { tile: thorn, length: 1 },
      { tile: sky, length: 6 },
      { tile: gate, length: 1 },
      { tile: sky, length: enemyGauntletRouteWidthTiles - 27 },
    ]),
    makeSegmentedTileRow(enemyGauntletRouteWidthTiles, [
      { tile: grass, length: 12 },
      { tile: sky, length: 1 },
      { tile: grass, length: 7 },
      { tile: sky, length: 1 },
      { tile: grass, length: enemyGauntletRouteWidthTiles - 21 },
    ]),
  ],
  actors: [
    { entityId: "runner-1", actorId: "runner-start", x: 1, y: 5 },
    { entityId: "shard-1", actorId: "star-shard", x: 5, y: 4 },
    { entityId: "wasp-1", actorId: "glide-wasp", x: 10, y: 1 },
    { entityId: "spark-1", actorId: "spark-cap", x: 13, y: 4 },
    { entityId: "hunter-1", actorId: "spike-hunter", x: 22, y: 5 },
    { entityId: "crab-1", actorId: "shell-crab", x: 25, y: 5 },
    { entityId: "gate-1", actorId: "open-gate", x: 27, y: 5 },
  ],
  enemyPatrolSpeedByEntityId: {
    "hunter-1": 48,
    "crab-1": 32,
  },
};
