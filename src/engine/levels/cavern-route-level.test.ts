import { describe, expect, it } from "vitest";

import { makeEntityId } from "../domain/identifiers";
import { makeLevelSpec } from "../domain/level-spec";
import { cavernRouteLevelInput } from "./cavern-route-level";

function entityId(value: string) {
  const result = makeEntityId(value, "test.entityId");
  if (!result.ok) {
    throw new Error("Expected valid test entity id.");
  }
  return result.value;
}

describe("cavern route level", () => {
  it("validates through LevelSpec", () => {
    expect(makeLevelSpec(cavernRouteLevelInput).ok).toBe(true);
  });

  it("includes a one-tile floor gap (pit) the player must jump", () => {
    const result = makeLevelSpec(cavernRouteLevelInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected cavern route to validate.");
    }

    expect(result.value.tiles[5]?.[13]).toBe("sky");
    expect(result.value.tiles[5]?.[12]).toBe("grass");
    expect(result.value.tiles[5]?.[14]).toBe("grass");
  });

  it("places the goal tile and exit actor near the far right", () => {
    const result = makeLevelSpec(cavernRouteLevelInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected cavern route to validate.");
    }

    expect(result.value.tiles[4]?.[22]).toBe("gate");
    expect(
      result.value.actors.some(
        (actor) => actor.entityId === "gate-1" && actor.actorId === "open-gate",
      ),
    ).toBe(true);
  });

  it("authors a faster patrol speed for the second beetle", () => {
    const result = makeLevelSpec(cavernRouteLevelInput);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected cavern route to validate.");
    }

    expect(
      result.value.enemyPatrolSpeedByEntityId.get(entityId("beetle-2")),
    ).toBe(60);
  });
});
