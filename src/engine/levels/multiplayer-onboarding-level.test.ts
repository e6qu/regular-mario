import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import { multiplayerOnboardingLevelInput } from "./multiplayer-onboarding-level";

describe("multiplayerOnboardingLevelInput", () => {
  it("is a full, valid shared course with a safe opening screen", () => {
    const result = makeLevelSpec(multiplayerOnboardingLevelInput);

    expect(result.ok).toBe(true);
    expect(multiplayerOnboardingLevelInput.widthTiles).toBe(64);
    expect(multiplayerOnboardingLevelInput.heightTiles).toBe(15);
    expect(multiplayerOnboardingLevelInput.tiles[11]?.slice(6, 9)).toEqual([
      "stone",
      "stone",
      "stone",
    ]);
    expect(multiplayerOnboardingLevelInput.tiles[12]?.slice(20, 22)).toEqual([
      "pipe-top-left",
      "pipe-top-right",
    ]);
    expect(
      multiplayerOnboardingLevelInput.actors.filter(
        (actor) => actor.actorId === "beetle",
      ),
    ).toHaveLength(2);
    expect(multiplayerOnboardingLevelInput.actors).toContainEqual({
      entityId: "gate-1",
      actorId: "open-gate",
      x: 56,
      y: 13,
    });
  });
});
