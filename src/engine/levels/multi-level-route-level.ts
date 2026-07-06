import type { LevelSpecInput } from "../domain/level-spec";
import {
  makeRouteActorDefinitions,
  makeTileRun,
  standardSurfaceTileDefinitions,
} from "./level-builder";

function makeFinishableFlatLevelInput(options: {
  readonly gateEntityId: string;
  readonly gateTileX: number;
  readonly gateTileY: number;
}): LevelSpecInput {
  const widthTiles = 10;
  const heightTiles = 6;
  const skyRow = makeTileRun("sky", widthTiles);

  const gateRow = [...makeTileRun("sky", options.gateTileX), "gate"];
  gateRow.push(...makeTileRun("sky", widthTiles - options.gateTileX - 1));

  return {
    widthTiles,
    heightTiles,
    tileSizePixels: 16,
    tileDefinitions: standardSurfaceTileDefinitions,
    actorDefinitions: makeRouteActorDefinitions(),
    tiles: [
      skyRow,
      skyRow,
      skyRow,
      skyRow,
      skyRow,
      makeTileRun("grass", widthTiles),
    ].map((row, index) =>
      index === options.gateTileY
        ? replaceGateRow(row, options.gateTileX)
        : row,
    ),
    actors: [
      {
        entityId: "runner-1",
        actorId: "runner-start",
        x: 1,
        y: 4,
      },
      {
        entityId: options.gateEntityId,
        actorId: "open-gate",
        x: options.gateTileX,
        y: options.gateTileY,
      },
    ],
  };
}

function replaceGateRow(row: string[], gateTileX: number): string[] {
  const result = [...row];
  result[gateTileX] = "gate";

  return result;
}

export const multiLevelRouteSequence: readonly LevelSpecInput[] = [
  makeFinishableFlatLevelInput({
    gateEntityId: "gate-1",
    gateTileX: 8,
    gateTileY: 4,
  }),
  makeFinishableFlatLevelInput({
    gateEntityId: "gate-2",
    gateTileX: 6,
    gateTileY: 3,
  }),
];
