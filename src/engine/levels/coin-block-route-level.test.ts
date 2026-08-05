import { describe, expect, it } from "vitest";

import { makeLevelSpec, TileCollisionKind } from "../domain/level-spec";
import { coinBlockRouteLevelInput } from "./coin-block-route-level";

describe("coin-block route level", () => {
  it("places a goal collision tile at its visible exit", () => {
    const result = makeLevelSpec(coinBlockRouteLevelInput);
    if (!result.ok) {
      throw new Error("Expected coin-block route to validate.");
    }
    expect(result.value.tiles[13]?.[8]).toBe("gate");
    expect(
      result.value.tileDefinitions.find((tile) => tile.tileId === "gate")
        ?.collision,
    ).toBe(TileCollisionKind.Goal);
  });
});
