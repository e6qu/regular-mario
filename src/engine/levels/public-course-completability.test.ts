import { describe, expect, it } from "vitest";

import { makeLevelSpec, TileCollisionKind } from "../domain/level-spec";
import { requirePublicOriginalLevel } from "./public-level-catalog";

/**
 * Every public course can actually be finished.
 *
 * Finishing is tile-driven — the core ends a level on contact with a Goal
 * tile — while the Exit actor is only the picture of a gate. A course with the
 * picture and no goal tile looks complete and cannot be completed: you walk
 * into the gate and nothing happens. `enemy-stomp-route` shipped that way, as
 * one of the three courses multiplayer parties are given.
 */
describe("public course completability", () => {
  for (const levelId of [
    "first-authored",
    "pipe-route",
    "enemy-stomp-route",
  ] as const) {
    it(`${levelId} has a goal tile a player can reach`, () => {
      const level = requirePublicOriginalLevel(levelId);
      const spec = makeLevelSpec(level.levelInput);
      if (!spec.ok) {
        throw new Error(`${levelId} does not validate.`);
      }
      const goalTileIds = new Set(
        spec.value.tileDefinitions
          .filter(
            (definition) => definition.collision === TileCollisionKind.Goal,
          )
          .map((definition) => definition.tileId),
      );
      const goalCells = spec.value.tiles.flatMap((row, rowIndex) =>
        row.flatMap((tileId, columnIndex) =>
          goalTileIds.has(tileId) ? [{ rowIndex, columnIndex }] : [],
        ),
      );
      expect(
        goalCells.length,
        `${levelId} draws an exit but has no goal tile to finish on`,
      ).toBeGreaterThan(0);
    });
  }
});
