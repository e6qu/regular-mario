// Shared scaffolding for the mechanics test suites (flame hazards, lifts,
// loop zones, aerial frenzies): a flat-floored level input, a checked
// level-spec builder, and a positioned player.

import { makeLevelSpec } from "../domain/level-spec";
import type { LevelSpec, LevelSpecInput } from "../domain/level-spec";
import type { PixelPosition } from "../domain/units";
import { makeInitialPlayerSimulationState } from "./player-state";
import type { PlayerSimulationState } from "./player-state";

export function makeFlatLevelInput(
  widthTiles: number,
  overrides: Partial<LevelSpecInput> = {},
): LevelSpecInput {
  const heightTiles = 15;
  const rows = Array.from({ length: heightTiles }, (_, rowIndex) =>
    Array.from({ length: widthTiles }, () =>
      rowIndex >= 13 ? "ground" : "empty",
    ),
  );
  return {
    widthTiles,
    heightTiles,
    tileSizePixels: 16,
    tileDefinitions: [
      { tileId: "empty", collision: "empty" },
      { tileId: "ground", collision: "solid" },
    ],
    actorDefinitions: [
      { actorId: "player", role: "player-start" },
      { actorId: "gate", role: "exit" },
    ],
    tiles: rows,
    actors: [
      { entityId: "player-1", actorId: "player", x: 1, y: 12 },
      { entityId: "exit-1", actorId: "gate", x: widthTiles - 2, y: 12 },
    ],
    ...overrides,
  };
}

export function requireMechanicsLevelSpec(input: LevelSpecInput): LevelSpec {
  const result = makeLevelSpec(input);
  if (!result.ok) {
    throw new Error(
      `expected level spec: ${result.errors.map((error) => error.message).join(", ")}`,
    );
  }
  return result.value;
}

export function makePlayerAt(x: number, y: number): PlayerSimulationState {
  const player = makeInitialPlayerSimulationState();
  return {
    ...player,
    position: { x: x as PixelPosition, y: y as PixelPosition },
  };
}
